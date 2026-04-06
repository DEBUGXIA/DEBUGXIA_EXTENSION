/**
 * Storage Service
 * Manages session-based storage and user data
 * Uses workspaceState for session storage (cleared on extension close or workspace switch)
 */

import * as vscode from "vscode";

export class StorageService {
  private context: vscode.ExtensionContext;
  private userId: string;
  private storageKey = "aiCodeMentor";

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.userId = this.loadOrCreateUserId();
    console.log('✅ StorageService initialized with workspaceState (SESSION-BASED - clears on close)');
  }

  /**
   * Load or create user ID (stored in globalState for persistence)
   */
  private loadOrCreateUserId(): string {
    let userId = this.context.globalState.get<string>(`${this.storageKey}.userId`);

    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.context.globalState.update(`${this.storageKey}.userId`, userId);
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
   * Save setting to session storage (cleared on close)
   */
  async saveSetting(key: string, value: any): Promise<void> {
    const fullKey = `${this.storageKey}.${key}`;
    console.log(`💾 Saving to workspaceState (SESSION): ${fullKey}`);
    await this.context.workspaceState.update(fullKey, value);
  }

  /**
   * Get setting from session storage
   */
  getSetting<T>(key: string, defaultValue?: T): T | undefined {
    const fullKey = `${this.storageKey}.${key}`;
    const value = this.context.workspaceState.get<T>(fullKey, defaultValue);
    console.log(`📖 Retrieved from workspaceState (SESSION): ${fullKey}, found: ${value ? 'YES' : 'NO'}`);
    return value;
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
   * Save error history with AI analysis - SESSION based
   */
  async saveError(errorData: any): Promise<void> {
    const errors = this.getSetting<any[]>("errorHistory", []) || [];
    errors.push({ ...errorData, timestamp: Date.now() });
    const trimmed = errors.slice(-100); // Keep last 100
    console.log(`📝 Saved error #${errors.length} to session storage`);
    await this.saveSetting("errorHistory", trimmed);
  }

  /**
   * Save AI analysis results for statistics - SESSION based
   */
  async saveAnalysis(analysisData: any): Promise<void> {
    const analyses = this.getSetting<any[]>("analysisHistory", []) || [];
    analyses.push({ ...analysisData, timestamp: Date.now() });
    const trimmed = analyses.slice(-50); // Keep last 50
    console.log(`📊 Saved analysis #${analyses.length} to session storage: ${analysisData.displayName}`);
    await this.saveSetting("analysisHistory", trimmed);
  }

  /**
   * Get all analysis history from session storage
   */
  getAnalysisHistory(): any[] {
    const history = this.getSetting<any[]>("analysisHistory", []) || [];
    console.log(`📋 Retrieved ${history.length} analyses from session storage`);
    return history;
  }

  /**
   * Get error history from session storage
   */
  getErrorHistory(): any[] {
    const history = this.getSetting<any[]>("errorHistory", []) || [];
    console.log(`📋 Retrieved ${history.length} errors from session storage`);
    return history;
  }

  /**
   * Clear error history
   */
  async clearErrorHistory(): Promise<void> {
    console.log('🗑️ Clearing error history from session storage');
    await this.saveSetting("errorHistory", []);
  }

  /**
   * Clear analysis history
   */
  async clearAnalysisHistory(): Promise<void> {
    console.log('🗑️ Clearing analysis history from session storage');
    await this.saveSetting("analysisHistory", []);
  }
}
