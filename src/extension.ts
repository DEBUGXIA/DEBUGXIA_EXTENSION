/**
 * DEBUGXIA - Intelligent Code Debugging Extension
 * Main extension entry point
 */

import * as vscode from "vscode";
import * as path from "path";
import { ApiClient } from "./services/apiClient";
import { ErrorDetector } from "./services/errorDetector";
import { ErrorListProvider } from "./ui/errorListProvider";
import { ChatWebviewProvider } from "./webviews/chatWebviewProvider";
import { DashboardWebviewProvider } from "./webviews/dashboardWebviewProvider";
import { ExtensionConfig } from "./types";
import { StorageService } from "./services/storageService";
import { displayBanner, SCANNER_ACTIVE } from "./ascii";
import { AIAnalysisService } from "./services/aiAnalysisService";
import { ErrorScanner } from "./services/errorScanner";
import { loadEnvFile } from "./envLoader";

let apiClient: ApiClient;
let errorDetector: ErrorDetector;
let storageService: StorageService;
let aiAnalysisService: AIAnalysisService;
let errorScanner: ErrorScanner;
let scannerTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
  try {
    // Display DEBUGXIA banner
    console.log(displayBanner());
    console.log("🚀 Activating DEBUGXIA Extension...");

    // Load environment variables from .env file
    console.log("📂 Loading environment configuration...");
    loadEnvFile(context.extensionPath);

    // Initialize storage service
    storageService = new StorageService(context);
    console.log("✅ Storage Service initialized");

    // Get configuration
    const config = getExtensionConfig();
    console.log("📋 Configuration loaded:", { 
      apiUrl: config.apiUrl, 
      apiKey: config.apiKey ? "***configured***" : "⚠️ NOT SET",
      enableAutoAnalysis: config.enableAutoAnalysis,
      enableTerminalAnalysis: config.enableTerminalAnalysis 
    });

    if (!config.apiUrl || !config.apiKey) {
      vscode.window.showWarningMessage(
        'DEBUGXIA: API settings not configured. Some features may be limited. Check VS Code Settings > DEBUGXIA.'
      );
      console.warn("⚠️  API Configuration missing - some features will be disabled");
    }

    // Initialize services
    apiClient = new ApiClient(config.apiUrl || "http://localhost:8000", config.apiKey || "");
    aiAnalysisService = new AIAnalysisService(config.apiKey || "");
    errorDetector = new ErrorDetector();
    errorScanner = new ErrorScanner(aiAnalysisService, storageService);
    console.log("✅ API Client, AI Analysis Service, Error Detector, and Error Scanner initialized");

    // Register UI providers
    const errorListProvider = new ErrorListProvider(errorDetector);
    vscode.window.registerTreeDataProvider("errorList", errorListProvider);
    console.log("✅ Error List Provider registered");

    const chatProvider = new ChatWebviewProvider(
      context.extensionUri,
      apiClient,
      storageService
    );
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer("aiCodeMentor.chat", chatProvider)
    );
    console.log("✅ Chat Webview Provider registered");

    const dashboardProvider = new DashboardWebviewProvider(
      context.extensionUri,
      apiClient,
      storageService
    );
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(
        "aiCodeMentor.dashboard",
        dashboardProvider
      )
    );
    console.log("✅ Dashboard Webview Provider registered");

    // Register commands
    registerCommands(context, apiClient, errorDetector, errorListProvider);
    console.log("✅ Commands registered");

    // Watch active editor and terminal
    // DISABLED: watchEditorAndTerminal causes crashes, focus on dashboard only
    // watchEditorAndTerminal(context);
    // console.log("✅ Editor and Terminal watcher initialized");

    // Open scanner terminal
    // DISABLED: Scanner terminal causes issues
    // initializeScannerTerminal(context);

    // Listen to configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aiCodeMentor")) {
        const newConfig = getExtensionConfig();
        apiClient.setConfig(newConfig.apiUrl || "http://localhost:8000", newConfig.apiKey || "");
        console.log("🔄 Configuration reloaded");
      }
    });

    context.subscriptions.push(configListener);
    
    console.log("✨ DEBUGXIA Extension fully activated!");
    vscode.window.showInformationMessage("🚀 DEBUGXIA is ready! Press Ctrl+Shift+Z to analyze code.");
    
  } catch (error) {
    console.error("❌ Failed to activate extension:", error);
    vscode.window.showErrorMessage(`Extension activation failed: ${error}`);
  }
}

/**
 * Get extension configuration
 */
function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("aiCodeMentor");

  return {
    apiUrl: config.get<string>("apiUrl") || "http://localhost:8000",
    apiKey: config.get<string>("apiKey") || process.env.OPENROUTER_API_KEY || "",
    enableAutoAnalysis: config.get<boolean>("enableAutoAnalysis") ?? true,
    enableTerminalAnalysis: config.get<boolean>("enableTerminalAnalysis") ?? true,
    theme: config.get<"dark" | "light">("theme") || "dark",
    supportedLanguages: config.get<string[]>("supportedLanguages") || [
      "python",
      "javascript",
      "typescript",
      "java",
      "cpp",
      "csharp",
      "php",
      "ruby",
      "go",
      "rust",
    ],
  };
}

/**
 * Register all extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  apiClient: ApiClient,
  errorDetector: ErrorDetector,
  errorListProvider: ErrorListProvider
) {
  try {
    console.log('📋 Registering essential commands...');

    // Scan for Error Files (Ctrl+Shift+Z)
    const scanErrorFilesCmd = vscode.commands.registerCommand(
      "aiCodeMentor.openChat",
      async () => {
        try {
          console.log("🚀 Ctrl+Shift+Z: Starting error file scan...");
          
          // Show progress indicator
          const progressResult = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Window,
              title: "DEBUGXIA: Scanning for error files...",
              cancellable: false,
            },
            async (progress) => {
              try {
                // Verify API key first
                const config = getExtensionConfig();
                if (!config.apiKey) {
                  vscode.window.showErrorMessage('❌ API Key not configured! Please set OPENROUTER_API_KEY in settings.');
                  return;
                }
                
                console.log('✅ API Key found, starting scan...');
                
                // Clear previous analysis
                await storageService.clearAnalysisHistory();
                console.log('🧹 Cleared previous analysis history');
                
                // Scan for error files
                const errorFiles = await errorScanner.scanForErrors((current, total) => {
                  const percentage = Math.round((current / total) * 100);
                  progress.report({ 
                    increment: (current / total) * 100,
                    message: `Scanned ${current}/${total} files...`
                  });
                });
                
                console.log(`✅ Scan complete! Found ${errorFiles.length} files with errors`);
                
                if (errorFiles.length === 0) {
                  vscode.window.showInformationMessage('🎉 No errors found! Your codebase is clean.');
                } else {
                  vscode.window.showInformationMessage(`⚠️ Found ${errorFiles.length} file(s) with errors`);
                }
                
              } catch (error) {
                console.error('❌ Error during scan:', error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`❌ Scan failed: ${errorMsg}`);
              }
            }
          );
          
          // Show dashboard with error files
          console.log("📊 Opening dashboard with error files...");
          DashboardWebviewProvider.show(context.extensionUri, apiClient, storageService);
          
          // Wait for panel to be ready and update
          await new Promise(r => setTimeout(r, 500));
          DashboardWebviewProvider.updatePanel();
          
        } catch (error) {
          console.error("❌ Error in Ctrl+Shift+Z handler:", error);
          vscode.window.showErrorMessage(`Failed to scan: ${error}`);
        }
      }
    );

    // View Dashboard
    const viewDashboardCmd = vscode.commands.registerCommand(
      "aiCodeMentor.viewDashboard",
      () => {
        console.log("📊 Viewing Dashboard...");
        DashboardWebviewProvider.show(context.extensionUri, apiClient, storageService);
      }
    );

    // Analyze File Command
    const analyzeFileCmd = vscode.commands.registerCommand(
      "debugxia.analyzeFile",
      async (filePath?: string) => {
        try {
          console.log('📝 analyzeFileCmd triggered with filePath:', filePath);
          console.log('📊 Current analysis history:', storageService.getAnalysisHistory().length, 'entries');
          
          if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
              vscode.window.showErrorMessage("No active editor");
              return;
            }
            filePath = editor.document.fileName;
          }

          // Normalize path
          if (filePath && filePath.startsWith('file-')) {
            filePath = filePath.replace('file-', '');
          }

          console.log("🔍 Analyzing file:", filePath);
          vscode.window.showInformationMessage(`Analyzing ${path.basename(filePath)}... ⚡`);

          // Read file content
          const uri = vscode.Uri.file(filePath);
          const fileContent = await vscode.workspace.fs.readFile(uri);
          const text = new TextDecoder().decode(fileContent);

          // Get file info
          const fileName = path.basename(filePath);
          const language = path.extname(filePath).slice(1) || "text";
          const lines = text.split('\n').length;

          // Simple analysis: count functions and classes
          const functionCount = (text.match(/^(def|function|async function|class |interface |struct )/gm) || []).length;
          const classCount = (text.match(/^class /gm) || []).length;

          // Get AI analysis
          console.log("🤖 Getting AI analysis...");
          const aiAnalysis = await aiAnalysisService.analyzeCode(text, language, fileName);
          console.log("✅ AI analysis complete:", {
            errorScore: aiAnalysis.errorScore,
            codeQualityScore: aiAnalysis.codeQualityScore,
            optimizationScore: aiAnalysis.optimizationScore,
          });

          // Store complete analysis with AI results
          const analysisData = {
            fileName: filePath,
            displayName: fileName,
            language,
            lines,
            functions: functionCount,
            classes: classCount,
            // AI Analysis Results
            errorScore: aiAnalysis.errorScore,
            codeQualityScore: aiAnalysis.codeQualityScore,
            optimizationScore: aiAnalysis.optimizationScore,
            summary: aiAnalysis.summary,
            issues: aiAnalysis.issues,
            suggestions: aiAnalysis.suggestions,
            timestamp: Date.now(),
          };

          console.log("💾 Saving analysis");
          await storageService.saveAnalysis(analysisData);
          
          // Verify it was saved
          const allAnalyses = storageService.getAnalysisHistory();
          console.log(`✅ Analysis saved - total ${allAnalyses.length} in history`);
          console.log("📋 Last saved analysis:", {
            fileName: allAnalyses[allAnalyses.length - 1]?.displayName,
            errorScore: allAnalyses[allAnalyses.length - 1]?.errorScore,
            codeQualityScore: allAnalyses[allAnalyses.length - 1]?.codeQualityScore,
            optimizationScore: allAnalyses[allAnalyses.length - 1]?.optimizationScore,
          });

          // Show dashboard and refresh it with new data
          console.log("🎨 Opening dashboard...");
          DashboardWebviewProvider.show(context.extensionUri, apiClient, storageService);
          
          // Wait a moment for the panel to be ready, then update it
          await new Promise(r => setTimeout(r, 500));
          DashboardWebviewProvider.updatePanel();
          
          vscode.window.showInformationMessage(`✅ Analysis complete for ${fileName}`);
          console.log("✅ Analyze complete");

        } catch (error) {
          console.error("❌ Error analyzing file:", error);
          vscode.window.showErrorMessage(`Error: ${error}`);
        }
      }
    );

    context.subscriptions.push(scanErrorFilesCmd, viewDashboardCmd, analyzeFileCmd);
    
    // Clear All Analysis Cache Command
    const clearCacheCmd = vscode.commands.registerCommand(
      "debugxia.clearCache",
      async () => {
        try {
          console.log("🧹 Clearing analysis cache...");
          await storageService.clearAnalysisHistory();
          await storageService.clearErrorHistory();
          console.log("✅ Cache cleared");
          vscode.window.showInformationMessage("✅ Analysis cache cleared! Refresh dashboard to see changes.");
          DashboardWebviewProvider.updatePanel();
        } catch (error) {
          console.error("❌ Error clearing cache:", error);
          vscode.window.showErrorMessage(`Error: ${error}`);
        }
      }
    );
    
    context.subscriptions.push(clearCacheCmd);
    console.log('✅ Essential commands registered');

  } catch (error) {
    console.error("❌ Error registering commands:", error);
    vscode.window.showErrorMessage(`Failed to register commands: ${error}`);
  }
}

/**
 * Show explanation panel
 */
function showExplanationPanel(explanation: any) {
  const panel = vscode.window.createWebviewPanel(
    "errorExplanation",
    "AI Error Explanation",
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; 
          padding: 20px;
          background: #1e1e1e;
          color: #e0e0e0;
        }
        h2 { color: #00d4ff; margin-top: 0; }
        h3 { color: #00ffff; }
        code { 
          background: #2d2d2d; 
          padding: 2px 6px; 
          border-radius: 3px;
          color: #ce9178;
        }
        pre {
          background: #2d2d2d;
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          border-left: 3px solid #00d4ff;
        }
        .tip { 
          background: rgba(0, 212, 255, 0.1); 
          border-left: 3px solid #00d4ff;
          padding: 12px;
          margin: 10px 0;
          border-radius: 4px;
        }
        button {
          background: #00d4ff;
          color: #000;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          margin-top: 10px;
        }
        button:hover {
          background: #00ffff;
        }
      </style>
    </head>
    <body>
      <h2>🤖 ${explanation.errorType}</h2>
      <div>
        <h3>Explanation</h3>
        <p>${explanation.explanation}</p>
      </div>
      <div>
        <h3>Why This Happened?</h3>
        <p>${explanation.why}</p>
      </div>
      <div>
        <h3>Solution</h3>
        <p>${explanation.solution}</p>
      </div>
      <div>
        <h3>Example Code</h3>
        <pre><code>${explanation.exampleCode}</code></pre>
      </div>
      <div>
        <h3>💡 Tips</h3>
        ${explanation.tips.map((tip: string) => `<div class="tip">${tip}</div>`).join("")}
      </div>
    </body>
    </html>
  `;
}

/**
 * Watch editor and terminal for errors
 */
function watchEditorAndTerminal(context: vscode.ExtensionContext) {
  const config = getExtensionConfig();

  // On document change
  if (config.enableAutoAnalysis) {
    const onSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
      const errors = await errorDetector.analyzeDocument(document);
      
      // Perform AI analysis for accurate statistics
      const aiAnalysis = await aiAnalysisService.analyzeCode(
        document.getText(),
        document.languageId,
        document.fileName
      );
      
      // Save AI analysis results for dashboard statistics
      await storageService.saveAnalysis({
        fileName: document.fileName,
        language: document.languageId,
        errorScore: aiAnalysis.errorScore,
        codeQualityScore: aiAnalysis.codeQualityScore,
        optimizationScore: aiAnalysis.optimizationScore,
        summary: aiAnalysis.summary,
        issues: aiAnalysis.issues,
        suggestions: aiAnalysis.suggestions,
        errorCount: errors.length,
      });
      
      if (errors.length > 0) {
        errorDetector.highlightErrors(document, errors);

        // Log to backend
        const userId = storageService.getUserId();
        errors.forEach((error) => {
          apiClient.logError(userId, {
            language: error.language,
            errorType: error.errorType,
            errorMessage: error.errorMessage,
            severity: error.severity,
            file: error.file,
            line: error.line,
          });
        });
      }
    });

    context.subscriptions.push(onSave);
  }

  // Monitor terminal output
  if (config.enableTerminalAnalysis) {
    const terminals = vscode.window.terminals;
    terminals.forEach((terminal) => {
      console.log("Terminal available:", terminal.name);
    });
  }
}

/**
 * Initialize DEBUGXIA Scanner Terminal
 * Opens a new terminal that monitors for errors in real-time
 */
function initializeScannerTerminal(context: vscode.ExtensionContext) {
  try {
    // Create new terminal for DEBUGXIA Scanner
    scannerTerminal = vscode.window.createTerminal({
      name: "🔍 DEBUGXIA Scanner",
      hideFromUser: true,
      shellPath: undefined,
    });

    // Display welcome message
    scannerTerminal.sendText(SCANNER_ACTIVE);
    scannerTerminal.sendText("Starting error scan...");

    // Run the scanner script
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const projectPath = workspaceFolder.uri.fsPath;

      // Set environment variables
      scannerTerminal.sendText(`set DEBUGXIA_API_URL=http://localhost:3000`);
      scannerTerminal.sendText(`cd "${projectPath}"`);

      // Run scanner command (will be compiled to JS)
      scannerTerminal.sendText(`node dist/services/terminalScanner.js`);
    }

    // Track terminal closure
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === scannerTerminal) {
        scannerTerminal = undefined;
        vscode.window.showInformationMessage("DEBUGXIA Scanner terminal closed");
      }
    });

    vscode.window.showInformationMessage("🚀 DEBUGXIA Scanner initialized!");
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to initialize scanner: ${error}`);
  }
}

export function deactivate() {
  console.log("DEBUGXIA extension deactivated");
  if (scannerTerminal) {
    scannerTerminal.dispose();
  }
  errorDetector?.dispose();
}
