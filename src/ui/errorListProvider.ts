/**
 * Error List Tree Provider
 * Displays all errors in a tree view
 */

import * as vscode from "vscode";
import { ErrorDetector } from "../services/errorDetector";

export class ErrorListProvider
  implements vscode.TreeDataProvider<ErrorTreeItem>
{
  private errorDetector: ErrorDetector;
  private _onDidChangeTreeData: vscode.EventEmitter<
    ErrorTreeItem | undefined | null | void
  > = new vscode.EventEmitter<ErrorTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ErrorTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(errorDetector: ErrorDetector) {
    this.errorDetector = errorDetector;
  }

  getTreeItem(element: ErrorTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ErrorTreeItem): Promise<ErrorTreeItem[]> {
    if (element) {
      return [];
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const errors = await this.errorDetector.analyzeDocument(editor.document);
    return errors.map(
      (error) =>
        new ErrorTreeItem(
          `[${error.errorType}] ${error.errorMessage}`,
          error.line,
          error.severity,
          error
        )
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class ErrorTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly line: number,
    public readonly severity: string,
    public readonly errorData: any
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `Line ${line}`;
    this.iconPath = this.getIconPath();
    this.command = {
      title: "Go to error",
      command: "aiCodeMentor.explainError",
      arguments: [line],
    };
  }

  private getIconPath(): vscode.ThemeIcon {
    switch (this.severity) {
      case "error":
        return new vscode.ThemeIcon("error");
      case "warning":
        return new vscode.ThemeIcon("warning");
      default:
        return new vscode.ThemeIcon("info");
    }
  }
}
