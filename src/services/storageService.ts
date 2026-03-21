/**
 * Storage Service
 * Manages persistent storage and user data
 */

import * as vscode from "vscode";

export class StorageService {
  private context: vscode.ExtensionContext;
  private userId: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.userId = this.loadOrCreateUserId();
  }

  /**
   * Load or create user ID
   */
  private loadOrCreateUserId(): string {
    let userId = this.context.globalState.get<string>("aiCodeMentor.userId");

    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.context.globalState.update("aiCodeMentor.userId", userId);
    }

    return userId;
  }

  /**
   * Get user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Save setting
   */
  async saveSetting(key: string, value: any): Promise<void> {
    await this.context.globalState.update(`aiCodeMentor.${key}`, value);
  }

  /**
   * Get setting
   */
  getSetting<T>(key: string, defaultValue?: T): T | undefined {
    return this.context.globalState.get<T>(`aiCodeMentor.${key}`, defaultValue);
  }

  /**
   * Save API key securely
   */
  async saveApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store("aiCodeMentor.apiKey", apiKey);
  }

  /**
   * Get API key securely
   */
  async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get("aiCodeMentor.apiKey");
  }

  /**
   * Save error history with AI analysis
   */
  async saveError(errorData: any): Promise<void> {
    const errors = this.getSetting<any[]>("errorHistory", []);
    errors.push({ ...errorData, timestamp: Date.now() });
    await this.saveSetting("errorHistory", errors.slice(-100)); // Keep last 100
  }

  /**
   * Save AI analysis results for statistics
   */
  async saveAnalysis(analysisData: any): Promise<void> {
    const analyses = this.getSetting<any[]>("analysisHistory", []);
    analyses.push({ ...analysisData, timestamp: Date.now() });
    await this.saveSetting("analysisHistory", analyses.slice(-50)); // Keep last 50
  }

  /**
   * Get all analysis history for statistics
   */
  getAnalysisHistory(): any[] {
    return this.getSetting<any[]>("analysisHistory", []);
  }

  /**
   * Get error history
   */
  getErrorHistory(): any[] {
    return this.getSetting<any[]>("errorHistory", []);
  }

  /**
   * Clear error history
   */
  async clearErrorHistory(): Promise<void> {
    await this.saveSetting("errorHistory", []);
  }
}
