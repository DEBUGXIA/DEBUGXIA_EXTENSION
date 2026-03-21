/**
 * API Client Service
 * Communicates with backend for AI analysis and user data
 */

import * as vscode from "vscode";
import axios, { AxiosInstance } from "axios";
import {
  AIRequest,
  AIExplanation,
  CodeSuggestion,
  UserAnalytics,
  ApiResponse,
} from "../types";

export class ApiClient {
  private client: AxiosInstance;
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000,
    });
  }

  /**
   * Analyze code and get AI explanation
   */
  async analyzeError(request: AIRequest): Promise<AIExplanation | null> {
    try {
      const response = await this.client.post<ApiResponse<AIExplanation>>(
        "/api/v1/analyze/error",
        request
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error("Error analyzing error:", error);
      return null;
    }
  }

  /**
   * Get code improvement suggestions
   */
  async getSuggestions(code: string, language: string): Promise<CodeSuggestion[]> {
    try {
      const response = await this.client.post<ApiResponse<CodeSuggestion[]>>(
        "/api/v1/suggestions",
        { code, language }
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error("Error getting suggestions:", error);
      return [];
    }
  }

  /**
   * Get or create user analytics
   */
  async getUserAnalytics(userId: string): Promise<UserAnalytics | null> {
    try {
      const response = await this.client.get<ApiResponse<UserAnalytics>>(
        `/api/v1/analytics/${userId}`
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error("Error fetching analytics:", error);
      return null;
    }
  }

  /**
   * Log error to backend for tracking
   */
  async logError(
    userId: string,
    errorData: {
      language: string;
      errorType: string;
      errorMessage: string;
      severity: string;
      file: string;
      line: number;
    }
  ): Promise<boolean> {
    try {
      const response = await this.client.post<ApiResponse<void>>(
        `/api/v1/errors/log/${userId}`,
        errorData
      );

      return response.data.success;
    } catch (error) {
      console.error("Error logging error:", error);
      return false;
    }
  }

  /**
   * Apply fix suggestion
   */
  async applyFix(
    userId: string,
    errorId: string,
    fixCode: string
  ): Promise<boolean> {
    try {
      const response = await this.client.post<ApiResponse<void>>(
        `/api/v1/fixes/apply/${userId}`,
        { errorId, fixCode }
      );

      return response.data.success;
    } catch (error) {
      console.error("Error applying fix:", error);
      return false;
    }
  }

  /**
   * Process terminal error message
   */
  async processTerminalError(
    userId: string,
    errorOutput: string
  ): Promise<AIExplanation | null> {
    try {
      const response = await this.client.post<ApiResponse<AIExplanation>>(
        "/api/v1/analyze/terminal-error",
        { errorOutput, userId }
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error("Error processing terminal error:", error);
      return null;
    }
  }

  /**
   * Chat with AI assistant
   */
  async chatWithAI(
    userId: string,
    message: string,
    context?: string
  ): Promise<string> {
    try {
      const response = await this.client.post<ApiResponse<{ reply: string }>>(
        "/api/v1/chat",
        { userId, message, context }
      );

      if (response.data.success && response.data.data) {
        return response.data.data.reply;
      }
      return "Unable to process your request. Please try again.";
    } catch (error) {
      console.error("Error in chat:", error);
      return "Connection error. Please check your API configuration.";
    }
  }

  /**
   * Update API configuration
   */
  setConfig(apiUrl: string, apiKey: string): void {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000,
    });
  }

  /**
   * Health check for API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get("/api/v1/health");
      return response.status === 200;
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }
}
