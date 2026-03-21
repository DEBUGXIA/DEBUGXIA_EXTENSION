# DEBUGXIA Extension - Technical Specification & Architecture

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [Technical Specifications](#technical-specifications)
5. [Core Components](#core-components)
6. [API Integration](#api-integration)
7. [Data Flow](#data-flow)
8. [Performance Metrics](#performance-metrics)
9. [Configuration](#configuration)
10. [Development Setup](#development-setup)

---

## Overview

**DEBUGXIA** is an intelligent VS Code extension that leverages AI (OpenRouter GPT-4o-mini) to provide real-time code analysis, error detection, and optimization suggestions across 11+ programming languages.

### Key Capabilities

- ✅ **Real-time Code Analysis** - Analyzes code as you type or on demand
- ✅ **Multi-Language Support** - Python, JavaScript, TypeScript, Java, C++, C#, PHP, Ruby, Go, Rust, Swift
- ✅ **Error Scoring** - Quantified error severity (0-100)
- ✅ **Code Quality Metrics** - Measures code standards and best practices
- ✅ **Optimization Suggestions** - Performance and readability improvements
- ✅ **AI Chat Assistant** - Interactive debugging and code review
- ✅ **Analytics Dashboard** - Track code quality trends over time
- ✅ **Single-File Fast Mode** - Analyze one file at a time for instant results

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Editor                           │
├─────────────────────────────────────────────────────────────┤
│                 DEBUGXIA Extension                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Commands   │  Event       │  Webviews    │  UI Providers  │
│  Registry    │  Listeners   │  (Chat,      │  (Error Tree)  │
│              │              │  Dashboard)  │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                  Service Layer                              │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     AI       │   Storage    │   Error      │  Context       │
│  Analysis    │  Service     │  Detector    │  Detector      │
│  Service     │              │              │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│              Local Processing Layer                         │
├──────────────┬──────────────────────────────────────────────┤
│   Syntax     │        Caching System                        │
│   Errors     │    (5-minute TTL, LRU)                       │
├──────────────┴──────────────────────────────────────────────┤
│                External Services                           │
├──────────────┬──────────────────────────────────────────────┤
│  OpenRouter  │    VS Code Built-in APIs                    │
│  API         │  (Storage, WebView, Commands)               │
└──────────────┴──────────────────────────────────────────────┘
```

### Layered Architecture

**1. Presentation Layer**
- Chat Webview UI (interactive code analysis chat)
- Dashboard Webview UI (analytics and statistics)
- Error Tree View Provider
- Command Palette commands

**2. Service Layer**
- `AIAnalysisService` - AI-powered code analysis
- `StorageService` - Persistent data management
- `ErrorDetector` - Syntax error detection
- `ContextDetector` - Code context extraction
- `ApiClient` - Backend communication

**3. Processing Layer**
- Local syntax analysis (instant)
- Caching mechanism (performance)
- File operations

**4. Integration Layer**
- OpenRouter API (GPT-4o-mini)
- VS Code Extension API
- File system I/O

---

## How It Works

### Analysis Flow (Complete Cycle)

```
┌─────────────────────────────────────────────────────────────┐
│  User Action (Save, Select File, Manual Analysis)         │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Check Cache - Is analysis already available?              │
│  ✓ Hit (within 5 min) → Return cached result              │
│  ✗ Miss → Continue to step 2                              │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  FAST PATH: Local Syntax Detection                         │
│  • Parse code for syntax errors                            │
│  • Extract error types and locations                       │
│  • Time: < 100ms (instant)                                 │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Decision Point:                                            │
│  • Syntax errors found? → Call AI for validation           │
│  • No errors? → Call AI for deep analysis                  │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  AI ANALYSIS: Send to OpenRouter GPT-4o-mini               │
│  • Build detailed analysis prompt                          │
│  • Include detected syntax errors                          │
│  • Request structured JSON response                        │
│  • Time: 1-2 seconds                                       │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Parse AI Response                                          │
│  • Error Score (0-100)                                     │
│  • Code Quality Score (0-100)                              │
│  • Optimization Score (0-100)                              │
│  • Issues and suggestions                                  │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Store Results                                              │
│  • Cache for 5 minutes                                     │
│  • Save to analysis history (last 50)                      │
│  • Update persistent storage                               │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Display Results                                            │
│  • Show scores in Chat webview                             │
│  • Update dashboard statistics                             │
│  • Display issues and suggestions                          │
└─────────────────────────────────────────────────────────────┘
```

### User Interactions

**1. Single-File Analysis Mode**
```
User selects file from dropdown
        ↓
File picker available with Browse button
        ↓
Selected file analyzed automatically
        ↓
Results displayed in Chat panel
        ↓
Remove button to manage file list
```

**2. Dashboard Statistics**
```
Extension collects all analyses
        ↓
Averages error scores from history
        ↓
Computes trends (improving/declining/stable)
        ↓
Displays on dashboard with visualizations
```

**3. Error Detection Pipeline**
```
Code loaded → Local syntax check → Issues found
        ↓
AI analysis → Validate findings → Score assigned
        ↓
Display issues → User can see errors + fixes
```

---

## Technical Specifications

### System Requirements

| Requirement | Specification |
|------------|---------------|
| **VS Code Version** | 1.85.0 or higher |
| **Node.js** | 18+ |
| **Memory** | 256 MB minimum |
| **Disk Space** | 50 MB for extension + node_modules |
| **Network** | Required for OpenRouter API calls |

### Performance Specifications

| Metric | Value | Notes |
|--------|-------|-------|
| **Local Syntax Detection** | < 100ms | Instant feedback |
| **Cache Hit Response** | < 10ms | In-memory lookup |
| **AI Analysis** | 1-2 seconds | Network dependent |
| **Cache Duration** | 5 minutes | Configurable TTL |
| **Max Cache Size** | 50 analyses | LRU eviction after |
| **Error History** | Last 100 | Stored persistently |
| **Memory Footprint** | ~80-120 MB | Typical usage |

### Supported Languages

| Language | Support Level | Error Detection | AI Analysis |
|----------|---------------|-----------------|-------------|
| **Python** | ⭐⭐⭐ | Full | Full |
| **JavaScript** | ⭐⭐⭐ | Full | Full |
| **TypeScript** | ⭐⭐⭐ | Full | Full |
| **Java** | ⭐⭐ | Partial | Full |
| **C++** | ⭐⭐ | Partial | Full |
| **C#** | ⭐⭐ | Partial | Full |
| **PHP** | ⭐⭐ | Partial | Full |
| **Ruby** | ⭐ | Basic | Full |
| **Go** | ⭐ | Basic | Full |
| **Rust** | ⭐ | Basic | Full |
| **Swift** | ⭐ | Basic | Full |

**Support Levels:**
- ⭐⭐⭐ = Excellent (comprehensive error detection)
- ⭐⭐ = Good (most common errors)
- ⭐ = Basic (syntax check only)

### Scoring System

#### Error Score (0-100)
- **0** = No errors found (code is syntactically correct)
- **1-25** = Minor errors (warnings, style issues)
- **26-50** = Moderate errors (logic issues, performance)
- **51-75** = Major errors (code will fail)
- **76-100** = Critical errors (completely broken)

#### Code Quality Score (0-100)
- **0-25** = Poor (unreadable, unmaintainable)
- **26-50** = Fair (needs improvement)
- **51-75** = Good (meets standards)
- **76-100** = Excellent (best practices followed)

#### Optimization Score (0-100)
- **0-25** = Major optimization potential
- **26-50** = Moderate optimization needed
- **51-75** = Good performance
- **76-100** = Optimized code

---

## Core Components

### 1. AIAnalysisService (`src/services/aiAnalysisService.ts`)

**Purpose:** Orchestrates AI analysis and local error detection

**Key Methods:**
```typescript
analyzeCode(code, language, fileName): Promise<CodeAnalysis>
  → Main entry point with caching
  
callAIAnalysis(code, language, fileName): Promise<CodeAnalysis>
  → Sends request to OpenRouter API
  
detectLocalSyntaxErrors(code, language): LocalErrors
  → Fast local error checking
  
buildAnalysisPrompt(code, language, fileName): string
  → Constructs detailed analysis request
  
testApiKey(): Promise<boolean>
  → Validates API connectivity
  
setApiKey(key: string): void
  → Updates API key at runtime
```

**Cache Implementation:**
```typescript
private analysisCache: Map<string, CodeAnalysis>
private cacheTimeout: 5 * 60 * 1000 // 5 minutes
CacheKey: "${fileName}:${codeLength}"
Eviction: LRU when size > 50 analyses
```

### 2. StorageService (`src/services/storageService.ts`)

**Purpose:** Manages persistent data using VS Code storage

**Key Methods:**
```typescript
saveAnalysis(fileName, analysis): void
  → Store analysis results for statistics
  
getAnalysisHistory(): CodeAnalysis[]
  → Retrieve last 50 analyses
  
saveError(error): void
  → Log errors for tracking
  
getErrorHistory(): ErrorLog[]
  → Retrieve last 100 errors
```

**Storage Backend:** VS Code ExtensionContext.globalState

### 3. ErrorDetector (`src/services/errorDetector.ts`)

**Purpose:** Performs local syntax analysis

**Capabilities:**
- Detects unmatched brackets/parentheses
- Finds undefined variables
- Checks for missing imports
- Validates function signatures
- Language-specific syntax rules

**Performance:** < 100ms for typical files

### 4. ChatWebviewProvider (`src/webviews/chatWebviewProvider.ts`)

**Purpose:** Interactive chat UI for code analysis

**Features:**
- File selector dropdown (cyan text, #00d4ff)
- Browse button - opens file picker
- Remove button - manages file list
- Three score cards (Error, Quality, Optimization)
- Analysis summary with issues
- Action buttons (Fix Errors, Optimize, Terminal)
- Notification system (2s auto-dismiss)

**Message Handlers:**
```typescript
selectAndAnalyze → Trigger analysis for selected file
openFilePicker → Open VS Code file browser
fixErrors → Apply AI-suggested fixes
optimizeCode → Request optimization suggestions
```

### 5. DashboardWebviewProvider (`src/webviews/dashboardWebviewProvider.ts`)

**Purpose:** Analytics and trend visualization

**Displays:**
- Average error score across all analyses
- Average code quality score
- Average optimization score
- Trend indicator (improving/declining/stable)
- Analysis count
- Performance metrics

**Calculation Method:**
```typescript
calculateAIStats(): {
  errorScore: average of all error scores
  codeQualityScore: average of all quality scores
  optimizationScore: average of all optimization scores
  trend: comparison to previous period
  analysisCount: total analyses performed
}
```

### 6. ErrorListProvider (`src/ui/errorListProvider.ts`)

**Purpose:** Tree view display of detected errors

**Display Format:**
```
📁 Error List
  ├─ 🔴 Critical Errors (1)
  │  └─ Missing semicolon on line 5
  ├─ 🟠 High Priority (2)
  │  ├─ Undefined variable 'x'
  │  └─ Type mismatch
  └─ 🟡 Warnings (3)
     ├─ Unused import
     ├─ Style issue
     └─ Performance concern
```

---

## API Integration

### OpenRouter API

**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`

**Model:** `openai/gpt-4o-mini`

**Request Structure:**
```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "Expert code analyzer prompt..."
    },
    {
      "role": "user",
      "content": "Analyze this code: [code]"
    }
  ],
  "max_tokens": 1500
}
```

**Response Structure:**
```json
{
  "errorScore": 0,
  "codeQualityScore": 95,
  "optimizationScore": 85,
  "summary": "Well-written code...",
  "suggestions": [
    "Consider using type hints...",
    "Add docstring..."
  ],
  "issues": []
}
```

**API Headers:**
```
Authorization: Bearer {API_KEY}
Content-Type: application/json
HTTP-Referer: https://debugxia.dev
X-Title: DEBUGXIA
```

**Error Handling:**
- 401: Invalid/expired API key
- 429: Rate limited (retry after delay)
- 500: Server error (fallback to local analysis)
- Timeout: Local analysis fallback

### Rate Limiting

- **Limit:** Model-dependent (typically 100k tokens/day)
- **Strategy:** Cache hits bypass API calls
- **Cache TTL:** 5 minutes per file
- **Fallback:** Local syntax detection if API fails

---

## Data Flow

### 1. Initialization Flow

```
Extension Activation
  ↓
Load .env file (API key)
  ↓
Initialize Services:
  - StorageService (load history)
  - AIAnalysisService (set API key)
  - ErrorDetector
  ↓
Register Commands
  - analyzeCode
  - explainError
  - fixWithAI
  - openChat
  - viewDashboard
  ↓
Register Webview Providers
  - ChatWebviewProvider
  - DashboardWebviewProvider
  ↓
Listen for Events
  - File save
  - Text selection
  - Configuration changes
  ↓
Extension Ready ✅
```

### 2. Analysis Request Flow

```
User Action
  ↓
Get Selected File
  ↓
Check Cache
  ├─ Hit → Return cached (< 10ms)
  └─ Miss → Continue
  ↓
Read File Content
  ↓
Detect Language
  ↓
Local Syntax Check (< 100ms)
  ↓
Send to AI (1-2s)
  ├─ Parse response
  ├─ Validate JSON
  └─ Merge with local findings
  ↓
Cache Result (5 min)
  ↓
Store in History
  ↓
Update UI
  ├─ Chat panel
  ├─ Dashboard stats
  └─ Error tree
  ↓
Complete ✅
```

### 3. Configuration Flow

```
VS Code Settings (.vscode/settings.json)
  ↓
Read Configuration:
  - apiUrl (if provided)
  - apiKey (if provided)
  ↓
Load Environment Variables (.env)
  - OPENROUTER_API_KEY
  ↓
Merge Configs (Settings > Environment > Defaults)
  ↓
Pass to Services
  ↓
Ready for Analysis
```

---

## Performance Metrics

### Benchmarks

**Scenario 1: Small File (< 50 lines)**
- Local syntax check: 30-50ms
- API call: 800-1200ms
- Total: 900-1300ms
- Cached result: 5ms

**Scenario 2: Medium File (50-200 lines)**
- Local syntax check: 50-100ms
- API call: 1000-1500ms
- Total: 1100-1600ms
- Cached result: 5ms

**Scenario 3: Large File (> 200 lines)**
- Local syntax check: 100-200ms
- API call: 1500-2000ms
- Total: 1600-2200ms
- Cached result: 5ms

### Memory Usage

| Component | Memory | Notes |
|-----------|--------|-------|
| Cache (50 analyses) | 2-5 MB | Depends on file size |
| History storage | 3-8 MB | 50 analyses + metadata |
| UI components | 10-15 MB | Webviews + bindings |
| Base extension | 60-80 MB | node_modules bundled |
| **Total typical** | 80-120 MB | Active memory |

### Network Impact

- **Bytes per analysis:** 2-10 KB (input + output)
- **Requests per session:** 10-50 (depends on usage)
- **Typical data:** 50-500 KB per session
- **Bandwidth:** Minimal, optimized for slow connections

---

## Configuration

### Environment Variables (.env)

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Optional
DEBUG_MODE=false
LOG_LEVEL=info
CACHE_TTL=300000  # 5 minutes in milliseconds
MAX_CACHE_SIZE=50
ANALYSIS_HISTORY_SIZE=50
ERROR_HISTORY_SIZE=100
```

### VS Code Settings (.vscode/settings.json)

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

### Priority Order

1. **VS Code Settings** (highest priority)
2. **Environment Variables** (.env)
3. **Default Values** (fallback)

---

## Development Setup

### Prerequisites

```bash
# Node.js
node --version  # v18+

# npm
npm --version

# npm packages
npm install
```

### Project Structure

```
DEBUGXIA_EXTENSION/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── envLoader.ts              # .env file loader
│   ├── ascii.ts                  # Banner display
│   ├── services/
│   │   ├── aiAnalysisService.ts # AI analysis core
│   │   ├── apiClient.ts         # API communication
│   │   ├── errorDetector.ts     # Syntax detection
│   │   ├── contextDetector.ts   # Context extraction
│   │   ├── storageService.ts    # Data persistence
│   │   └── terminalScanner.ts   # Terminal integration
│   ├── ui/
│   │   └── errorListProvider.ts # Error tree view
│   ├── webviews/
│   │   ├── chatWebviewProvider.ts      # Chat UI
│   │   └── dashboardWebviewProvider.ts # Dashboard UI
│   └── types/
│       └── index.ts              # TypeScript definitions
│
├── dist/
│   ├── extension.js              # Compiled extension
│   └── extension.js.map          # Source map
│
├── package.json                  # Manifest
├── tsconfig.json                 # TypeScript config
├── .env                          # API credentials (gitignored)
├── .env.example                  # Template
├── .gitignore                    # Git ignore rules
└── README.md                     # User documentation
```

### Build & Run

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch for changes
npm run watch

# Run extension in VS Code
Press F5 (Debug)
```

### Testing

```bash
# Lint code
npm run lint

# Type check
npm run type-check

# Build check
npm run build
```

---

## API Response Examples

### Success Response (Error Found)

```json
{
  "errorScore": 35,
  "codeQualityScore": 52,
  "optimizationScore": 48,
  "summary": "Code has a logic error in the loop condition that will cause infinite iteration.",
  "suggestions": [
    "Fix the loop termination condition",
    "Add proper bounds checking",
    "Consider using a while loop instead"
  ],
  "issues": [
    "Line 5: Infinite loop detected - condition never becomes false",
    "Line 8: Unused variable 'x'",
    "Line 12: Missing error handling"
  ]
}
```

### Success Response (No Errors)

```json
{
  "errorScore": 0,
  "codeQualityScore": 88,
  "optimizationScore": 82,
  "summary": "Well-structured code with good practices. Minor optimization opportunities available.",
  "suggestions": [
    "Consider using list comprehension for better readability",
    "Add type hints for better IDE support"
  ],
  "issues": []
}
```

### Fallback Response (API Error)

```json
{
  "errorScore": 10,
  "codeQualityScore": 50,
  "optimizationScore": 50,
  "summary": "Local analysis only - AI service unavailable. Using syntax checking.",
  "suggestions": [],
  "issues": [
    "Could not reach AI service - local analysis only"
  ]
}
```

---

## Troubleshooting

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "API settings not configured" | Missing API key | Add `OPENROUTER_API_KEY` to `.env` |
| Analysis taking > 5 seconds | Network slow | Check internet connection |
| Errors not detected | Language not supported | Check supported languages list |
| Cache not working | TTL expired | Result refreshed after 5 min |
| Extension not loading | Compilation error | Check console (Ctrl+Shift+J) |

### Debug Mode

```bash
# Enable debug logging
export DEBUG_MODE=true
npm run watch

# Check VS Code output
View → Output → DEBUGXIA
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-22 | Initial release |

---

## License

MIT License - See LICENSE file

---

## Support & Resources

- **Documentation:** [README.md](README.md)
- **API Key:** [OpenRouter.ai](https://openrouter.ai/keys)
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

---

**Last Updated:** March 22, 2026  
**Maintainer:** DEBUGXIA Development Team
