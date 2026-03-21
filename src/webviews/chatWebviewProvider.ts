/**
 * DEBUGXIA - Chat Webview Provider
 * Provides intelligent code debugging and error analysis inside VS Code
 */

import * as vscode from "vscode";
import { ApiClient } from "../services/apiClient";
import { StorageService } from "../services/storageService";
import { ContextDetector, CodeContext } from "../services/contextDetector";
import { AIAnalysisService, CodeAnalysis } from "../services/aiAnalysisService";
import { ErrorDetector } from "../services/errorDetector";

export class ChatWebviewProvider implements vscode.WebviewPanelSerializer {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private aiAnalysisService: AIAnalysisService;
  private errorDetector: ErrorDetector;
  private currentContext: CodeContext | null = null;
  private currentAnalysis: CodeAnalysis | null = null;
  private errorFiles: Array<{ context: CodeContext; analysis: CodeAnalysis }> = [];
  private selectedErrorFileIndex: number = 0;
  private errorFileCache: Map<string, { context: CodeContext; analysis: CodeAnalysis }> = new Map();
  private lastScanTime: number = 0;
  private scanCacheDuration: number = 5 * 60 * 1000; // 5 minute cache
  private availableFiles: Array<{ path: string; name: string }> = [];
  private analysisMode: "single" | "multi" = "single"; // Fast mode: analyze single file only

  constructor(
    private extensionUri: vscode.Uri,
    private apiClient: ApiClient,
    private storageService: StorageService
  ) {
    this.aiAnalysisService = new AIAnalysisService();
    this.errorDetector = new ErrorDetector();
  }

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: any
  ): Promise<void> {
    ChatWebviewProvider.currentPanel = webviewPanel;
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Get available files quickly and send to UI
    setTimeout(async () => {
      console.log("⏱️ Loading available files for quick selection");
      this.availableFiles = await this.getAvailableFilesQuickly();
      
      // Send file list to webview for selector
      webviewPanel.webview.postMessage({
        command: "fileList",
        data: {
          files: this.availableFiles,
        },
      });
      
      // Auto-analyze current file
      await this.analyzeSelectedFile(webviewPanel, this.availableFiles[0]?.path || "");
    }, 300);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "selectAndAnalyze") {
        console.log(`📁 [FAST MODE] Analyzing single file: ${message.filePath}`);
        await this.analyzeSelectedFile(webviewPanel, message.filePath);
      } else if (message.command === "openFilePicker") {
        console.log("📂 Opening file picker dialog...");
        await this.openFilePicker(webviewPanel);
      } else if (message.command === "fixErrors") {
        console.log("🐛 Fix Errors requested");
        this.redirectToWebPlatform("fix-errors", webviewPanel);
      } else if (message.command === "optimizeCode") {
        console.log("⚡ Optimize Code requested");
        this.redirectToWebPlatform("optimize", webviewPanel);
      } else if (message.command === "fixTerminalErrors") {
        console.log("⚠️ Fix Terminal Errors requested");
        this.redirectToWebPlatform("terminal-errors", webviewPanel);
      }
    });
  }

  /**
   * Get available files quickly (open files + current folder files)
   * FAST: No workspace scan - only get files we can access immediately
   */
  private async getAvailableFilesQuickly(): Promise<Array<{ path: string; name: string }>> {
    try {
      const availableFiles: Array<{ path: string; name: string }> = [];
      const seenPaths = new Set<string>();

      // 1. Add currently open editor
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const path = activeEditor.document.uri.fsPath;
        const name = activeEditor.document.fileName.split(/[\\/]/).pop() || "Untitled";
        if (!seenPaths.has(path)) {
          availableFiles.push({ path, name });
          seenPaths.add(path);
        }
      }

      // 2. Add all open editors
      vscode.window.visibleTextEditors.forEach(editor => {
        const path = editor.document.uri.fsPath;
        const name = editor.document.fileName.split(/[\\/]/).pop() || "Untitled";
        if (!seenPaths.has(path) && editor.document.languageId !== "plaintext") {
          availableFiles.push({ path, name });
          seenPaths.add(path);
        }
      });

      // 3. Add workspace files from cache (if any)
      for (const cachedFile of this.errorFileCache.values()) {
        const path = cachedFile.context.filePath;
        if (!seenPaths.has(path)) {
          availableFiles.push({ path, name: cachedFile.context.fileName });
          seenPaths.add(path);
        }
      }

      console.log(`⚡ [FAST MODE] Found ${availableFiles.length} available files to analyze`);
      return availableFiles;
    } catch (error) {
      console.error("❌ Error getting available files:", error);
      return [];
    }
  }

  /**
   * Analyze SINGLE file - FAST MODE (instant results)
   */
  private async analyzeSelectedFile(webviewPanel: vscode.WebviewPanel, filePath: string): Promise<void> {
    try {
      if (!filePath) {
        webviewPanel.webview.postMessage({
          command: "error",
          text: "No file selected. Please open a code file.",
        });
        return;
      }

      // Show loading
      webviewPanel.webview.postMessage({ command: "loading" });
      
      console.log(`🚀 [FAST MODE] Analyzing single file: ${filePath}`);
      
      // Open the document
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const content = document.getText();
      const language = document.languageId;
      const fileName = document.fileName.split(/[\\/]/).pop() || "Unknown";

      // Quick analysis
      console.log(`⚡ Performing AI analysis...`);
      const analysis = await this.aiAnalysisService.analyzeCode(content, language, fileName);

      // Create context
      const fileContext: CodeContext = {
        fileName,
        fileContent: content,
        filePath,
        language,
        projectName: "Current Project",
      };

      this.currentContext = fileContext;
      this.currentAnalysis = analysis;

      // Cache it
      this.errorFileCache.set(filePath, { context: fileContext, analysis });

      // Send result to webview
      webviewPanel.webview.postMessage({
        command: "analysis",
        data: {
          fileName,
          summary: ContextDetector.getCodeSummary(content, language),
          analysis,
          mode: "single",
        },
      });

      console.log(`✅ [FAST MODE] Analysis complete for: ${fileName}`);
    } catch (error) {
      console.error("❌ Error analyzing file:", error);
      webviewPanel.webview.postMessage({
        command: "error",
        text: `Error analyzing file: ${error}`,
      });
    }
  }

  /**
   * Open file picker dialog to let user browse and select files
   */
  private async openFilePicker(webviewPanel: vscode.WebviewPanel): Promise<void> {
    try {
      console.log("📂 Opening VS Code file picker...");
      
      // Get workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        webviewPanel.webview.postMessage({
          command: "error",
          text: "No workspace opened. Please open a folder first.",
        });
        return;
      }

      // Open file picker dialog
      const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0].uri,
        filters: {
          "Code Files": ["py", "js", "ts", "tsx", "jsx", "java", "cpp", "c", "h", "hpp", "cs", "php", "rb", "go", "rs", "m", "mm", "swift", "kt", "lua"],
          "All Files": ["*"]
        },
        title: "Select a file to analyze"
      });

      if (!fileUris || fileUris.length === 0) {
        console.log("⚠️ File picker cancelled");
        return;
      }

      const selectedFilePath = fileUris[0].fsPath;
      console.log(`✅ File selected: ${selectedFilePath}`);

      // Update UI with selected file
      webviewPanel.webview.postMessage({
        command: "fileSelected",
        data: {
          path: selectedFilePath,
          name: selectedFilePath.split(/[\\/]/).pop() || selectedFilePath,
        },
      });

      // Analyze the selected file
      await this.analyzeSelectedFile(webviewPanel, selectedFilePath);
    } catch (error) {
      console.error("❌ Error in file picker:", error);
      webviewPanel.webview.postMessage({
        command: "error",
        text: `Error opening file picker: ${error}`,
      });
    }
  }

  /**
   * Analyze current file - with smart error file fallback (finds ALL error files)
   */
  private async analyzeCurrentFile(webviewPanel: vscode.WebviewPanel): Promise<void> {
    try {
      console.log("🔍 [analyzeCurrentFile] Starting analysis...");
      console.log("📂 [analyzeCurrentFile] Scanning ENTIRE workspace for all error files...");
      
      // ALWAYS scan for ALL error files in workspace, regardless of active editor
      this.errorFiles = await this.findAllErrorFiles();
      
      if (this.errorFiles.length === 0) {
        console.warn("⚠️ [analyzeCurrentFile] No error files found in workspace");
        webviewPanel.webview.postMessage({
          command: "error",
          text: "✅ No errors found! Your code looks good. All files in workspace are correct!",
        });
        return;
      }

      console.log(`🎯 Found ${this.errorFiles.length} files with errors`);

      // Set current to first error file
      this.selectedErrorFileIndex = 0;
      this.currentContext = this.errorFiles[0].context;
      this.currentAnalysis = this.errorFiles[0].analysis;

      // Send all error files to webview
      webviewPanel.webview.postMessage({
        command: "analysis",
        data: {
          totalErrors: this.errorFiles.length,
          errorFiles: this.errorFiles.map((ef, idx) => ({
            index: idx,
            fileName: ef.context.fileName,
            summary: ContextDetector.getCodeSummary(ef.context.fileContent, ef.context.language),
            analysis: ef.analysis,
          })),
          selectedIndex: this.selectedErrorFileIndex,
        },
      });
    } catch (error) {
      console.error("❌ Error analyzing files:", error);
      webviewPanel.webview.postMessage({
        command: "error",
        text: `Error scanning workspace: ${error}`,
      });
    }
  }

  /**
   * Find ALL files with errors in workspace (multi-folder support - MANDATORY)
   */
  private async findAllErrorFiles(): Promise<Array<{ context: CodeContext; analysis: CodeAnalysis }>> {
    try {
      // Get workspace folders (support multi-root workspaces)
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      console.log(`🌍 WORKSPACE ANALYSIS STARTING`);
      console.log(`📁 Workspace Folders: ${workspaceFolders.length}`);
      workspaceFolders.forEach((folder, idx) => {
        console.log(`   [${idx + 1}] FOLDER: "${folder.name}" at ${folder.uri.fsPath}`);
      });

      // For first scan, ignore cache - ALWAYS scan all folders
      const isFirstScan = this.lastScanTime === 0;
      const now = Date.now();
      
      if (!isFirstScan && this.errorFileCache.size > 0 && (now - this.lastScanTime) < this.scanCacheDuration) {
        console.log(`⚡ Using cached error files: ${this.errorFileCache.size} files`);
        return Array.from(this.errorFileCache.values());
      }

      if (isFirstScan) {
        console.log(`🆕 FIRST SCAN - Scanning ALL folders...`);
      }

      // Result: Map folder -> errors
      const allErrorFiles: Array<{ context: CodeContext; analysis: CodeAnalysis; folderName: string }> = [];

      // Scan ALL workspace folders
      for (const folder of workspaceFolders) {
        console.log(`\n📂 ═══ SCANNING FOLDER: "${folder.name}" ═══`);
        const folderErrors = await this.scanFolderForErrors(folder);
        console.log(`✅ Done - Found ${folderErrors.length} error files in "${folder.name}"`);
        
        // Tag each error with its folder name
        for (const errorFile of folderErrors) {
          allErrorFiles.push({
            ...errorFile,
            folderName: folder.name,
          });
        }
      }

      // Get current active editor folder for prioritization
      const currentEditor = vscode.window.activeTextEditor;
      const currentFolder = currentEditor ? this.getFileFolder(currentEditor.document.uri, workspaceFolders) : null;
      const currentFolderName = currentFolder?.name;
      console.log(`\n👉 CURRENT FOLDER: "${currentFolderName || 'None'}"`);

      // Separate current folder files from cross-folder files
      const currentFolderFiles: Array<{ context: CodeContext; analysis: CodeAnalysis }> = [];
      const crossFolderFiles: Array<{ context: CodeContext; analysis: CodeAnalysis }> = [];

      for (const fileInfo of allErrorFiles) {
        const isCurrentFolder = fileInfo.folderName === currentFolderName;
        
        if (isCurrentFolder) {
          // Current folder - no prefix
          currentFolderFiles.push({
            context: fileInfo.context,
            analysis: fileInfo.analysis,
          });
        } else {
          // Cross-folder - add folder prefix
          crossFolderFiles.push({
            context: {
              ...fileInfo.context,
              fileName: `[${fileInfo.folderName}] ${fileInfo.context.fileName}`,
            },
            analysis: fileInfo.analysis,
          });
        }
      }

      // Combine: current folder first, then cross-folder
      const finalResults = [...currentFolderFiles, ...crossFolderFiles];

      this.lastScanTime = now;
      this.errorFileCache.clear();
      for (const file of finalResults) {
        this.errorFileCache.set(file.context.filePath, file);
      }

      console.log(`\n✨ ══════════ SCAN RESULTS ══════════ ✨`);
      console.log(`📊 TOTAL ERROR FILES: ${finalResults.length}`);
      console.log(`   Current folder (${currentFolderName}): ${currentFolderFiles.length} files`);
      console.log(`   Cross-folder: ${crossFolderFiles.length} files`);
      for (const folderObj of workspaceFolders) {
        const folderCount = allErrorFiles.filter(f => f.folderName === folderObj.name).length;
        if (folderCount > 0) {
          console.log(`     • ${folderObj.name}: ${folderCount} files`);
        }
      }
      console.log(`═════════════════════════════════════════\n`);
      
      return finalResults;
    } catch (error) {
      console.error("❌ Error finding error files:", error);
      return [];
    }
  }

  /**
   * Scan a specific workspace folder for errors
   */
  private async scanFolderForErrors(
    folder: vscode.WorkspaceFolder
  ): Promise<Array<{ context: CodeContext; analysis: CodeAnalysis }>> {
    try {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(
          folder,
          "**/*.{py,js,ts,jsx,tsx,java,cpp,csharp,php,rb,go,rs,c,h,hpp,cc,cxx,m,mm,swift,kt,lua}"
        ),
        "**/node_modules/**"
      );

      console.log(`   📂 Checking ${files.length} code files in "${folder.name}"...`);
      const errorFiles: Array<{ context: CodeContext; analysis: CodeAnalysis }> = [];
      const processedFiles = new Set<string>();

      const errorFilePatterns = [
        /test.*fail/i,
        /fail.*/i,
        /error.*/i,
        /bug.*/i,
        /broken/i,
        /issue.*/i,
        /problem.*/i,
        /crash.*/i,
        /exception.*/i,
        /defect.*/i,
        /debug.*/i,
        /todo/i,
        /fixme/i,
        /hack/i,
        /deprecated/i,
      ];

      const isLikelyErrorFile = (fileName: string): boolean => {
        return errorFilePatterns.some(pattern => pattern.test(fileName));
      };

      let errorCount = 0;
      let processedCount = 0;
      for (const file of files) {
        const fileName = file.fsPath.split("\\").pop() || file.fsPath;
        if (processedFiles.has(file.fsPath)) continue;

        processedCount++;
        if (processedCount % 20 === 0) {
          console.log(`      📊 Checked ${processedCount}/${files.length} files...`);
        }

        try {
          const document = await vscode.workspace.openTextDocument(file);
          const errors = await this.errorDetector.analyzeDocument(document);
          const hasErrors = errors.length > 0;
          const matchesPattern = isLikelyErrorFile(fileName);

          if (hasErrors || matchesPattern) {
            processedFiles.add(file.fsPath);
            const content = document.getText();
            const language = document.languageId;

            const fileContext: CodeContext = {
              fileName,
              fileContent: content,
              filePath: file.fsPath,
              language,
              projectName: folder.name, // Store the actual folder name
            };

            const analysis = await this.aiAnalysisService.analyzeCode(
              content,
              language,
              fileName
            );

            errorFiles.push({ context: fileContext, analysis });
            this.errorFileCache.set(file.fsPath, { context: fileContext, analysis });
            errorCount++;
            
            console.log(`      ✅ [${errorCount}] Found in "${folder.name}": ${fileName}`);
          }
        } catch (fileError) {
          // Skip files that can't be processed
        }
      }

      console.log(`   🎯 Total error files found in "${folder.name}": ${errorFiles.length}`);
      return errorFiles;
    } catch (error) {
      console.error(`❌ Error scanning folder ${folder.name}:`, error);
      return [];
    }
  }

  /**
   * Get the folder that contains a file
   */
  private getFileFolder(
    fileUri: vscode.Uri,
    folders: vscode.WorkspaceFolder[]
  ): vscode.WorkspaceFolder | null {
    for (const folder of folders) {
      if (fileUri.fsPath.startsWith(folder.uri.fsPath)) {
        return folder;
      }
    }
    return null;
  }

  /**
   * Redirect to web platform
   */
  private redirectToWebPlatform(
    action: string,
    webviewPanel: vscode.WebviewPanel
  ): void {
    if (!this.currentContext || !this.currentAnalysis) {
      vscode.window.showErrorMessage("No code to analyze. Please open a file first.");
      return;
    }

    const encodedCode = encodeURIComponent(this.currentContext.fileContent);
    const encodedFileName = encodeURIComponent(this.currentContext.fileName);
    const webUrl = `http://localhost:3000/${action}?code=${encodedCode}&file=${encodedFileName}&language=${this.currentContext.language}`;

    vscode.env.openExternal(vscode.Uri.parse(webUrl));
  }

  static show(
    extensionUri: vscode.Uri,
    apiClient: ApiClient,
    storageService: StorageService
  ) {
    try {
      console.log("🐛 DEBUGXIA - Opening analysis panel");

      if (ChatWebviewProvider.currentPanel) {
        console.log("📌 Revealing existing panel");
        ChatWebviewProvider.currentPanel.reveal(vscode.ViewColumn.Beside);
      } else {
        console.log("✨ Creating new webview panel");
        const panel = vscode.window.createWebviewPanel(
          "debugxia.analysis",
          "DEBUGXIA",
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            enableForms: true,
          }
        );

        ChatWebviewProvider.currentPanel = panel;
        const provider = new ChatWebviewProvider(
          extensionUri,
          apiClient,
          storageService
        );

        provider.deserializeWebviewPanel(panel, null);

        panel.onDidDispose(
          () => {
            console.log("🗑️ Analysis panel closed");
            ChatWebviewProvider.currentPanel = undefined;
          },
          null
        );
      }
    } catch (error) {
      console.error("❌ Error opening DEBUGXIA:", error);
      vscode.window.showErrorMessage(`Failed to open DEBUGXIA: ${error}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DEBUGXIA - Advanced Code Debugging</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #141829 100%);
            color: #e0e0e0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow hidden;
          }

          .header {
            padding: 20px;
            border-bottom: 1px solid rgba(0, 212, 255, 0.2);
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 212, 255, 0.05) 100%);
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .logo {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: linear-gradient(135deg, #00d4ff 0%, #0088cc 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: 700;
            color: #000;
          }

          .header h1 {
            font-size: 18px;
            font-weight: 700;
            background: linear-gradient(135deg, #00d4ff 0%, #00ffff 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            flex: 1;
          }

          .error-count {
            font-size: 12px;
            background: rgba(0, 212, 255, 0.2);
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid rgba(0, 212, 255, 0.3);
            color: #00d4ff;
          }

          .content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .loading-state {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 16px;
          }

          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(0, 212, 255, 0.2);
            border-top-color: #00d4ff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .cards-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            overflow-y: auto;
            max-height: 200px;
            max-width: 100%;
            padding: 12px 8px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(0, 212, 255, 0.15);
            border-radius: 8px;
            margin-bottom: 16px;
            align-content: flex-start;
          }

          .card-tab {
            padding: 8px 14px;
            background: rgba(0, 212, 255, 0.08);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            transition: all 0.3s ease;
            color: rgba(224, 224, 224, 0.7);
            flex-shrink: 0;
          }

          .card-tab:hover {
            border-color: rgba(0, 212, 255, 0.6);
            background: rgba(0, 212, 255, 0.15);
            color: #e0e0e0;
            transform: translateY(-2px);
          }

          .card-tab.active {
            background: linear-gradient(135deg, rgba(0, 212, 255, 0.3) 0%, rgba(0, 174, 239, 0.2) 100%);
            border-color: #00d4ff;
            color: #00d4ff;
            font-weight: 600;
            box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
          }

          .file-card {
            background: rgba(0, 212, 255, 0.08);
            border: 1px solid rgba(0, 212, 255, 0.25);
            border-radius: 12px;
            padding: 16px;
            display: none;
            animation: slideUp 0.4s ease-out;
          }

          .file-card.show {
            display: block;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .file-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }

          .file-icon {
            font-size: 24px;
          }

          .file-info {
            flex: 1;
          }

          .file-name {
            font-size: 14px;
            font-weight: 600;
            color: #00d4ff;
            word-break: break-all;
          }

          .file-summary {
            font-size: 12px;
            color: rgba(224, 224, 224, 0.6);
            margin-top: 4px;
          }

          .scores-section {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin: 16px 0;
          }

          .score-card {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(0, 212, 255, 0.15);
            border-radius: 10px;
            padding: 14px;
            text-align: center;
            transition: all 0.3s ease;
          }

          .score-card:hover {
            border-color: rgba(0, 212, 255, 0.4);
            background: rgba(0, 212, 255, 0.08);
          }

          .score-label {
            font-size: 11px;
            color: rgba(224, 224, 224, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }

          .score-value {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
          }

          .score-bar {
            width: 100%;
            height: 5px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            overflow: hidden;
          }

          .score-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.6s ease;
          }

          .score-error .score-value { color: #ff6b6b; }
          .score-error .score-fill { background: linear-gradient(90deg, #ff6b6b, #ff8787); }

          .score-quality .score-value { color: #ffa500; }
          .score-quality .score-fill { background: linear-gradient(90deg, #ffa500, #ffb84d); }

          .score-optimization .score-value { color: #51cf66; }
          .score-optimization .score-fill { background: linear-gradient(90deg, #51cf66, #69db7c); }

          .actions-section {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin-top: 16px;
          }

          .action-button {
            padding: 14px 12px;
            border: 1px solid rgba(0, 212, 255, 0.3);
            background: rgba(0, 212, 255, 0.08);
            color: #00d4ff;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
          }

          .action-button:hover {
            background: rgba(0, 212, 255, 0.15);
            border-color: #00d4ff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 212, 255, 0.15);
          }

          .action-button:active {
            transform: translateY(0);
          }

          .action-icon {
            font-size: 20px;
          }

          .error-message {
            background: rgba(255, 107, 107, 0.1);
            border: 1px solid rgba(255, 107, 107, 0.3);
            color: #ff8787;
            padding: 14px;
            border-radius: 8px;
            font-size: 13px;
            display: none;
          }

          .error-message.show {
            display: block;
            animation: shake 0.4s ease;
          }

          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
          }

          ::-webkit-scrollbar {
            width: 8px;
            height: 6px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: rgba(0, 212, 255, 0.25);
            border-radius: 4px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 212, 255, 0.4);
          }

          .cards-tabs::-webkit-scrollbar {
            height: 6px;
          }

          .cards-tabs::-webkit-scrollbar-thumb {
            background: rgba(0, 212, 255, 0.35);
          }

          .cards-tabs::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 212, 255, 0.55);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">⚡</div>
          <h1>DEBUGXIA</h1>
          <div class="error-count" id="errorCount">0 errors</div>
        </div>

        <div class="content">
          <div class="loading-state" id="loadingState">
            <div class="loading-spinner"></div>
            <div>Analyzing code...</div>
          </div>

          <div class="error-message" id="errorMessage"></div>

          <!-- PROMINENT FILE SELECTOR WITH BROWSE & REMOVE BUTTONS -->
          <div style="display: flex; gap: 8px; margin-bottom: 16px; align-items: center;">
            <label for="fileSelector" style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;">📁 SELECT FILE:</label>
            <select id="fileSelector" style="flex: 1; padding: 10px 12px; background: rgba(0, 212, 255, 0.08); border: 1px solid rgba(0, 212, 255, 0.4); color: #00d4ff; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; appearance: none; background-image: url('data:image/svg+xml;charset=utf-8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%2200d4ff%22><path d=%22M5 7l5 5 5-5z%22/></svg>'); background-repeat: no-repeat; background-position: right 8px center; background-size: 18px; padding-right: 32px;">
              <option value="" style="background: #1e1e1e; color: #888;">-- Choose a file to analyze --</option>
            </select>
            <button id="browseButton" style="padding: 10px 14px; background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 174, 239, 0.1)); border: 1px solid rgba(0, 212, 255, 0.5); color: #00d4ff; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; white-space: nowrap; transition: all 0.3s ease;" title="Browse all files in workspace">
              🔍 Browse
            </button>
            <button id="removeButton" style="padding: 10px 12px; background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 107, 107, 0.1)); border: 1px solid rgba(255, 107, 107, 0.5); color: #ff8787; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; white-space: nowrap; transition: all 0.3s ease;" title="Remove selected file from list">
              ✕ Remove
            </button>
          </div>

          <div id="cardsContainer">
            <div id="cardsContent"></div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let currentAnalysis = null;
          let currentFileName = '';

          // File selector change event
          document.addEventListener('DOMContentLoaded', () => {
            const fileSelector = document.getElementById('fileSelector');
            const browseButton = document.getElementById('browseButton');
            
            if (fileSelector) {
              fileSelector.addEventListener('change', (e) => {
                const selectedPath = e.target.value;
                if (selectedPath) {
                  console.log('📁 User selected file:', selectedPath);
                  vscode.postMessage({ command: 'selectAndAnalyze', filePath: selectedPath });
                }
              });
            }

            if (browseButton) {
              browseButton.addEventListener('click', () => {
                console.log('🔍 Browse button clicked');
                vscode.postMessage({ command: 'openFilePicker' });
              });
              
              // Add hover effect
              browseButton.addEventListener('mouseover', () => {
                browseButton.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 174, 239, 0.2))';
                browseButton.style.borderColor = '#00d4ff';
                browseButton.style.boxShadow = '0 0 12px rgba(0, 212, 255, 0.3)';
              });
              
              browseButton.addEventListener('mouseout', () => {
                browseButton.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 174, 239, 0.1))';
                browseButton.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                browseButton.style.boxShadow = 'none';
              });
            }

            // Remove button handler
            const removeButton = document.getElementById('removeButton');
            if (removeButton) {
              removeButton.addEventListener('click', () => {
                const fileSelector = document.getElementById('fileSelector');
                if (fileSelector && fileSelector.value) {
                  const selectedIndex = fileSelector.selectedIndex;
                  const selectedFile = fileSelector.options[selectedIndex].text;
                  
                  if (selectedIndex > 0) { // Don't allow removing the placeholder option
                    console.log('🗑️ Removing file from list:', selectedFile);
                    fileSelector.remove(selectedIndex);
                    
                    // Select first option after removal
                    fileSelector.selectedIndex = 0;
                    
                    // Show notification
                    showNotification(selectedFile + ' removed from list');
                  } else {
                    showNotification('Please select a file to remove');
                  }
                } else {
                  showNotification('No file selected to remove');
                }
              });
              
              // Add hover effect
              removeButton.addEventListener('mouseover', () => {
                removeButton.style.background = 'linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 107, 107, 0.2))';
                removeButton.style.borderColor = '#ff8787';
                removeButton.style.boxShadow = '0 0 12px rgba(255, 107, 107, 0.3)';
              });
              
              removeButton.addEventListener('mouseout', () => {
                removeButton.style.background = 'linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 107, 107, 0.1))';
                removeButton.style.borderColor = 'rgba(255, 107, 107, 0.5)';
                removeButton.style.boxShadow = 'none';
              });
            }
          });

          window.addEventListener('message', (event) => {
            const message = event.data;
            console.log('Message received:', message.command);

            if (message.command === 'fileList') {
              // Populate file selector dropdown
              const fileSelector = document.getElementById('fileSelector');
              if (fileSelector && message.data.files && message.data.files.length > 0) {
                const currentOptions = fileSelector.innerHTML;
                message.data.files.forEach(file => {
                  const option = document.createElement('option');
                  option.value = file.path;
                  option.textContent = file.name;
                  fileSelector.appendChild(option);
                });
                console.log('✅ Populated file selector with ' + message.data.files.length + ' files');
                
                // Auto-select first file
                if (message.data.files.length > 0) {
                  fileSelector.value = message.data.files[0].path;
                  fileSelector.dispatchEvent(new Event('change'));
                }
              }
            } else if (message.command === 'fileSelected') {
              // File was selected from file picker
              const fileSelector = document.getElementById('fileSelector');
              const selectedFile = message.data;
              
              console.log('✅ File selected from picker:', selectedFile.name);
              
              if (fileSelector) {
                // Check if file is already in dropdown
                let optionExists = false;
                for (const option of fileSelector.options) {
                  if (option.value === selectedFile.path) {
                    optionExists = true;
                    break;
                  }
                }
                
                // Add to dropdown if not already there
                if (!optionExists) {
                  const option = document.createElement('option');
                  option.value = selectedFile.path;
                  option.textContent = selectedFile.name;
                  fileSelector.appendChild(option);
                  console.log('📝 Added new file to selector');
                }
                
                // Select it
                fileSelector.value = selectedFile.path;
              }
            } else if (message.command === 'analysis') {
              // Single file analysis result
              displaySingleFileAnalysis(message.data);
            } else if (message.command === 'loading') {
              showLoading();
            } else if (message.command === 'error') {
              showError(message.text);
            }
          });

          function displaySingleFileAnalysis(data) {
            const loadingState = document.getElementById('loadingState');
            const errorMessage = document.getElementById('errorMessage');
            const cardsContainer = document.getElementById('cardsContainer');

            loadingState.style.display = 'none';
            errorMessage.classList.remove('show');
            cardsContainer.style.display = 'block';

            currentAnalysis = data.analysis;
            currentFileName = data.fileName;

            // Update error count
            const analysis = data.analysis;
            const errorCount = analysis.issues ? analysis.issues.length : 0;
            document.getElementById('errorCount').textContent = \`\${errorCount} issue\${errorCount !== 1 ? 's' : ''}\`;

            // Create single card for this file
            const cardsContent = document.getElementById('cardsContent');
            cardsContent.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'file-card show';
            
            card.innerHTML = \`
              <div class="file-header">
                <div class="file-icon">📄</div>
                <div class="file-info">
                  <div class="file-name">\${data.fileName}</div>
                  <div class="file-summary">\${data.summary}</div>
                </div>
              </div>

              <div class="scores-section">
                <div class="score-card score-error">
                  <div class="score-label">Error Score</div>
                  <div class="score-value">\${Math.round(analysis.errorScore || 0)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${analysis.errorScore || 0}%"></div>
                  </div>
                </div>

                <div class="score-card score-quality">
                  <div class="score-label">Code Quality</div>
                  <div class="score-value">\${Math.round(analysis.codeQualityScore || 0)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${analysis.codeQualityScore || 0}%"></div>
                  </div>
                </div>

                <div class="score-card score-optimization">
                  <div class="score-label">Optimization</div>
                  <div class="score-value">\${Math.round(analysis.optimizationScore || 0)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${analysis.optimizationScore || 0}%"></div>
                  </div>
                </div>
              </div>

              <div style="margin-top: 14px;">
                <h3 style="font-size: 13px; color: #00d4ff; margin-bottom: 8px;">📋 Analysis Summary</h3>
                <p style="font-size: 12px; color: #aaa; margin-bottom: 12px;">\${analysis.summary || 'No summary available'}</p>
              </div>

              \${analysis.issues && analysis.issues.length > 0 ? \`
                <div style="margin-top: 14px;">
                  <h3 style="font-size: 13px; color: #ff8787; margin-bottom: 8px;">⚠️ Issues Found (\${analysis.issues.length})</h3>
                  <ul style="font-size: 11px; color: #aaa; line-height: 1.6; padding-left: 16px;">
                    \${analysis.issues.slice(0, 5).map(issue => \`<li>\${issue}</li>\`).join('')}
                    \${analysis.issues.length > 5 ? \`<li>... and \${analysis.issues.length - 5} more</li>\` : ''}
                  </ul>
                </div>
              \` : ''}

              <div class="actions-section" style="margin-top: 14px;">
                <button class="action-button" onclick="handleAction('fixErrors')">
                  <span class="action-icon">🐛</span>
                  <span>Fix Errors</span>
                </button>
                <button class="action-button" onclick="handleAction('optimizeCode')">
                  <span class="action-icon">⚡</span>
                  <span>Optimize</span>
                </button>
                <button class="action-button" onclick="handleAction('fixTerminalErrors')">
                  <span class="action-icon">⚠️</span>
                  <span>Terminal</span>
                </button>
              </div>
            \`;

            cardsContent.appendChild(card);
            console.log('✅ [FAST MODE] Analysis displayed for: ' + data.fileName);
          }

          function showLoading() {
            const loadingState = document.getElementById('loadingState');
            loadingState.style.display = 'flex';
          }

          function handleAction(action) {
            console.log('Action:', action);
            vscode.postMessage({ command: action });
          }

          function showError(message) {
            const errorElement = document.getElementById('errorMessage');
            const loadingState = document.getElementById('loadingState');
            const cardsContainer = document.getElementById('cardsContainer');

            loadingState.style.display = 'none';
            cardsContainer.style.display = 'none';
            errorElement.textContent = message;
            errorElement.classList.add('show');
          }

          function showNotification(message) {
            // Create a simple notification that disappears after 2 seconds
            const notification = document.createElement('div');
            notification.style.cssText = "position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 174, 239, 0.1)); border: 1px solid rgba(0, 212, 255, 0.4); color: #00d4ff; padding: 12px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 16px rgba(0, 212, 255, 0.2); animation: slideIn 0.3s ease-out;";
            notification.textContent = message;
            document.body.appendChild(notification);
            
            // Remove after 2 seconds
            setTimeout(() => {
              notification.style.animation = 'slideOut 0.3s ease-in';
              setTimeout(() => notification.remove(), 300);
            }, 2000);
          }
        </script>
        
        <style>
          @keyframes slideIn {
            from {
              transform: translateX(400px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideOut {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(400px);
              opacity: 0;
            }
          }
        </style>
      </body>
      </html>
    `;
  }
}
