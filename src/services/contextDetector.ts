/**
 * Context Detector Service
 * Detects current file and project context
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface CodeContext {
  fileName: string;
  filePath: string;
  fileExtension: string;
  fileContent: string;
  projectPath: string;
  projectName: string;
  language: string;
  lineCount: number;
}

export class ContextDetector {
  /**
   * Get current file context
   */
  static getCurrentFileContext(): CodeContext | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      console.warn("⚠️ No active editor");
      return null;
    }

    const document = editor.document;
    const fileName = path.basename(document.fileName);
    const fileExtension = path.extname(document.fileName);
    const fileContent = document.getText();
    const language = document.languageId;

    // Get project folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const projectPath = workspaceFolders ? workspaceFolders[0].uri.fsPath : "";
    const projectName = workspaceFolders ? workspaceFolders[0].name : "Unknown Project";

    const context: CodeContext = {
      fileName,
      filePath: document.fileName,
      fileExtension,
      fileContent,
      projectPath,
      projectName,
      language,
      lineCount: document.lineCount,
    };

    console.log("✅ Context detected:", {
      fileName,
      language,
      lines: context.lineCount,
      project: projectName,
    });

    return context;
  }

  /**
   * Get project name
   */
  static getProjectName(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders ? workspaceFolders[0].name : "Unknown Project";
  }

  /**
   * Get project path
   */
  static getProjectPath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders ? workspaceFolders[0].uri.fsPath : "";
  }

  /**
   * Get language from file extension
   */
  static getLanguageFromExtension(ext: string): string {
    const languageMap: { [key: string]: string } = {
      ".py": "python",
      ".js": "javascript",
      ".ts": "typescript",
      ".jsx": "javascript",
      ".tsx": "typescript",
      ".java": "java",
      ".cpp": "c++",
      ".c": "c",
      ".cs": "csharp",
      ".php": "php",
      ".rb": "ruby",
      ".go": "go",
      ".rs": "rust",
      ".html": "html",
      ".css": "css",
      ".json": "json",
    };

    return languageMap[ext] || ext.replace(".", "");
  }

  /**
   * Get short summary of code
   */
  static getCodeSummary(content: string, language: string): string {
    const lines = content.split("\n").length;
    const functions = (content.match(/function|def|func|=>|=>/g) || []).length;
    const classes = (content.match(/class|interface|struct/g) || []).length;

    return `${lines} lines | ${functions} functions | ${classes} classes`;
  }
}
