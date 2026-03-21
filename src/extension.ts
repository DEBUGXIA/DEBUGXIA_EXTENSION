/**
 * AI Smart Code Mentor - VS Code Extension
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

let apiClient: ApiClient;
let errorDetector: ErrorDetector;
let storageService: StorageService;
let scannerTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Display DEBUGXIA banner
  console.log(displayBanner());

  // Initialize storage service
  storageService = new StorageService(context);

  // Get configuration
  const config = getExtensionConfig();
  if (!config.apiUrl || !config.apiKey) {
    vscode.window.showWarningMessage(
      'AI Code Mentor: Please configure API settings in preferences.'
    );
  }

  // Initialize services
  apiClient = new ApiClient(config.apiUrl, config.apiKey);
  errorDetector = new ErrorDetector();

  // Register UI providers
  const errorListProvider = new ErrorListProvider(errorDetector);
  vscode.window.registerTreeDataProvider("errorList", errorListProvider);

  const chatProvider = new ChatWebviewProvider(
    context.extensionUri,
    apiClient,
    storageService
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer("aiCodeMentor.chat", chatProvider)
  );

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

  // Register commands
  registerCommands(context, apiClient, errorDetector, errorListProvider);

  // Watch active editor and terminal
  watchEditorAndTerminal(context);

  // Open scanner terminal
  initializeScannerTerminal(context);

  // Listen to configuration changes
  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("aiCodeMentor")) {
      const newConfig = getExtensionConfig();
      apiClient.setConfig(newConfig.apiUrl, newConfig.apiKey);
    }
  });

  context.subscriptions.push(configListener);
}

/**
 * Get extension configuration
 */
function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("aiCodeMentor");

  return {
    apiUrl: config.get<string>("apiUrl") || "http://localhost:8000",
    apiKey: config.get<string>("apiKey") || "",
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
  // Open AI Code Mentor Panel
  const openPanelCmd = vscode.commands.registerCommand(
    "aiCodeMentor.openPanel",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const errors = await errorDetector.analyzeDocument(editor.document);
      if (errors.length === 0) {
        vscode.window.showInformationMessage("No errors found in this file!");
        return;
      }

      // Show errors in Quick Pick
      const selected = await vscode.window.showQuickPick(
        errors.map((e) => `Line ${e.line}: ${e.errorType} - ${e.errorMessage}`),
        { placeHolder: "Select an error to analyze..." }
      );

      if (selected) {
        vscode.commands.executeCommand("aiCodeMentor.explainError");
      }
    }
  );

  // Explain Error
  const explainErrorCmd = vscode.commands.registerCommand(
    "aiCodeMentor.explainError",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const position = editor.selection.active;
      const line = editor.document.lineAt(position.line);

      vscode.window.showInformationMessage("Analyzing error... ⚡");

      try {
        const userId = storageService.getUserId();
        const explanation = await apiClient.analyzeError({
          code: line.text,
          language: editor.document.languageId,
          errorType: "syntax",
          errorMessage: line.text,
          userId,
        });

        if (explanation) {
          showExplanationPanel(explanation);
        } else {
          vscode.window.showErrorMessage("Could not analyze error");
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  // Fix Code with AI
  const fixCodeCmd = vscode.commands.registerCommand(
    "aiCodeMentor.fixCode",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showErrorMessage("Please select code to fix");
        return;
      }

      vscode.window.showInformationMessage("Fixing code with AI... ⚡");

      try {
        const userId = storageService.getUserId();
        const suggestions = await apiClient.getSuggestions(
          selectedText,
          editor.document.languageId
        );

        if (suggestions.length > 0) {
          const suggestion = suggestions[0];
          const apply = await vscode.window.showInformationMessage(
            `Apply suggestion: ${suggestion.title}?`,
            "Apply",
            "Cancel"
          );

          if (apply === "Apply") {
            await editor.edit((editBuilder) => {
              editBuilder.replace(selection, suggestion.suggestedCode);
            });

            await apiClient.applyFix(userId, suggestion.id, suggestion.suggestedCode);
            vscode.window.showInformationMessage("✅ Code fixed!");
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  // Analyze Code
  const analyzeCodeCmd = vscode.commands.registerCommand(
    "aiCodeMentor.analyzeCode",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      vscode.window.showInformationMessage("Analyzing code... ⚡");

      try {
        const suggestions = await apiClient.getSuggestions(
          editor.document.getText(),
          editor.document.languageId
        );

        if (suggestions.length > 0) {
          await vscode.commands.executeCommand("aiCodeMentor.openChat");
          vscode.window.showInformationMessage(
            `Found ${suggestions.length} suggestions!`
          );
        } else {
          vscode.window.showInformationMessage("No suggestions found");
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  // Open Chat
  const openChatCmd = vscode.commands.registerCommand(
    "aiCodeMentor.openChat",
    () => {
      ChatWebviewProvider.show(context.extensionUri, apiClient, storageService);
    }
  );

  // View Dashboard
  const viewDashboardCmd = vscode.commands.registerCommand(
    "aiCodeMentor.viewDashboard",
    () => {
      DashboardWebviewProvider.show(context.extensionUri, apiClient, storageService);
    }
  );

  context.subscriptions.push(
    openPanelCmd,
    explainErrorCmd,
    fixCodeCmd,
    analyzeCodeCmd,
    openChatCmd,
    viewDashboardCmd
  );
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
  console.log("AI Smart Code Mentor extension deactivated");
  if (scannerTerminal) {
    scannerTerminal.dispose();
  }
  errorDetector?.dispose();
}
