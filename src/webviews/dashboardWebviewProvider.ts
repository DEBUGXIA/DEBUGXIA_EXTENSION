/**
 * Dashboard Webview Provider
 * Shows coding analytics and progress
 */

import * as vscode from "vscode";
import * as path from "path";
import { ApiClient } from "../services/apiClient";
import { StorageService } from "../services/storageService";

export class DashboardWebviewProvider implements vscode.WebviewPanelSerializer {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private static provider: DashboardWebviewProvider | undefined;
  private discoveredFiles: vscode.Uri[] = [];
  private selectedFileIndex: number = -1;

  constructor(
    private extensionUri: vscode.Uri,
    private apiClient: ApiClient,
    private storageService: StorageService
  ) {}

  /**
   * Discover Python files in the workspace
   * Filters out test files, mock files, and temporary files
   */
  private async discoverPythonFiles(): Promise<vscode.Uri[]> {
    try {
      console.log('🔍 Discovering Python files in workspace...');
      const pythonFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 100);
      
      // Filter out test infrastructure files and temporary files
      // IMPORTANT: Allow files like testfail*.py and tests with actual code to run
      const excludePatterns = [
        /^test_.*\.py$/i,         // test_*.py (test infrastructure)
        /.*_test\.py$/i,          // *_test.py (test infrastructure)
        /^tests\.py$/i,           // tests.py (test infrastructure)
        /^conftest\.py$/i,        // conftest.py (pytest config)
        /mock.*\.py$/i,           // mock*.py
        /.*mock\.py$/i,           // *mock.py
        /temp.*\.py$/i,           // temp*.py
        /tmp.*\.py$/i,            // tmp*.py
        /\.test\./i,              // *.test.*
        /example.*\.py$/i,        // example*.py
        /.*example\.py$/i,        // *example.py
        /fixture.*\.py$/i,        // fixture*.py
      ];
      
      const filteredFiles = pythonFiles.filter(file => {
        const fileName = file.fsPath.split('\\').pop()?.split('/').pop() || '';
        return !excludePatterns.some(pattern => pattern.test(fileName));
      });
      
      console.log(`✅ Found ${pythonFiles.length} Python files, filtered to ${filteredFiles.length} production files`);
      return filteredFiles;
    } catch (error) {
      console.error('❌ Error discovering Python files:', error);
      return [];
    }
  }

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: any
  ): Promise<void> {
    DashboardWebviewProvider.currentPanel = webviewPanel;
    webviewPanel.webview.html = await this.getHtmlForWebview(
      webviewPanel.webview
    );
  }

  static show(
    extensionUri: vscode.Uri,
    apiClient: ApiClient,
    storageService: StorageService
  ) {
    if (DashboardWebviewProvider.currentPanel) {
      DashboardWebviewProvider.currentPanel.reveal(vscode.ViewColumn.Beside);
      // Refresh the panel with latest data
      if (DashboardWebviewProvider.provider) {
        DashboardWebviewProvider.provider.update();
      }
    } else {
      const panel = vscode.window.createWebviewPanel(
        "aiCodeMentor.dashboard",
        "DEBUGXIA",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      DashboardWebviewProvider.currentPanel = panel;
      const provider = new DashboardWebviewProvider(
        extensionUri,
        apiClient,
        storageService
      );
      DashboardWebviewProvider.provider = provider;
      provider.deserializeWebviewPanel(panel, null);

      // Register message handler
      panel.webview.onDidReceiveMessage(
        async (message) => provider.onDidReceiveMessage(message),
        null
      );

      panel.onDidDispose(
        () => {
          DashboardWebviewProvider.currentPanel = undefined;
          DashboardWebviewProvider.provider = undefined;
        },
        null
      );
    }
  }

  static updatePanel() {
    if (DashboardWebviewProvider.provider && DashboardWebviewProvider.currentPanel) {
      console.log('📊 Triggering dashboard update...');
      DashboardWebviewProvider.provider.update();
    }
  }

  /**
   * Update the webview with latest data
   */
  async update(): Promise<void> {
    try {
      if (DashboardWebviewProvider.currentPanel) {
        console.log('📝 Updating dashboard HTML...');
        console.log('📊 Analysis history length:', this.storageService.getAnalysisHistory().length);
        const html = await this.getHtmlForWebview(
          DashboardWebviewProvider.currentPanel.webview
        );
        DashboardWebviewProvider.currentPanel.webview.html = html;
        console.log('✅ Dashboard HTML updated successfully');
      } else {
        console.warn('⚠️ No dashboard panel to update');
      }
    } catch (error) {
      console.error('❌ Error updating dashboard:', error);
    }
  }

  private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const userId = this.storageService.getUserId();
    const analytics = await this.apiClient.getUserAnalytics(userId);
    const errorHistory = this.storageService.getErrorHistory();
    const analysisHistory = this.storageService.getAnalysisHistory();

    // Discover Python files in workspace
    this.discoveredFiles = await this.discoverPythonFiles();

    // ONLY show content if there's REAL analysis history
    const hasAnalysis = analysisHistory && analysisHistory.length > 0;
    
    // Calculate AI-driven statistics ONLY if there's analysis
    const stats = hasAnalysis ? this.calculateAIStats(analysisHistory, errorHistory) : null;
    const currentFile = hasAnalysis ? analysisHistory[analysisHistory.length - 1] : null;
    
    // Generate file list - combine analyzed files and discovered files
    let fileListHtml = "";
    
    if (hasAnalysis) {
      // Show analyzed files first
      fileListHtml = analysisHistory.map((f, idx) => {
        const fileName = f.fileName ? f.fileName.split('\\').pop().split('/').pop() : `File ${idx + 1}`;
        return `<option value="analyzed-${idx}">✓ ${fileName}</option>`;
      }).join("");
    }
    
    // Add discovered files
    const analyzedPaths = new Set(analysisHistory.map(f => f.fileName));
    this.discoveredFiles.forEach((file) => {
      const fsPath = file.fsPath;
      if (!analyzedPaths.has(fsPath)) {
        const fileName = fsPath.split('\\').pop()?.split('/').pop() || "Unknown";
        fileListHtml += `<option value="file-${fsPath}">📄 ${fileName}</option>`;
      }
    });

    // Get the file to display - either selected file or most recent
    let fileToDisplay = currentFile;
    if (hasAnalysis && this.selectedFileIndex >= 0 && this.selectedFileIndex < analysisHistory.length) {
      fileToDisplay = analysisHistory[this.selectedFileIndex];
      console.log('📍 Displaying selected file:', fileToDisplay.fileName);
    }

    // Generate content ONLY if there's REAL AI analysis data
    const fileInfoContent = hasAnalysis && fileToDisplay ? `
          <!-- File Info Card -->
          <div class="file-info-card">
            <div class="file-header">
              <div class="file-icon">📄</div>
              <div class="file-details">
                <div class="file-name">${fileToDisplay.fileName ? fileToDisplay.fileName.split('\\').pop().split('/').pop() : "Unknown file"}</div>
                <div class="file-stats">${fileToDisplay.lines || 0} lines | ${fileToDisplay.functions || 0} function | ${fileToDisplay.classes || 0} classes</div>
              </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-title">Error Score</div>
                <div class="stat-value">${fileToDisplay.errorScore || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Code Quality</div>
                <div class="stat-value">${fileToDisplay.codeQualityScore || 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Optimization</div>
                <div class="stat-value">${fileToDisplay.optimizationScore || 0}</div>
              </div>
            </div>

            <!-- Analysis Summary -->
            <div class="analysis-section">
              <div class="section-header">
                <div class="section-icon">${fileToDisplay.errorScore > 0 ? '⚠️' : '✅'}</div>
                <div class="section-title">${fileToDisplay.errorScore > 0 ? 'Issues Found' : 'Code Status'}</div>
              </div>
              <div class="section-text">${fileToDisplay.errorScore > 0 ? fileToDisplay.summary || "Issues detected in this file" : "✅ Code is correct! No errors found."}</div>
            </div>

            <!-- Issues Found -->
            <div class="issues-section">
              <div class="issues-header">
                <div class="section-icon">⚠️</div>
                <div class="issues-title">Issues Found (${fileToDisplay.issues ? fileToDisplay.issues.length : 0})</div>
              </div>
              <div class="issues-list">${
                fileToDisplay.issues && fileToDisplay.issues.length > 0 
                  ? fileToDisplay.issues.map(e => `<div class="issue-item">• ${e.message || e.type || "Unknown issue"}</div>`).join("")
                  : "<div class=\"issue-item\">No issues found in this file</div>"
              }</div>
            </div>

            <!-- Action Buttons -->
            <div class="action-buttons">
              <button class="action-btn" onclick="fixError()">
                <div class="action-icon" style="color: #8af782;">🐛</div>
                <div class="action-label">Fix Error</div>
              </button>
              <button class="action-btn" onclick="optimize()">
                <div class="action-icon" style="color: #d7e472;">⚡</div>
                <div class="action-label">Optimize</div>
              </button>
              <button class="action-btn" onclick="openTerminal()">
                <div class="action-icon" style="color: #adcaf0;">➜</div>
                <div class="action-label">Terminal</div>
              </button>
            </div>
          </div>
    ` : `
          <!-- Empty State -->
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <div class="empty-title">No Files Analyzed Yet</div>
            <div class="empty-text">Select a file and press Ctrl+Shift+Z to analyze it, or press Ctrl+Shift+Z with no file selected to scan workspace</div>
            <div style="margin-top: 24px; padding: 12px; background-color: rgba(2, 170, 233, 0.1); border-left: 3px solid #02AAE9; border-radius: 4px; text-align: left; max-width: 100%;">
              <div style="font-size: 12px; color: #60a5fa; font-weight: 500; margin-bottom: 6px;">💡 How to use</div>
              <div style="font-size: 12px; color: #9CA3AF; line-height: 1.5;">
                <strong>Single File:</strong> Open a file and press Ctrl+Shift+Z<br>
                <strong>Workspace:</strong> Press Ctrl+Shift+Z with no file open<br>
                Shows ALL files - both errors and clean code stats
              </div>
            </div>
          </div>
    `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DEBUGXIA</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background-color: #0f0f0f;
            background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%230f0f0f%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E');
            color: white;
            padding: 20px;
            overflow-y: auto;
            overflow-x: hidden;
          }

          .container {
            background-color: #111827;
            border: 2px solid #6B7280;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 20px;
            max-width: 100%;
          }

          .header {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
          }

          .logo-text {
            font-size: 24px;
            font-weight: 700;
            color: #02AAE9;
            letter-spacing: 2px;
            flex-shrink: 0;
          }

          .issue-badge {
            padding: 8px 16px;
            border: 2px solid #6B7280;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            color: white;
          }

          .file-selector {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            margin-top: 12px;
          }

          .folder-icon {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          }

          .file-selector-label {
            font-weight: 500;
            font-size: 14px;
            color: white;
            letter-spacing: 0.3px;
            white-space: nowrap;
          }

          .file-select-wrap {
            margin-right: 20px;
            width: 50%;
            display: flex;
            align-items: center;
          }

          .file-select {
            border: 2px solid white;
            color: white;
            padding: 6px 8px;
            border-radius: 6px;
            width: 120px;
            font-weight: 500;
            font-size: 14px;
            background-color: transparent;
            cursor: pointer;
          }

          .file-select option {
            background-color: #111827;
            color: white;
          }

          .browse-btn {
            display: flex;
            flex-direction: row;
            align-items: center;
            border: 2px solid #6B7280;
            border-radius: 6px;
            padding: 6px 8px;
            gap: 6px;
            cursor: pointer;
            background-color: transparent;
            color: white;
            font-weight: 500;
            font-size: 14px;
            margin-right: 8px;
          }

          .browse-btn:hover {
            background-color: rgba(107, 114, 128, 0.2);
          }

          .trash-btn {
            background-color: #111827;
            border: 2px solid #6B7280;
            border-radius: 6px;
            padding: 6px 10px;
            cursor: pointer;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.2s ease;
            min-width: 44px;
            min-height: 44px;
          }

          .trash-btn:hover {
            background-color: #dc2626;
            border-color: #ef4444;
            transform: scale(1.05);
          }

          .trash-btn:active {
            background-color: #b91c1c;
            transform: scale(0.95);
          }

          .file-info-card {
            background-color: #0f0f0f;
            border: 2px solid #6B7280;
            border-radius: 12px;
            padding: 12px 16px;
            margin-top: 20px;
          }

          .file-header {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 20px;
            margin-top: 20px;
          }

          .file-icon {
            width: 24px;
            height: 24px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .file-details {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .file-name {
            font-weight: 500;
            font-size: 20px;
            color: #f5f5f5;
            letter-spacing: 0.3px;
          }

          .file-stats {
            font-weight: 500;
            font-size: 14px;
            color: #9CA3AF;
            letter-spacing: 0.3px;
          }

          .stats-grid {
            display: flex;
            flex-direction: row;
            gap: 12px;
            margin-top: 32px;
          }

          .stat-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #1f2937;
            border: 2px solid #6B7280;
            border-radius: 10px;
            padding: 12px 16px;
            flex: 1;
          }

          .stat-title {
            font-weight: 500;
            font-size: 13px;
            color: #D1D5DB;
            letter-spacing: 0.3px;
            margin-bottom: 8px;
          }

          .stat-value {
            font-weight: 600;
            font-size: 32px;
            color: #2563eb;
            letter-spacing: 0.3px;
          }

          .analysis-section {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            margin-top: 20px;
          }

          .section-header {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 20px;
          }

          .section-icon {
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .section-title {
            font-weight: 500;
            font-size: 13px;
            color: #60a5fa;
            letter-spacing: 0.3px;
          }

          .section-text {
            font-weight: 500;
            font-size: 14px;
            color: #9CA3AF;
            letter-spacing: 0.3px;
          }

          .issues-section {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            margin-top: 20px;
          }

          .issues-header {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 20px;
          }

          .issues-title {
            font-weight: 500;
            font-size: 13px;
            color: #f87171;
            letter-spacing: 0.3px;
          }

          .action-buttons {
            display: flex;
            flex-direction: row;
            gap: 12px;
            margin-bottom: 20px;
            margin-top: 20px;
          }

          .action-btn {
            background-color: #1f2937;
            border: 2px solid #6B7280;
            border-radius: 8px;
            padding: 12px 16px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            flex: 1;
            transition: all 0.2s ease;
          }

          .action-btn:hover {
            border-color: #9CA3AF;
            background-color: #374151;
          }

          .action-icon {
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .action-label {
            font-weight: 600;
            font-size: 13px;
            color: #2563eb;
            letter-spacing: 0.3px;
          }

          ::-webkit-scrollbar {
            width: 6px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: #6B7280;
            border-radius: 3px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: #9CA3AF;
          }

          .issues-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            width: 100%;
          }

          .issue-item {
            font-weight: 400;
            font-size: 13px;
            color: #D1D5DB;
            padding: 6px 0;
            letter-spacing: 0.3px;
          }

          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            padding: 80px 20px;
            text-align: center;
            border: 2px dashed #6B7280;
            border-radius: 12px;
            margin-top: 20px;
            background-color: rgba(107, 114, 128, 0.05);
          }

          .empty-icon {
            font-size: 48px;
            opacity: 0.6;
          }

          .empty-title {
            font-size: 18px;
            font-weight: 600;
            color: #D1D5DB;
            letter-spacing: 0.3px;
          }

          .empty-text {
            font-size: 13px;
            color: #9CA3AF;
            max-width: 300px;
            letter-spacing: 0.3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="logo-text">DEBUGXIA</div>
            <div class="issue-badge">${errorHistory.length} issue${errorHistory.length !== 1 ? 's' : ''}</div>
          </div>

          <!-- File Selector -->
          <div class="file-selector">
            <div class="folder-icon">📁</div>
            <div class="file-selector-label">Select File :</div>
            <div class="file-select-wrap">
              <select class="file-select">
                <option value="">-- Select a file to analyze --</option>
                ${fileListHtml}
              </select>
            </div>
            <button class="browse-btn" onclick="browseFiles()">
              <span>🔍</span>
              <span>Browse</span>
            </button>
            <button class="trash-btn" onclick="clearAnalysis()">🗑️</button>
          </div>

          ${fileInfoContent}
        </div>

        <script>
          console.log('🔧 Dashboard script loading...');
          
          let vscode;
          try {
            vscode = acquireVsCodeApi();
            console.log('✅ VS Code API acquired successfully');
          } catch (error) {
            console.error('❌ Failed to acquire VS Code API:', error);
          }

          // Attach file select dropdown handler immediately (not waiting for DOMContentLoaded)
          function attachFileSelectListener() {
            const fileSelect = document.querySelector('.file-select');
            if (fileSelect) {
              console.log('📌 Attaching event listener to file select');
              fileSelect.addEventListener('change', function() {
                const value = this.value;
                console.log('📁 File selected:', value);
                
                if (value.startsWith('analyzed-')) {
                  // Analyzed file selected
                  const fileIndex = parseInt(value.replace('analyzed-', ''));
                  console.log('✓ Selected analyzed file index:', fileIndex);
                  vscode.postMessage({
                    command: 'select-file',
                    fileIndex: fileIndex
                  });
                } else if (value.startsWith('file-')) {
                  // New file selected for analysis
                  const filePath = value.replace('file-', '');
                  console.log('🔄 Analyzing new file:', filePath);
                  vscode.postMessage({
                    command: 'analyze-new-file',
                    filePath: filePath
                  });
                }
              });
            } else {
              console.warn('⚠️ File select element not found');
            }
          }
          
          // Attach immediately and also wait for DOM ready as backup
          attachFileSelectListener();
          document.addEventListener('DOMContentLoaded', attachFileSelectListener);

          // Browse files - opens file picker
          function browseFiles() {
            console.log('📁 browseFiles() called');
            if (!vscode) {
              console.error('❌ VS Code API not available');
              alert('Extension not ready. Try reloading VS Code.');
              return;
            }
            console.log('📤 Sending browse-files message...');
            vscode.postMessage({
              command: 'browse-files',
              type: 'python'
            });
            console.log('✅ Message sent');
          }

          // Fix error action
          function fixError() {
            console.log('🐛 fixError() called');
            vscode.postMessage({
              command: 'fix-error'
            });
          }

          // Optimize code action
          function optimize() {
            console.log('⚡ optimize() called');
            vscode.postMessage({
              command: 'optimize-code'
            });
          }

          // Open terminal action
          function openTerminal() {
            console.log('➜ openTerminal() called');
            vscode.postMessage({
              command: 'open-terminal'
            });
          }

          // Clear analysis - delete all history
          function clearAnalysis() {
            console.log('🗑️ clearAnalysis() called');
            const confirmed = confirm('🗑️ Delete all analysis? This cannot be undone.');
            if (confirmed) {
              console.log('✅ User confirmed - sending clear-analysis command');
              vscode.postMessage({
                command: 'clear-analysis'
              });
            } else {
              console.log('❌ User cancelled delete');
            }
          }

          // Handle message from extension
          window.addEventListener('message', event => {
            const message = event.data;
            console.log('Dashboard received:', message);
          });

          console.log('DEBUGXIA Dashboard loaded with full functionality');
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Calculate AI-driven statistics from analysis history
   * Returns accurate summary metrics based on actual AI analysis
   */
  /**
   * Calculate AI-driven statistics from analysis history
   * ONLY call this when there's real analysis data available
   */
  private calculateAIStats(analysisHistory: any[], errorHistory: any[]) {
    // This function should ONLY be called when analysisHistory.length > 0
    if (analysisHistory.length === 0) {
      return null; // NO FALLBACK VALUES - only real data
    }

    // Get the most recent analysis
    const recentAnalysis = analysisHistory[analysisHistory.length - 1];

    // Only return stats if we have real score data
    const hasScoreData = 
      (recentAnalysis.errorScore !== undefined && recentAnalysis.errorScore !== null) ||
      (recentAnalysis.codeQualityScore !== undefined && recentAnalysis.codeQualityScore !== null) ||
      (recentAnalysis.optimizationScore !== undefined && recentAnalysis.optimizationScore !== null);

    if (!hasScoreData) {
      return null; // No score data available, don't show stats
    }

    // Return only the scores that exist in the analysis data
    return {
      errorScore: recentAnalysis.errorScore || 0,
      codeQualityScore: recentAnalysis.codeQualityScore || 0,
      optimizationScore: recentAnalysis.optimizationScore || 0,
    };
  }

  /**
   * Handle messages from the webview
   */
  protected async onDidReceiveMessage(message: any): Promise<void> {
    console.log('💬 Dashboard received message:', message.command);
    console.log('📋 Message details:', JSON.stringify(message));

    switch (message.command) {
      case 'analyze-new-file':
        // Handle new file analysis from dropdown selection
        console.log('🔄 analyze-new-file: Analyzing file from dropdown:', message.filePath);
        try {
          const result = await vscode.commands.executeCommand('debugxia.analyzeFile', message.filePath);
          console.log('✅ analyze-new-file: Analysis executed, result:', result);
        } catch (error) {
          console.error('❌ analyze-new-file: Error analyzing file:', error);
          vscode.window.showErrorMessage(`Error analyzing file: ${error}`);
        }
        break;

      case 'browse-files':
        // Open file picker for Python files
        console.log('🔍 browse-files: Opening file picker...');
        try {
          const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
              'Python files': ['py'],
              'JavaScript/TypeScript': ['js', 'ts'],
              'All files': ['*']
            },
            title: 'Select file to analyze'
          });

          console.log('📋 File picker returned:', fileUri);

          if (fileUri && fileUri[0]) {
            const selectedFile = fileUri[0].fsPath;
            console.log('✅ User selected file:', selectedFile);
            
            try {
              // Show analysis in progress
              vscode.window.showInformationMessage(`Analyzing ${path.basename(selectedFile)}...`, {
                modal: false,
                detail: 'Please wait while we analyze this file.'
              });
              
              // Trigger analysis on selected file
              console.log('📝 browse-files: Executing analyzeFile command with:', selectedFile);
              const result = await vscode.commands.executeCommand('debugxia.analyzeFile', selectedFile);
              console.log('✅ browse-files: analyzeFile executed, result:', result);
            } catch (analysisError) {
              console.error('❌ Error during file analysis:', analysisError);
              vscode.window.showErrorMessage(`Analysis failed: ${analysisError}`);
            }
          } else {
            console.log('❌ browse-files: No file selected by user');
            vscode.window.showInformationMessage('No file selected');
          }
        } catch (error) {
          console.error('❌ browse-files: Error in browse-files:', error);
          vscode.window.showErrorMessage(`Error browsing files: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;

      case 'select-file':
        // Handle file selection from dropdown
        const analysisHistory = this.storageService.getAnalysisHistory();
        if (message.fileIndex >= 0 && message.fileIndex < analysisHistory.length) {
          const selectedFile = analysisHistory[message.fileIndex];
          console.log('✅ Selected file:', selectedFile.fileName);
          this.selectedFileIndex = message.fileIndex;
          // Refresh dashboard to show this file's stats
          await this.update();
        }
        break;

      case 'fix-error':
        console.log('Fix error requested');
        vscode.window.showInformationMessage('Opening AI fix suggestions...');
        break;

      case 'optimize-code':
        console.log('Optimize code requested');
        vscode.window.showInformationMessage('Generating optimization suggestions...');
        break;

      case 'open-terminal':
        console.log('Opening terminal');
        vscode.window.showInformationMessage('Opening terminal...');
        break;

      case 'clear-analysis':
        console.log('🗑️ clear-analysis: Clearing analysis history');
        try {
          await this.storageService.clearAnalysisHistory();
          await this.storageService.clearErrorHistory();
          console.log('✅ clear-analysis: Storage cleared');
          
          // Small delay to ensure storage is updated
          await new Promise(r => setTimeout(r, 100));
          
          // Refresh dashboard
          await this.update();
          console.log('✅ clear-analysis: Dashboard refreshed');
          
          vscode.window.showInformationMessage('✅ All analysis cleared');
        } catch (error) {
          console.error('❌ clear-analysis: Error:', error);
          vscode.window.showErrorMessage(`Error clearing analysis: ${error}`);
        }
        break;

      default:
        console.warn('⚠️ Unknown command:', message.command);
    }
  }
}

