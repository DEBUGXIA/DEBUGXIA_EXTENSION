/**
 * Chat Webview Provider
 * Provides AI chat interface inside VS Code
 */

import * as vscode from "vscode";
import { ApiClient } from "../services/apiClient";
import { StorageService } from "../services/storageService";

export class ChatWebviewProvider implements vscode.WebviewPanelSerializer {
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
    ChatWebviewProvider.currentPanel = webviewPanel;
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "chat") {
        const userId = this.storageService.getUserId();
        const response = await this.apiClient.chatWithAI(
          userId,
          message.text,
          message.context
        );

        webviewPanel.webview.postMessage({
          command: "chatResponse",
          text: response,
        });
      }
    });
  }

  static show(
    extensionUri: vscode.Uri,
    apiClient: ApiClient,
    storageService: StorageService
  ) {
    if (ChatWebviewProvider.currentPanel) {
      ChatWebviewProvider.currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "aiCodeMentor.chat",
        "AI Chat Assistant",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          enableForms: true,
          enableFindWidget: true,
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
          ChatWebviewProvider.currentPanel = undefined;
        },
        null
      );
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Chat Assistant</title>
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
            display: flex;
            flex-direction: column;
            height: 100vh;
            padding: 0;
          }

          .header {
            padding: 16px;
            border-bottom: 1px solid rgba(0, 212, 255, 0.2);
            background: rgba(0, 0, 0, 0.3);
          }

          .header h2 {
            color: #00d4ff;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .message {
            display: flex;
            gap: 8px;
            animation: slideIn 0.3s ease-out;
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .message.user {
            justify-content: flex-end;
          }

          .message.ai {
            justify-content: flex-start;
          }

          .message-content {
            max-width: 80%;
            padding: 12px 14px;
            border-radius: 8px;
            word-wrap: break-word;
            line-height: 1.4;
          }

          .message.user .message-content {
            background: linear-gradient(135deg, #00d4ff 0%, #0066cc 100%);
            color: #000;
            font-weight: 500;
          }

          .message.ai .message-content {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.3);
            color: #e0e0e0;
          }

          .message.ai .icon {
            color: #00d4ff;
            font-size: 20px;
          }

          .input-area {
            padding: 16px;
            border-top: 1px solid rgba(0, 212, 255, 0.2);
            background: rgba(0, 0, 0, 0.3);
            display: flex;
            gap: 8px;
          }

          input {
            flex: 1;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
          }

          input:focus {
            outline: none;
            border-color: #00d4ff;
            background: rgba(0, 212, 255, 0.05);
          }

          button {
            padding: 10px 16px;
            background: linear-gradient(135deg, #00d4ff 0%, #0066cc 100%);
            border: none;
            border-radius: 6px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
          }

          button:active {
            transform: translateY(0);
          }

          .loading {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #00d4ff;
          }

          .loading span {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00d4ff;
            animation: pulse 1.5s ease-in-out infinite;
          }

          .loading span:nth-child(2) {
            animation-delay: 0.2s;
          }

          .loading span:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
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
        </style>
      </head>
      <body>
        <div class="header">
          <h2>💬 AI Chat Assistant</h2>
        </div>

        <div class="messages" id="messages">
          <div class="message ai">
            <span class="icon">🤖</span>
            <div class="message-content">
              Hi! I'm your AI Code Mentor. Ask me anything about your code - bugs, optimizations, or improvements!
            </div>
          </div>
        </div>

        <div class="input-area">
          <input 
            type="text" 
            id="input" 
            placeholder="Ask me anything about your code..."
            autocomplete="off"
          />
          <button onclick="sendMessage()">Send</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const input = document.getElementById('input');
          const messages = document.getElementById('messages');

          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
          });

          function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            // Add user message
            addMessage(text, 'user');
            input.value = '';

            // Send to extension
            vscode.postMessage({
              command: 'chat',
              text: text,
              context: document.body.innerText
            });

            // Show loading
            addMessage('', 'ai-loading');
          }

          function addMessage(text, type) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type.replace('-loading', '');

            if (type === 'ai-loading') {
              messageDiv.innerHTML = '<span class="icon">🤖</span><div class="message-content"><div class="loading"><span></span><span></span><span></span></div></div>';
            } else {
              const contentDiv = document.createElement('div');
              contentDiv.className = 'message-content';
              contentDiv.textContent = text;
              messageDiv.appendChild(contentDiv);
            }

            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;

            return messageDiv;
          }

          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'chatResponse') {
              // Remove loading message
              const loading = messages.querySelector('.ai-loading');
              if (loading) loading.remove();
              
              // Add AI response
              addMessage(message.text, 'ai');
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
