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
    try {
      console.log("📋 ChatWebviewProvider.show() called");
      console.log("Current panel exists?", !!ChatWebviewProvider.currentPanel);
      
      if (ChatWebviewProvider.currentPanel) {
        console.log("📌 Revealing existing panel");
        ChatWebviewProvider.currentPanel.reveal(vscode.ViewColumn.Beside);
      } else {
        console.log("✨ Creating new webview panel");
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
        console.log("✅ Panel created and set as current");
        
        const provider = new ChatWebviewProvider(
          extensionUri,
          apiClient,
          storageService
        );
        console.log("✅ Provider instance created");
        
        provider.deserializeWebviewPanel(panel, null);
        console.log("✅ Webview content loaded");

        panel.onDidDispose(
          () => {
            console.log("🗑️  Chat panel disposed");
            ChatWebviewProvider.currentPanel = undefined;
          },
          null
        );
      }
      console.log("✅ ChatWebviewProvider.show() completed successfully");
    } catch (error) {
      console.error("❌ Error in ChatWebviewProvider.show():", error);
      vscode.window.showErrorMessage(`Failed to open chat panel: ${error}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Mentor - Smart Assistant</title>
        <style>
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }

          body {
            font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
            color: #e0e0e0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            padding: 0;
            overflow: hidden;
          }

          .header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 212, 255, 0.15);
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 212, 255, 0.05) 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .header h2 {
            color: #00d4ff;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.3px;
          }

          .header-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: rgba(0, 212, 255, 0.15);
            border: 1px solid rgba(0, 212, 255, 0.3);
            font-size: 14px;
          }

          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .message-group {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            animation: fadeIn 0.4s ease-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .message-group.user {
            justify-content: flex-end;
          }

          .message-group.ai {
            justify-content: flex-start;
          }

          .avatar {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
          }

          .avatar.ai {
            background: rgba(0, 212, 255, 0.15);
            border: 1px solid rgba(0, 212, 255, 0.3);
          }

          .avatar.user {
            background: rgba(0, 150, 200, 0.2);
            border: 1px solid rgba(0, 212, 255, 0.2);
          }

          .message-content {
            max-width: 75%;
            padding: 12px 16px;
            border-radius: 10px;
            word-wrap: break-word;
            line-height: 1.5;
            font-size: 14px;
          }

          .message-group.user .message-content {
            background: linear-gradient(135deg, #00a8cc 0%, #0066cc 100%);
            color: #fff;
            border: 1px solid rgba(0, 212, 255, 0.4);
            border-bottom-right-radius: 4px;
          }

          .message-group.ai .message-content {
            background: rgba(0, 212, 255, 0.08);
            border: 1px solid rgba(0, 212, 255, 0.25);
            color: #e0e0e0;
            border-bottom-left-radius: 4px;
          }

          .message-content code {
            background: rgba(255, 255, 255, 0.08);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            color: #ce9178;
            font-size: 13px;
          }

          .message-content pre {
            background: rgba(0, 0, 0, 0.3);
            padding: 10px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
            border-left: 3px solid #00d4ff;
          }

          .message-content pre code {
            background: transparent;
            padding: 0;
            color: #ce9178;
          }

          .loading {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .loading span {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #00d4ff;
            animation: bounce 1.4s infinite;
          }

          .loading span:nth-child(1) {
            animation-delay: 0s;
          }

          .loading span:nth-child(2) {
            animation-delay: 0.2s;
          }

          .loading span:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes bounce {
            0%, 80%, 100% {
              transform: scale(1);
              opacity: 0.5;
            }
            40% {
              transform: scale(1.2);
              opacity: 1;
            }
          }

          .input-area {
            padding: 16px 20px;
            border-top: 1px solid rgba(0, 212, 255, 0.15);
            background: rgba(0, 0, 0, 0.3);
            display: flex;
            gap: 10px;
            align-items: center;
          }

          .input-wrapper {
            flex: 1;
            display: flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(0, 212, 255, 0.25);
            border-radius: 8px;
            padding: 2px;
            transition: all 0.3s ease;
          }

          .input-wrapper:focus-within {
            border-color: #00d4ff;
            background: rgba(0, 212, 255, 0.08);
            box-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
          }

          input {
            flex: 1;
            padding: 12px 14px;
            background: transparent;
            border: none;
            color: #e0e0e0;
            font-size: 14px;
            outline: none;
            font-family: inherit;
          }

          input::placeholder {
            color: rgba(224, 224, 224, 0.4);
          }

          button {
            padding: 10px 18px;
            background: linear-gradient(135deg, #00d4ff 0%, #0088cc 100%);
            border: none;
            border-radius: 6px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 212, 255, 0.3);
          }

          button:active {
            transform: translateY(0);
          }

          button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
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

          .timestamp {
            font-size: 11px;
            color: rgba(224, 224, 224, 0.4);
            margin-top: 4px;
          }

          @media (max-width: 600px) {
            .message-content {
              max-width: 85%;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <div class="header-badge">🤖</div>
            <h2>AI Code Mentor</h2>
          </div>
        </div>

        <div class="messages" id="messages">
          <div class="message-group ai">
            <div class="avatar ai">🤖</div>
            <div>
              <div class="message-content">
                Hi! 👋 I'm your AI Code Mentor. Ask me anything about your code—<strong>bugs</strong>, <strong>errors</strong>, <strong>optimizations</strong>, or <strong>best practices</strong>. I'm here to help you write better code!
              </div>
              <div class="timestamp">just now</div>
            </div>
          </div>
        </div>

        <div class="input-area">
          <div class="input-wrapper">
            <input 
              type="text" 
              id="input" 
              placeholder="Tell your all query....."
              autocomplete="off"
            />
          </div>
          <button id="sendBtn" onclick="sendMessage()">
            <span>→</span>
          </button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const input = document.getElementById('input');
          const messages = document.getElementById('messages');
          const sendBtn = document.getElementById('sendBtn');

          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });

          function formatTime() {
            const now = new Date();
            return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            sendBtn.disabled = true;

            // Add user message
            addMessage(text, 'user');
            input.value = '';
            input.focus();

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
            const messageGroup = document.createElement('div');
            messageGroup.className = 'message-group ' + type.replace('-loading', '');

            if (type === 'ai-loading') {
              messageGroup.innerHTML = '<div class="avatar ai">🤖</div><div><div class="message-content"><div class="loading"><span></span><span></span><span></span></div></div></div>';
            } else {
              const avatar = document.createElement('div');
              avatar.className = 'avatar ' + type;
              avatar.textContent = type === 'user' ? '👤' : '🤖';

              const contentDiv = document.createElement('div');
              const textDiv = document.createElement('div');
              textDiv.className = 'message-content';
              textDiv.innerHTML = text
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

              const timeDiv = document.createElement('div');
              timeDiv.className = 'timestamp';
              timeDiv.textContent = formatTime();

              contentDiv.appendChild(textDiv);
              contentDiv.appendChild(timeDiv);
              messageGroup.appendChild(avatar);
              messageGroup.appendChild(contentDiv);
            }

            messages.appendChild(messageGroup);
            messages.scrollTop = messages.scrollHeight;

            return messageGroup;
          }

          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'chatResponse') {
              sendBtn.disabled = false;
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
