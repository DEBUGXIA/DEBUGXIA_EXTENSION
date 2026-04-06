/**
 * Dashboard Webview Provider
 * Shows coding analytics and progress
 */

import * as vscode from "vscode";
import { ApiClient } from "../services/apiClient";
import { StorageService } from "../services/storageService";

export class DashboardWebviewProvider implements vscode.WebviewPanelSerializer {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private static provider: DashboardWebviewProvider | undefined;
  private discoveredFiles: vscode.Uri[] = [];
  private selectedFileIndex: number = -1; // Track currently selected file in dropdown

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
      
      // Filter out test infrastructure files and temporary/demo files
      const excludePatterns = [
        /^test/i,                    // test*.py
        /test$/i,                    // *test.py
        /testfail/i,                 // testfail*.py (demo/test files)
        /demo/i,                     // demo*.py
        /sample/i,                   // sample*.py
        /^conftest/i,                // conftest.py (pytest config)
        /mock/i,                     // mock*.py
        /fixture/i,                  // fixture*.py
        /_old/i,                     // *_old.py
        /temp/i,                     // temp*.py
        /tmp/i,                      // tmp*.py
        /example/i,                  // example*.py
        /\btest\b/i,                // any file with 'test' in name
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
        // Reset selection to show latest file when showing panel
        DashboardWebviewProvider.provider.selectedFileIndex = -1;
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
    let analysisHistory = this.storageService.getAnalysisHistory();

    // Filter out test/demo files from analysis history
    const testFilePatterns = [
      /^test/i,
      /test$/i,
      /testfail/i,
      /demo/i,
      /sample/i,
      /fixture/i,
      /mock/i,
      /_old/i,
      /temp/i,
      /tmp/i,
      /example/i,
      /\btest\b/i,
    ];

    analysisHistory = analysisHistory.filter(f => {
      const fileName = f.fileName ? f.fileName.split('\\').pop()?.split('/').pop() || '' : '';
      return !testFilePatterns.some(pattern => pattern.test(fileName));
    });

    // ONLY show content if there's REAL analysis history
    const hasAnalysis = analysisHistory && analysisHistory.length > 0;
    
    // Calculate AI-driven statistics ONLY if there's analysis
    const stats = hasAnalysis ? this.calculateAIStats(analysisHistory, errorHistory) : null;
    
    // Use selected file index if set, otherwise use last file
    const fileIndex = this.selectedFileIndex >= 0 && this.selectedFileIndex < analysisHistory.length 
      ? this.selectedFileIndex 
      : analysisHistory.length - 1;
    
    const currentFile = hasAnalysis ? analysisHistory[fileIndex] : null;
    
    // Generate file list - show only analyzed error files
    let fileListHtml = "";
    
    if (hasAnalysis) {
      // Show error files from scan
      fileListHtml = analysisHistory.map((f, idx) => {
        const fileName = f.fileName ? f.fileName.split('\\').pop().split('/').pop() : `File ${idx + 1}`;
        const errorIcon = f.errorScore > 0 ? '⚠️' : '✓';
        const isSelected = idx === fileIndex ? 'selected' : '';
        return `<option value="analyzed-${idx}" ${isSelected}>${errorIcon} ${fileName}</option>`;
      }).join("");
    }

    // Generate content ONLY if there's REAL AI analysis data
    const fileInfoContent = hasAnalysis && currentFile ? `
          <!-- File Info Card -->
          <div class="file-info-card">
            <div class="file-header">
              <div class="file-icon">📄</div>
              <div class="file-details">
                <div class="file-name">${currentFile.fileName ? currentFile.fileName.split('\\').pop().split('/').pop() : "Unknown file"}</div>
                <div class="file-stats">${currentFile.lines || 0} lines | ${currentFile.functions || 0} function | ${currentFile.classes || 0} classes</div>
              </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-title">Error Score</div>
                <div class="stat-value">${stats ? stats.errorScore : 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Code Quality</div>
                <div class="stat-value">${stats ? stats.codeQualityScore : 0}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Optimization</div>
                <div class="stat-value">${stats ? stats.optimizationScore : 0}</div>
              </div>
            </div>

            <!-- Analysis Summary -->
            <div class="analysis-section">
              <div class="section-header">
                <div class="section-icon">📝</div>
                <div class="section-title">Analysis Summary</div>
              </div>
              <div class="section-text">${
                (() => {
                  let summary = currentFile.summary || "No analysis available";
                  // Show only first sentence (max 120 chars)
                  const firstSentence = summary.split(/[.!?]/)[0];
                  return firstSentence.substring(0, 120) + (firstSentence.length > 120 ? '...' : '.');
                })()
              }</div>
            </div>

            <!-- Issues Found -->
            <div class="issues-section">
              <div class="issues-header">
                <div class="section-icon">⚠️</div>
                <div class="issues-title">Issues Found (${currentFile.issues ? currentFile.issues.length : 0})</div>
              </div>
              <div class="issues-list">${
                currentFile.issues && currentFile.issues.length > 0
                  ? currentFile.issues.slice(0, 3).map((issue, idx) => {
                      let lineNum = '';
                      let issueText = '';
                      let fixText = '';
                      
                      // Handle object format with line, issue, fix
                      if (typeof issue === 'object' && issue !== null) {
                        lineNum = issue.line ? ` Line ${issue.line}` : '';
                        issueText = issue.issue || issue.message || '';
                        fixText = issue.fix ? ` → ${issue.fix}` : '';
                      } else if (typeof issue === 'string') {
                        // Parse string format like "Line X: description"
                        const lineMatch = issue.match(/Line\s+(\d+)/i);
                        lineNum = lineMatch ? ` Line ${lineMatch[1]}` : '';
                        issueText = issue.replace(/Line\s+\d+[\s:]*/i, '').trim();
                      } else {
                        issueText = String(issue);
                      }
                      
                      // Truncate text if too long
                      const maxLen = 80;
                      if (issueText.length > maxLen) {
                        issueText = issueText.substring(0, maxLen) + '...';
                      }
                      
                      return '<div class="issue-item">' + 
                        (lineNum ? '<span style="color: #60a5fa; font-weight: 600;">' + lineNum + ':</span> ' : '') + 
                        issueText + 
                        '</div>';
                    }).join("") + (currentFile.issues.length > 3 ? `<div class="issue-item" style="color: #999; padding-top: 8px;">+ ${currentFile.issues.length - 3} more issue${currentFile.issues.length > 4 ? 's' : ''}</div>` : '')
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
            <div class="empty-icon">�</div>
            <div class="empty-title">Scan Your Codebase for Errors</div>
            <div class="empty-text">Press <strong>Ctrl+Shift+Z</strong> to scan all files and detect errors using AI analysis.</div>
            <div class="empty-text" style="font-size: 12px; color: #6B7280; margin-top: 8px;">The scan will use your API key to analyze code and find all error files in your workspace.</div>
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

          .refresh-btn {
            background-color: transparent;
            border: 2px solid #6B7280;
            border-radius: 6px;
            padding: 6px 10px;
            cursor: pointer;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: all 0.2s ease;
            min-width: 40px;
            min-height: 40px;
          }

          .refresh-btn:hover {
            background-color: rgba(59, 130, 246, 0.2);
            border-color: #3b82f6;
            transform: rotate(180deg);
          }

          .refresh-btn:active {
            background-color: rgba(59, 130, 246, 0.3);
            transform: rotate(180deg) scale(0.95);
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
            line-height: 1.5;
            max-height: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
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
            line-height: 1.4;
            max-height: 40px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
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
            <div style="display: flex; gap: 12px; align-items: center;">
              <div class="issue-badge">${hasAnalysis && currentFile && currentFile.issues ? currentFile.issues.length : 0} issue${(hasAnalysis && currentFile && currentFile.issues ? currentFile.issues.length : 0) !== 1 ? 's' : ''}</div>
            </div>
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
            vscode = null;
          }

          // Refresh dashboard
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
          
          // Reset selectedFileIndex to show the newly analyzed file
          this.selectedFileIndex = -1;
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
              'All files': ['*']
            },
            title: 'Select Python file to analyze'
          });

          console.log('📋 File picker returned:', fileUri);

          if (fileUri && fileUri[0]) {
            const selectedFile = fileUri[0].fsPath;
            console.log('✅ User selected file:', selectedFile);
            
            // Trigger analysis on selected file
            console.log('📝 browse-files: Executing analyzeFile command with:', selectedFile);
            const result = await vscode.commands.executeCommand('debugxia.analyzeFile', selectedFile);
            console.log('✅ browse-files: analyzeFile executed, result:', result);
            
            // Reset selectedFileIndex to show the newly analyzed file
            this.selectedFileIndex = -1;
          } else {
            console.log('❌ browse-files: No file selected by user');
          }
        } catch (error) {
          console.error('❌ browse-files: Error in browse-files:', error);
          vscode.window.showErrorMessage(`Error browsing files: ${error}`);
        }
        break;

      case 'select-file':
        // Handle file selection from dropdown
        const analysisHistory = this.storageService.getAnalysisHistory();
        if (message.fileIndex >= 0 && message.fileIndex < analysisHistory.length) {
          const selectedFile = analysisHistory[message.fileIndex];
          console.log('📁 Selected file:', selectedFile.fileName);
          
          // Store the selected file index
          this.selectedFileIndex = message.fileIndex;
          console.log('✅ selectedFileIndex set to:', this.selectedFileIndex);
          
          // Update panel to show selected file's data
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
        console.log('🗑️ clear-analysis: Starting deletion...');
        try {
          console.log('📝 Before clear - Analysis count:', this.storageService.getAnalysisHistory().length);
          
          await this.storageService.clearAnalysisHistory();
          await this.storageService.clearErrorHistory();
          console.log('✅ clear-analysis: Storage cleared');
          console.log('📝 After clear - Analysis count:', this.storageService.getAnalysisHistory().length);
          
          // Reset selectedFileIndex
          this.selectedFileIndex = -1;
          
          // Small delay to ensure storage is updated
          await new Promise(r => setTimeout(r, 100));
          
          // Refresh dashboard HTML
          console.log('🔄 Updating dashboard view...');
          await this.update();
          console.log('✅ clear-analysis: Dashboard updated successfully');
          
          vscode.window.showInformationMessage('✅ All analyzed files deleted');
        } catch (error) {
          console.error('❌ clear-analysis: Error:', error);
          vscode.window.showErrorMessage(`Error clearing analysis: ${error}`);
        }
        break;

      case 'refresh-dashboard':
        console.log('🔄 refresh-dashboard: Refreshing dashboard');
        try {
          // Reset selectedFileIndex to show latest file
          this.selectedFileIndex = -1;
          await this.update();
          console.log('✅ refresh-dashboard: Dashboard refreshed');
        } catch (error) {
          console.error('❌ refresh-dashboard: Error:', error);
          vscode.window.showErrorMessage(`Error refreshing: ${error}`);
        }
        break;

      default:
        console.warn('⚠️ Unknown command:', message.command);
    }
  }
}

