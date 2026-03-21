/**
 * CodeAssist AI - Chat Webview Provider
 * Provides AI code analysis and assistance inside VS Code
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

    // Analyze current file when panel opens - with a small delay to ensure editor context is ready
    setTimeout(() => {
      console.log("⏱️ Triggering analysis after panel initialization");
      this.analyzeCurrentFile(webviewPanel);
    }, 500);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "analyze") {
        console.log("📊 Analyze command received");
        await this.analyzeCurrentFile(webviewPanel);
      } else if (message.command === "selectFile") {
        console.log(`📁 Select file: ${message.index}`);
        this.selectedErrorFileIndex = message.index;
        if (this.errorFiles[message.index]) {
          this.currentContext = this.errorFiles[message.index].context;
          this.currentAnalysis = this.errorFiles[message.index].analysis;
          
          // Send selected file to webview
          webviewPanel.webview.postMessage({
            command: "selectFile",
            data: {
              index: message.index,
              fileName: this.currentContext.fileName,
              summary: ContextDetector.getCodeSummary(
                this.currentContext.fileContent,
                this.currentContext.language
              ),
              analysis: this.currentAnalysis,
            },
          });
        }
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
   * Find ALL files with errors in workspace
   */
  private async findAllErrorFiles(): Promise<Array<{ context: CodeContext; analysis: CodeAnalysis }>> {
    try {
      // Get all code files in workspace
      const files = await vscode.workspace.findFiles(
        "**/*.{py,js,ts,jsx,tsx,java,cpp,csharp,php,rb,go,rs,c}",
        "**/node_modules/**"
      );

      console.log(`📂 Scanning ${files.length} files for errors...`);
      const errorFiles: Array<{ context: CodeContext; analysis: CodeAnalysis }> = [];

      // Check each file for errors
      for (const file of files) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const errors = await this.errorDetector.analyzeDocument(document);

          if (errors.length > 0) {
            console.log(`✅ Found ${errors.length} errors in: ${file.fsPath}`);

            // Get file context
            const content = document.getText();
            const fileName = file.fsPath.split("\\").pop() || file.fsPath;
            const language = document.languageId;

            const fileContext: CodeContext = {
              fileName,
              fileContent: content,
              filePath: file.fsPath,
              language,
              projectName: vscode.workspace.name || "Unknown Project",
            };

            // Get analysis
            const analysis = await this.aiAnalysisService.analyzeCode(
              content,
              language,
              fileName
            );

            errorFiles.push({ context: fileContext, analysis });
          }
        } catch (fileError) {
          console.warn(`⚠️ Could not process file: ${file.fsPath}`, fileError);
        }
      }

      console.log(`🎯 Total error files found: ${errorFiles.length}`);
      return errorFiles;
    } catch (error) {
      console.error("❌ Error finding error files:", error);
      return [];
    }
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
      console.log("� CodeAssist AI - Opening analysis panel");

      if (ChatWebviewProvider.currentPanel) {
        console.log("📌 Revealing existing panel");
        ChatWebviewProvider.currentPanel.reveal(vscode.ViewColumn.Beside);
      } else {
        console.log("✨ Creating new webview panel");
        const panel = vscode.window.createWebviewPanel(
          "codeassist.analysis",
          "CodeAssist AI",
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
      console.error("❌ Error opening CodeAssist AI:", error);
      vscode.window.showErrorMessage(`Failed to open CodeAssist AI: ${error}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CodeAssist AI - Code Analysis</title>
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
            gap: 8px;
            overflow-x: auto;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(0, 212, 255, 0.15);
          }

          .card-tab {
            padding: 8px 12px;
            background: rgba(0, 212, 255, 0.08);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
            transition: all 0.3s ease;
            color: rgba(224, 224, 224, 0.6);
          }

          .card-tab:hover {
            border-color: rgba(0, 212, 255, 0.4);
            background: rgba(0, 212, 255, 0.12);
          }

          .card-tab.active {
            background: rgba(0, 212, 255, 0.25);
            border-color: #00d4ff;
            color: #00d4ff;
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
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">⚡</div>
          <h1>CodeAssist AI</h1>
          <div class="error-count" id="errorCount">0 errors</div>
        </div>

        <div class="content">
          <div class="loading-state" id="loadingState">
            <div class="loading-spinner"></div>
            <div>Analyzing code...</div>
          </div>

          <div class="error-message" id="errorMessage"></div>

          <div id="cardsContainer">
            <div class="cards-tabs" id="cardsTabs"></div>
            <div id="cardsContent"></div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let errorFiles = [];
          let selectedIndex = 0;

          window.addEventListener('message', (event) => {
            const message = event.data;
            console.log('Message received:', message.command);

            if (message.command === 'analysis') {
              displayAnalysis(message.data);
            } else if (message.command === 'selectFile') {
              updateSelectedFile(message.data);
            } else if (message.command === 'error') {
              showError(message.text);
            }
          });

          function displayAnalysis(data) {
            const loadingState = document.getElementById('loadingState');
            const errorMessage = document.getElementById('errorMessage');
            const cardsContainer = document.getElementById('cardsContainer');

            loadingState.style.display = 'none';
            errorMessage.classList.remove('show');
            cardsContainer.style.display = 'block';

            errorFiles = data.errorFiles;
            selectedIndex = data.selectedIndex;

            // Update error count
            document.getElementById('errorCount').textContent = \`\${data.totalErrors} error file\${data.totalErrors !== 1 ? 's' : ''}\`;

            // Create tabs
            const tabsContainer = document.getElementById('cardsTabs');
            tabsContainer.innerHTML = '';
            errorFiles.forEach((file, idx) => {
              const tab = document.createElement('div');
              tab.className = 'card-tab' + (idx === selectedIndex ? ' active' : '');
              tab.textContent = file.fileName;
              tab.onclick = () => selectFile(idx);
              tabsContainer.appendChild(tab);
            });

            // Create cards
            const cardsContent = document.getElementById('cardsContent');
            cardsContent.innerHTML = '';
            errorFiles.forEach((file, idx) => {
              const card = createCard(file, idx, idx === selectedIndex);
              cardsContent.appendChild(card);
            });
          }

          function createCard(file, index, isSelected) {
            const div = document.createElement('div');
            div.className = 'file-card' + (isSelected ? ' show' : '');
            div.id = 'card-' + index;

            div.innerHTML = \`
              <div class="file-header">
                <div class="file-icon">📄</div>
                <div class="file-info">
                  <div class="file-name">\${file.fileName}</div>
                  <div class="file-summary">\${file.summary}</div>
                </div>
              </div>

              <div class="scores-section">
                <div class="score-card score-error">
                  <div class="score-label">Error Score</div>
                  <div class="score-value">\${Math.round(100 - file.analysis.errorScore)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${100 - file.analysis.errorScore}%"></div>
                  </div>
                </div>

                <div class="score-card score-quality">
                  <div class="score-label">Code Quality</div>
                  <div class="score-value">\${Math.round(file.analysis.codeQualityScore)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${file.analysis.codeQualityScore}%"></div>
                  </div>
                </div>

                <div class="score-card score-optimization">
                  <div class="score-label">Optimization</div>
                  <div class="score-value">\${Math.round(file.analysis.optimizationScore)}</div>
                  <div class="score-bar">
                    <div class="score-fill" style="width: \${file.analysis.optimizationScore}%"></div>
                  </div>
                </div>
              </div>

              <div class="actions-section">
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

            return div;
          }

          function selectFile(index) {
            console.log('Selecting file:', index);
            selectedIndex = index;
            
            // Update tabs
            const tabs = document.querySelectorAll('.card-tab');
            tabs.forEach((tab, idx) => {
              tab.classList.toggle('active', idx === index);
            });

            // Update cards
            const cards = document.querySelectorAll('.file-card');
            cards.forEach((card, idx) => {
              card.classList.toggle('show', idx === index);
            });

            // Notify extension
            vscode.postMessage({ command: 'selectFile', index });
          }

          function updateSelectedFile(data) {
            console.log('File selected in extension:', data.index);
            selectedIndex = data.index;
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

          // Request analysis on load
          window.addEventListener('load', () => {
            console.log('CodeAssist AI loaded - requesting analysis');
            vscode.postMessage({ command: 'analyze' });
          });
        </script>
      </body>
      </html>
    `;
  }
}
