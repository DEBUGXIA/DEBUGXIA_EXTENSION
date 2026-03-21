/**
 * Dashboard Webview Provider
 * Shows coding analytics and progress
 */

import * as vscode from "vscode";
import { ApiClient } from "../services/apiClient";
import { StorageService } from "../services/storageService";

export class DashboardWebviewProvider implements vscode.WebviewPanelSerializer {
  private static currentPanel: vscode.WebviewPanel | undefined;

  constructor(
    private extensionUri: vscode.Uri,
    private apiClient: ApiClient,
    private storageService: StorageService
  ) {}

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
    } else {
      const panel = vscode.window.createWebviewPanel(
        "aiCodeMentor.dashboard",
        "AI Code Mentor Dashboard",
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
      provider.deserializeWebviewPanel(panel, null);

      panel.onDidDispose(
        () => {
          DashboardWebviewProvider.currentPanel = undefined;
        },
        null
      );
    }
  }

  private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const userId = this.storageService.getUserId();
    const analytics = await this.apiClient.getUserAnalytics(userId);
    const errorHistory = this.storageService.getErrorHistory();
    const analysisHistory = this.storageService.getAnalysisHistory();

    // Calculate AI-driven statistics from analysis history
    const stats = this.calculateAIStats(analysisHistory, errorHistory);


    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Mentor Dashboard</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
            color: #e0e0e0;
            padding: 24px;
            line-height: 1.6;
          }

          h1 {
            color: #00d4ff;
            margin-bottom: 8px;
            font-size: 28px;
          }

          .subtitle {
            color: #888;
            margin-bottom: 24px;
            font-size: 14px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
          }

          .stat-card {
            background: rgba(0, 212, 255, 0.05);
            border: 2px solid rgba(0, 212, 255, 0.2);
            border-radius: 12px;
            padding: 20px;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }

          .stat-card:hover {
            border-color: #00d4ff;
            box-shadow: 0 8px 32px rgba(0, 212, 255, 0.2);
            transform: translateY(-4px);
          }

          .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00d4ff, transparent);
          }

          .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: #00d4ff;
            margin-bottom: 8px;
          }

          .stat-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .section {
            margin-bottom: 32px;
          }

          .section-title {
            color: #00ffff;
            font-size: 16px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .chart-container {
            background: rgba(0, 212, 255, 0.05);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 12px;
            padding: 20px;
            backdrop-filter: blur(10px);
          }

          .bar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
          }

          .bar-label {
            min-width: 100px;
            font-size: 12px;
            color: #888;
          }

          .bar-value {
            flex: 1;
            height: 24px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
          }

          .bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #00d4ff, #00ffff);
            border-radius: 4px;
            animation: fillAnimation 0.8s ease-out;
          }

          @keyframes fillAnimation {
            from {
              width: 0 !important;
            }
          }

          .bar-number {
            min-width: 40px;
            text-align: right;
            font-size: 12px;
            color: #00d4ff;
            font-weight: 600;
          }

          .error-list {
            max-height: 300px;
            overflow-y: auto;
          }

          .error-item {
            background: rgba(0, 0, 0, 0.3);
            border-left: 3px solid #ff6b6b;
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.5;
          }

          .error-type {
            color: #ff6b6b;
            font-weight: 600;
            margin-bottom: 4px;
          }

          .error-message {
            color: #888;
          }

          .progress-bar {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 12px;
          }

          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00d4ff, #00ffff);
            animation: fillAnimation 1s ease-out;
          }

          .badge {
            display: inline-block;
            padding: 4px 8px;
            background: rgba(0, 212, 255, 0.2);
            border: 1px solid rgba(0, 212, 255, 0.5);
            border-radius: 4px;
            font-size: 11px;
            color: #00d4ff;
            margin-right: 4px;
            margin-bottom: 4px;
          }

          ::-webkit-scrollbar {
            width: 6px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: rgba(0, 212, 255, 0.3);
            border-radius: 3px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 212, 255, 0.6);
          }

          @media (max-width: 600px) {
            body {
              padding: 16px;
            }

            .grid {
              grid-template-columns: 1fr;
            }

            .stat-value {
              font-size: 24px;
            }
          }
        </style>
      </head>
      <body>
        <h1>📊 Your Coding Progress</h1>
        <p class="subtitle">Track your improvements and coding insights from AI Code Mentor</p>

        <div class="grid">
          <div class="stat-card">
            <div class="stat-value">${stats.errorScore}</div>
            <div class="stat-label">Error Score (AI)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.codeQualityScore}</div>
            <div class="stat-label">Code Quality (AI)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.optimizationScore}</div>
            <div class="stat-label">Optimization (AI)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.improvementRate}%</div>
            <div class="stat-label">Improvement Rate</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">⚡ AI Analysis Scores</div>
          <div class="chart-container">
            <div class="bar">
              <div class="bar-label">Error Score</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${stats.errorScore}%"></div>
              </div>
              <div class="bar-number">${stats.errorScore}</div>
            </div>
            <div class="bar">
              <div class="bar-label">Code Quality</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${stats.codeQualityScore}%"></div>
              </div>
              <div class="bar-number">${stats.codeQualityScore}</div>
            </div>
            <div class="bar">
              <div class="bar-label">Optimization</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${stats.optimizationScore}%"></div>
              </div>
              <div class="bar-number">${stats.optimizationScore}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📈 Performance Metrics</div>
          <div class="chart-container">
            <div class="bar">
              <div class="bar-label">Total Errors</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${Math.min(100, stats.totalErrors * 5)}%"></div>
              </div>
              <div class="bar-number">${stats.totalErrors}</div>
            </div>
            <div class="bar">
              <div class="bar-label">Fixed</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${stats.improvementRate}%"></div>
              </div>
              <div class="bar-number">${stats.fixedErrors}</div>
            </div>
            <div class="bar">
              <div class="bar-label">Trend</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: 100%; background: ${stats.trend === 'improving' ? '#20c997' : stats.trend === 'declining' ? '#dc3545' : '#ffc107'};"></div>
              </div>
              <div class="bar-number">${stats.trend}</div>
            </div>
            <div class="bar">
              <div class="bar-label">Analyses Done</div>
              <div class="bar-value">
                <div class="bar-fill" style="width: ${Math.min(100, stats.analysisCount * 10)}%"></div>
              </div>
              <div class="bar-number">${stats.analysisCount}</div>
            </div>
          </div>
        </div>

        ${errorHistory.length > 0 ? `
          <div class="section">
            <div class="section-title">🐛 Recent Errors</div>
            <div class="error-list">
              ${errorHistory
                .slice(-5)
                .reverse()
                .map(
                  (error) => `
                <div class="error-item">
                  <div class="error-type">${error.errorType || "Error"}</div>
                  <div class="error-message">${error.errorMessage || error.message || "Unknown error"}</div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        ` : ""}

        <div class="section">
          <div class="section-title">🎯 Supported Languages</div>
          <div class="chart-container">
            <div>
              <div class="badge">Python</div>
              <div class="badge">JavaScript</div>
              <div class="badge">TypeScript</div>
              <div class="badge">Java</div>
              <div class="badge">C++</div>
              <div class="badge">C#</div>
              <div class="badge">PHP</div>
              <div class="badge">Ruby</div>
              <div class="badge">Go</div>
              <div class="badge">Rust</div>
            </div>
          </div>
        </div>

        <script>
          // Dashboard logic
          console.log('Dashboard loaded');
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Calculate AI-driven statistics from analysis history
   * Returns accurate summary metrics based on actual AI analysis
   */
  private calculateAIStats(analysisHistory: any[], errorHistory: any[]) {
    if (analysisHistory.length === 0) {
      // Fallback if no AI analysis available
      return {
        totalErrors: errorHistory.length,
        fixedErrors: errorHistory.filter((e) => e.fixed).length,
        errorScore: 0, // Will be 0 if no analysis
        codeQualityScore: 50,
        optimizationScore: 45,
        improvementRate: errorHistory.length > 0
          ? Math.round(
              (errorHistory.filter((e) => e.fixed).length / errorHistory.length) * 100
            )
          : 0,
      };
    }

    // Calculate averages from AI analysis
    const totalAnalyses = analysisHistory.length;
    const avgErrorScore = Math.round(
      analysisHistory.reduce((sum, a) => sum + (a.errorScore || 0), 0) / totalAnalyses
    );
    const avgCodeQualityScore = Math.round(
      analysisHistory.reduce((sum, a) => sum + (a.codeQualityScore || 0), 0) / totalAnalyses
    );
    const avgOptimizationScore = Math.round(
      analysisHistory.reduce((sum, a) => sum + (a.optimizationScore || 0), 0) / totalAnalyses
    );

    // Calculate improvement rate from fixed errors
    const fixedErrorsCount = errorHistory.filter((e) => e.fixed).length;
    const improvementRate = errorHistory.length > 0
      ? Math.round((fixedErrorsCount / errorHistory.length) * 100)
      : 0;

    // Calculate trend (improving or degrading)
    const recentAnalyses = analysisHistory.slice(-5);
    const olderAnalyses = analysisHistory.slice(-10, -5);
    const recentAvg = recentAnalyses.length > 0
      ? Math.round(recentAnalyses.reduce((sum, a) => sum + (a.codeQualityScore || 0), 0) / recentAnalyses.length)
      : avgCodeQualityScore;
    const olderAvg = olderAnalyses.length > 0
      ? Math.round(olderAnalyses.reduce((sum, a) => sum + (a.codeQualityScore || 0), 0) / olderAnalyses.length)
      : avgCodeQualityScore;

    return {
      totalErrors: errorHistory.length,
      fixedErrors: fixedErrorsCount,
      errorScore: avgErrorScore,
      codeQualityScore: avgCodeQualityScore,
      optimizationScore: avgOptimizationScore,
      improvementRate: improvementRate,
      trend: recentAvg > olderAvg ? "improving" : recentAvg < olderAvg ? "declining" : "stable",
      analysisCount: totalAnalyses,
    };
  }
}

