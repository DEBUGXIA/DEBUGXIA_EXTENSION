# 🐛 DEBUGXIA - Intelligent Code Debugging for VS Code

Advanced AI-powered code debugging and error analysis. Detects errors, explains them clearly, and suggests improvements across **11+ programming languages**.

## ✨ Key Features

### 🎯 Intelligent Error Detection
- **Multi-Language Support**: Python, JavaScript, TypeScript, Java, C++, C#, PHP, Ruby, Go, Rust, Swift
- **Real-time Analysis**: Automatically analyzes code as you write
- **Clear Explanations**: Human-readable explanations for complex errors
- **Context-Aware Help**: Understand why errors occur and how to fix them

### 💡 Smart Code Analysis
- **Error Scoring**: Quantified error severity (0-100)
- **Code Quality Metrics**: Measure code quality standards
- **Optimization Suggestions**: Performance and readability improvements
- **Best Practices**: Learn industry standards from AI

### 📊 Workspace Scanning
- **Batch Analysis**: Scans entire workspace for errors
- **Multi-File Support**: Analyzes multiple error files simultaneously
- **Code Quality Score**: Objective measure of your code quality
- **Daily Stats**: Monitor how many errors you've fixed

### 💬 AI Chat Assistant
- **Ask Questions**: Chat with AI about your code
- **Get Help**: Ask for explanations, optimizations, or refactoring
- **Code Review**: Get AI-powered code review on demand
- **Learning**: Interactive learning directly in your editor

### 🔗 Terminal Error Analysis
- **Automatic Detection**: Analyze errors from terminal output
- **Error Parsing**: Works with any language's error format
- **One-Click Fix**: Apply AI suggestions directly to your code

## 🚀 Quick Start

### Installation

1. Install from VS Code Marketplace: **"DEBUGXIA"**
2. Clone or download this repository
3. **Setup OpenRouter API Key:**
   - Get your free API key from [OpenRouter](https://openrouter.ai/keys)
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and add your API key:
     ```
     OPENROUTER_API_KEY=your_key_here
     ```
   - ⚠️ **IMPORTANT:** `.env` is gitignored - never commit it! Keep your API key private.

### Usage

#### Keyboard Shortcuts
- `Ctrl+Shift+L` (cmd+shift+L on Mac): Open Error Panel
- `Ctrl+Shift+E` (cmd+shift+E on Mac): Explain Error at cursor
- `Ctrl+Shift+A` (cmd+shift+A on Mac): Open AI Chat

#### Commands
All commands available via Command Palette (`Ctrl+Shift+P`):

- **AI Code Mentor: Open Panel** - Show error analysis panel
- **AI Code Mentor: Explain Error** - Get AI explanation for selected code
- **AI Code Mentor: Fix with AI** - Apply AI fix to selected code
- **AI Code Mentor: Analyze Code** - Get suggestions for current file
- **AI Code Mentor: Open Chat** - Open AI chat assistant
- **AI Code Mentor: View Dashboard** - Show analytics dashboard

#### Right-Click Context Menu
- **Explain Error** - Get explanation for error under cursor
- **Fix with AI** - Apply AI fix suggestion
- **Analyze Code** - Analyze for improvements

## 📁 Extension Structure

```
extension/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── services/
│   │   ├── apiClient.ts          # Backend communication
│   │   ├── errorDetector.ts      # Error detection & parsing
│   │   └── storageService.ts     # Local storage management
│   ├── webviews/
│   │   ├── chatWebviewProvider.ts      # AI Chat UI
│   │   └── dashboardWebviewProvider.ts # Analytics Dashboard
│   ├── ui/
│   │   └── errorListProvider.ts  # Error tree view
│   └── types/
│       └── index.ts              # TypeScript definitions
├── resources/                    # Icons and assets
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript config
```

## ⚙️ Configuration

### Settings (VS Code)

```json
{
  "aiCodeMentor.apiUrl": "http://localhost:8000",
  "aiCodeMentor.apiKey": "your-api-key",
  "aiCodeMentor.enableAutoAnalysis": true,
  "aiCodeMentor.enableTerminalAnalysis": true,
  "aiCodeMentor.theme": "dark",
  "aiCodeMentor.supportedLanguages": [
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
    "swift"
  ]
}
```

## 🔌 AI Integration

The extension uses **OpenRouter API** with the GPT-4o-mini model for intelligent code analysis:

### How It Works

1. **Fast Path** (Instant): Local syntax detection catches obvious errors
2. **Accurate Path** (1-2s): AI analysis provides detailed insights using OpenRouter
3. **Cached Results** (5 min): Results cached to avoid redundant API calls
4. **Analysis History**: Stores analysis results for statistics and trends

### API Security

- ✅ API key stored in `.env` (never committed)
- ✅ `.gitignore` protects sensitive credentials
- ✅ No hardcoded secrets in source code
- ✅ Environment variables loaded at runtime

### Supported Services

- **OpenRouter**: Full support via OpenRouter API
- **Fallback**: Local syntax detection if API unavailable
  Response: { success }

POST /api/v1/fixes/apply/{userId}
  Request: { errorId, fixCode }
  Response: { success }
```

## 🌟 Supported Programming Languages

- 🐍 Python
- 🟨 JavaScript
- 🔵 TypeScript
- ☕ Java
- ⚙️ C++
- # C#
- 🐘 PHP
- 💎 Ruby
- 🏃 Go
- 🦀 Rust
- 🍎 Swift

## 🎨 Features Showcase

### Error Explanation Panel
```
[TypeError]
Cannot read property 'map' of undefined

Explanation:
You're trying to call .map() on a variable that doesn't exist or is undefined.

Why This Happened:
The variable you're using hasn't been initialized or was set to 'undefined'.

Solution:
Check if the variable exists before using it, or initialize it with a default value.

Example:
// ❌ Wrong
const items = undefined;
items.map(item => item.id);

// ✅ Correct
const items = [];
items.map(item => item.id);
```

### AI Chat Assistant
```
You: "How can I optimize this loop?"

AI: "I can help you optimize the loop performance. 
For better efficiency, consider using a list comprehension 
instead of a for loop..."
```

### Analytics Dashboard
- Real-time code quality metrics
- Error trends and patterns
- Improvement progress tracking
- Language-specific statistics

## 🐛 Troubleshooting

### "Connection Error" or "API not reachable"
1. Check if backend server is running
2. Verify API URL in settings
3. Check internet connection
4. Verify API key is correct

### "Extension not activating"
1. Reload VS Code window (`Ctrl+R`)
2. Check extension is enabled in Extensions panel
3. Look at Output panel for error messages

### "No suggestions appearing"
1. Make sure code is saved
2. Check if language is in supported languages
3. Verify auto-analysis is enabled in settings

## 📈 Usage Statistics

The extension tracks (with user consent):
- Number of errors found
- Error types and frequency
- Errors fixed via AI suggestions
- Code quality score trends
- Programming languages used

**All data is stored locally and only synced to backend server configured by user.**

## 🔐 Privacy & Security

- API keys stored securely in VS Code secret storage
- All communication uses HTTPS
- User data synced only to configured backend
- No telemetry sent without consent
- Compliant with GDPR and privacy regulations

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit pull request

## 📝 License

MIT License - see LICENSE file for details

## 🎯 Roadmap

- [ ] VS Code Workspace synchronization
- [ ] Team collaboration features
- [ ] Custom error rule definitions
- [ ] Integration with popular CI/CD platforms
- [ ] Mobile app for tracking progress
- [ ] Browser extension support
- [ ] Multi-file error analysis
- [ ] Performance profiling integration

## 💬 Support

- **GitHub Issues**: Report bugs and suggest features
- **Documentation**: [https://docs.aicodementor.com](https://docs.aicodementor.com)
- **Discord Community**: Join our community server
- **Email**: support@aicodementor.com

## 🙏 Acknowledgments

Built with ❤️ for developers who want to code smarter

---

**Made with 💜 by AI Code Mentor Team**

*"Understand errors. Improve code. Become a better developer."*
