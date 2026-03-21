/**
 * Error Detector Service
 * Detects and analyzes code errors across multiple programming languages
 */

import * as vscode from "vscode";
import { CodeError, TerminalError } from "../types";

export class ErrorDetector {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private errorRegexPatterns: Map<string, RegExp[]>;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("aiCodeMentor");
    this.errorRegexPatterns = this.initializeErrorPatterns();
  }

  /**
   * Initialize error patterns for different languages
   */
  private initializeErrorPatterns(): Map<string, RegExp[]> {
    const patterns = new Map<string, RegExp[]>();

    // Python errors
    patterns.set("python", [
      /^(\w+Error): (.+)$/gm, // Generic Python errors
      /File "([^"]+)", line (\d+)/gm, // File and line info
      /IndentationError: (.+)/gm,
      /TypeError: (.+)/gm,
      /AttributeError: (.+)/gm,
      /NameError: name '([^']+)' is not defined/gm,
      /KeyError: (.+)/gm,
      /IndexError: (.+)/gm,
      /ValueError: (.+)/gm,
      /ZeroDivisionError: (.+)/gm,
    ]);

    // JavaScript/TypeScript errors
    patterns.set("javascript", [
      /^([A-Za-z]+Error): (.+)$/gm,
      /at (.+) \((.+):(\d+):(\d+)\)/gm,
      /SyntaxError: (.+)/gm,
      /ReferenceError: (.+)/gm,
      /TypeError: (.+)/gm,
      /Cannot read propert(y|ies) '([^']+)'/gm,
    ]);

    patterns.set("typescript", patterns.get("javascript")!);

    // Java errors
    patterns.set("java", [
      /^(\w+Exception): (.+)$/gm,
      /at (.+)\((.+):(\d+)\)/gm,
      /NullPointerException/gm,
      /ArrayIndexOutOfBoundsException/gm,
      /ClassNotFoundException/gm,
      /IllegalArgumentException/gm,
    ]);

    // C/C++ errors
    patterns.set("cpp", [
      /error:(.+)/gm,
      /warning:(.+)/gm,
      /(.+):(\d+):(\d+):/gm,
      /undefined reference to '([^']+)'/gm,
      /no matching function for call/gm,
    ]);

    // C# errors
    patterns.set("csharp", [
      /^\w+Error: (.+)$/gm,
      /CS\d+:(.+)/gm,
      /NullReferenceException/gm,
      /InvalidOperationException/gm,
    ]);

    // PHP errors
    patterns.set("php", [
      /^(Fatal error|Parse error|Warning): (.+) in (.+) on line (\d+)/gm,
      /Call to undefined function/gm,
      /Undefined variable/gm,
      /Division by zero/gm,
    ]);

    // Ruby errors
    patterns.set("ruby", [
      /^(\w+Error): (.+) \((.+)\)/gm,
      /^  from (.+):(\d+):in `(.+)'/gm,
      /undefined method/gm,
      /NoMethodError/gm,
    ]);

    // Go errors
    patterns.set("go", [
      /(.+):(\d+):(\d+): (.+)/gm,
      /undefined: (.+)/gm,
      /cannot use (.+) \(type (.+)\)/gm,
    ]);

    // Rust errors
    patterns.set("rust", [
      /error\[E\d+\]: (.+)/gm,
      / --> (.+):(\d+):(\d+)/gm,
      /cannot find (.+) in this scope/gm,
    ]);

    return patterns;
  }

  /**
   * Analyze document for errors
   */
  async analyzeDocument(document: vscode.TextDocument): Promise<CodeError[]> {
    const language = document.languageId;
    const errors: CodeError[] = [];

    // First, check if VS Code has built-in diagnostics
    const vscodeErrors = vscode.languages.getDiagnostics(document.uri);
    console.log(`🔍 VS Code diagnostics for ${document.fileName}:`, vscodeErrors.length);

    vscodeErrors.forEach((diagnostic) => {
      const error: CodeError = {
        id: `${document.fileName}-${diagnostic.range.start.line}`,
        language,
        file: document.fileName,
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
        errorType: this.extractErrorType(diagnostic.message),
        errorMessage: diagnostic.message,
        severity: this.mapSeverity(diagnostic.severity || 0),
        code: this.extractErrorCode(diagnostic),
        timestamp: new Date(),
      };
      errors.push(error);
    });

    // If no VS Code diagnostics, analyze code content directly
    if (errors.length === 0) {
      console.log(`📝 Analyzing code content directly for ${language}...`);
      const contentErrors = this.analyzeCodeContent(document.getText(), language, document.fileName);
      errors.push(...contentErrors);
      console.log(`✅ Found ${contentErrors.length} errors from content analysis`);
    }

    return errors;
  }

  /**
   * Analyze code content directly for syntax and logic errors
   */
  private analyzeCodeContent(code: string, language: string, fileName: string): CodeError[] {
    const errors: CodeError[] = [];
    const lines = code.split('\n');

    if (language === 'python') {
      // Check for Python syntax and logic errors
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        if (trimmed.startsWith('#') || trimmed === '') return;

        // 1. Missing colon after keywords
        if (/^(class|def|if|elif|else|for|while|with|try|except|finally)\s+/.test(trimmed) && !trimmed.endsWith(':')) {
          errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `Missing colon ':' at end of line`, 'missing-colon', idx));
        }

        // 2. Undefined variables (using before definition)
        if (/\b\w+\(/.test(trimmed) && !trimmed.includes('def ') && !trimmed.includes('import')) {
          if (!/^(print|len|range|str|int|float|list|dict|set|tuple)\(/.test(trimmed) && 
              !/^(open|input|sum|max|min|sorted)\(/.test(trimmed)) {
            // Potential undefined function call
          }
        }

        // 3. Missing parentheses on function calls
        if (/\bprint\s+[^(]/.test(trimmed)) {
          errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `print statement needs parentheses()`, 'print-syntax', idx));
        }

        // 4. Indentation issues
        if (trimmed.length > 0 && idx > 0) {
          const prevLine = lines[idx - 1].trim();
          const currentIndent = line.search(/\S/);
          const prevIndent = lines[idx - 1].search(/\S/);
          
          if (prevLine.endsWith(':') && currentIndent <= prevIndent && currentIndent !== -1 && prevIndent !== -1) {
            if (!trimmed.startsWith('#')) {
              errors.push(this.createError(fileName, lineNum, language, 'IndentationError', `Expected indented block`, 'indent-error', idx));
            }
          }
        }

        // 5. Common typos and errors
        if (/\b(retrun|prrint|imort|fro|whlie)\b/.test(trimmed)) {
          const match = trimmed.match(/\b(retrun|prrint|imort|fro|whlie)\b/);
          const suggestions = { retrun: 'return', prrint: 'print', imort: 'import', fro: 'for', whlie: 'while' };
          errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `Typo: did you mean '${suggestions[match[0]]}'?`, 'typo', idx));
        }

        // 6. Missing return statements in functions
        if (idx > 0 && /^def\s+\w+\(/.test(lines[idx - 1]) && trimmed.length > 0 && !trimmed.includes('return') && !trimmed.includes('pass')) {
          // Possible missing return
        }
      });
    } else if (language === 'javascript' || language === 'typescript') {
      // Check for JavaScript/TypeScript errors
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed === '') return;

        // 1. Missing semicolons
        if (/[a-zA-Z0-9_)\]}\']$/.test(trimmed) && !trimmed.endsWith('{') && !trimmed.endsWith(';') && !trimmed.endsWith(',')) {
          if (!trimmed.endsWith(')') || !trimmed.includes('function')) {
            errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `Missing semicolon ';'`, 'missing-semi', idx));
          }
        }

        // 2. Undefined variables
        if (/\b(let|const|var)\s+/.test(trimmed) && trimmed.includes('undefined')) {
          errors.push(this.createError(fileName, lineNum, language, 'ReferenceError', `Variable initialized as undefined`, 'undefined-init', idx));
        }

        // 3. Missing braces after if/for/while
        if (/^(if|for|while|else)\s*\(/.test(trimmed) && !trimmed.includes('{') && !lines[idx + 1]?.trim().startsWith('{')) {
          errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `Missing opening brace '{'`, 'missing-brace', idx));
        }

        // 4. Common typos
        if (/\b(fuction|vvar|cconst|returnn|consol)\b/.test(trimmed)) {
          const match = trimmed.match(/\b(fuction|vvar|cconst|returnn|consol)\b/);
          const suggestions = { fuction: 'function', vvar: 'var', cconst: 'const', returnn: 'return', consol: 'console' };
          errors.push(this.createError(fileName, lineNum, language, 'SyntaxError', `Typo: did you mean '${suggestions[match[0]]}'?`, 'typo', idx));
        }

        // 5. Dangerous 'var' usage
        if (/^(var)\s+/.test(trimmed)) {
          errors.push(this.createError(fileName, lineNum, language, 'Warning', `Use 'let' or 'const' instead of 'var'`, 'var-deprecated', idx));
        }

        // 6. Null/Undefined checks
        if (/\.(\w+)\(/.test(trimmed) && !trimmed.includes('?.') && !trimmed.includes('&&')) {
          // Potential null reference
          if (!/^(console|Math|Array|Object|String|Number)\./.test(trimmed)) {
            // Possible unsafe property access
          }
        }

        // 7. Missing catch blocks
        if (/^try\s*\{/.test(trimmed)) {
          let foundCatch = false;
          for (let i = idx + 1; i < Math.min(idx + 20, lines.length); i++) {
            if (/^(catch|finally)\s*/.test(lines[i].trim())) {
              foundCatch = true;
              break;
            }
          }
          if (!foundCatch) {
            errors.push(this.createError(fileName, lineNum, language, 'Warning', `'try' block without 'catch' or 'finally'`, 'no-catch', idx));
          }
        }

        // 8. Async/await issues
        if (/\bawait\b/.test(trimmed) && !/^async\s+/.test(lines[idx - 1]?.trim())) {
          // Need to check if in async function
        }

        // 9. Unused variables
        if (/^(const|let|var)\s+(\w+)\s*=/.test(trimmed)) {
          const varMatch = trimmed.match(/^(const|let|var)\s+(\w+)/);
          if (varMatch) {
            const varName = varMatch[2];
            const codeRest = code.substring(code.indexOf(line) + line.length);
            if (!codeRest.includes(varName)) {
              errors.push(this.createError(fileName, lineNum, language, 'Warning', `Variable '${varName}' declared but never used`, 'unused-var', idx));
            }
          }
        }
      });
    }

    return errors;
  }

  /**
   * Helper to create error objects
   */
  private createError(file: string, line: number, language: string, type: string, message: string, code: string, idx: number): CodeError {
    return {
      id: `${file}-${idx}`,
      language,
      file,
      line,
      column: 1,
      errorType: type,
      errorMessage: message,
      severity: type === 'Warning' ? 'warning' : 'error',
      code,
      timestamp: new Date(),
    };
  }

  /**
   * Parse terminal error output
   */
  parseTerminalError(output: string, language?: string): TerminalError[] {
    const errors: TerminalError[] = [];
    const lines = output.split("\n");

    lines.forEach((line) => {
      if (!line.trim()) return;

      // Try to match against known patterns
      const detectedLanguage = language || this.detectLanguage(line);
      const patterns = this.errorRegexPatterns.get(detectedLanguage) || [];

      patterns.forEach((pattern) => {
        const match = pattern.exec(line);
        if (match) {
          const error: TerminalError = {
            raw: line,
            language: detectedLanguage,
            errorType: this.extractErrorTypeFromLine(line),
            message: line,
          };
          errors.push(error);
        }
      });
    });

    return errors;
  }

  /**
   * Detect programming language from error output
   */
  private detectLanguage(errorOutput: string): string {
    if (errorOutput.includes("Traceback") || errorOutput.includes("File")) {
      return "python";
    }
    if (
      errorOutput.includes("TypeError") ||
      errorOutput.includes("ReferenceError") ||
      errorOutput.includes("SyntaxError")
    ) {
      return "javascript";
    }
    if (
      errorOutput.includes("Exception") ||
      errorOutput.includes("at java.")
    ) {
      return "java";
    }
    if (
      errorOutput.includes("error:") ||
      errorOutput.includes("undefined reference")
    ) {
      return "cpp";
    }
    if (errorOutput.includes("CS") && errorOutput.includes(":")) {
      return "csharp";
    }
    if (errorOutput.includes("Fatal error") || errorOutput.includes("Parse error")) {
      return "php";
    }
    if (
      errorOutput.includes("Error") ||
      errorOutput.includes("NoMethodError")
    ) {
      return "ruby";
    }
    if (errorOutput.includes("error:") || errorOutput.includes("cannot find")) {
      return "go";
    }
    if (errorOutput.includes("error[E")) {
      return "rust";
    }

    return "unknown";
  }

  /**
   * Extract error type from message
   */
  private extractErrorType(message: string): string {
    const errorMatch = message.match(/(\w+Error|\w+Exception):/);
    if (errorMatch) {
      return errorMatch[1];
    }
    return "UnknownError";
  }

  /**
   * Extract error type from line
   */
  private extractErrorTypeFromLine(line: string): string {
    const patterns = [
      /(\w+Error)/,
      /(\w+Exception)/,
      /error\[E(\d+)\]/,
      /^(Error|Warning|Fatal):/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return "UnknownError";
  }

  /**
   * Extract error code if available
   */
  private extractErrorCode(diagnostic: vscode.Diagnostic): string | undefined {
    if (typeof diagnostic.code === "string") {
      return diagnostic.code;
    }
    if (
      typeof diagnostic.code === "object" &&
      diagnostic.code &&
      "value" in diagnostic.code
    ) {
      return String(diagnostic.code.value);
    }
    return undefined;
  }

  /**
   * Map VS Code severity to our format
   */
  private mapSeverity(
    severity: number
  ): "error" | "warning" | "info" {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return "error";
      case vscode.DiagnosticSeverity.Warning:
        return "warning";
      case vscode.DiagnosticSeverity.Information:
        return "info";
      default:
        return "info";
    }
  }

  /**
   * Highlight errors in editor
   */
  highlightErrors(document: vscode.TextDocument, errors: CodeError[]): void {
    const diagnostics: vscode.Diagnostic[] = errors.map((error) => {
      const range = new vscode.Range(
        new vscode.Position(error.line - 1, error.column - 1),
        new vscode.Position(error.line - 1, error.column + 50)
      );

      return new vscode.Diagnostic(
        range,
        error.errorMessage,
        error.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : error.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information
      );
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Clear diagnostics
   */
  clearDiagnostics(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
