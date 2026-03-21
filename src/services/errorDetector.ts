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

    // Check if VS Code has built-in diagnostics
    const vscodeErrors = vscode.languages.getDiagnostics(document.uri);

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

    return errors;
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
