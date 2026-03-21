/**
 * Type definitions for AI Code Mentor Extension
 */

export interface CodeError {
  id: string;
  language: string;
  file: string;
  line: number;
  column: number;
  errorType: string;
  errorMessage: string;
  severity: "error" | "warning" | "info";
  code?: string;
  timestamp: Date;
}

export interface AIExplanation {
  errorType: string;
  explanation: string;
  why: string;
  solution: string;
  exampleCode: string;
  tips: string[];
}

export interface CodeSuggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  originalCode: string;
  suggestedCode: string;
  impact: string;
  confidence: number;
}

export interface UserAnalytics {
  userId: string;
  date: Date;
  totalErrors: number;
  fixedErrors: number;
  commonErrors: string[];
  codeQualityScore: number;
  improvementPercentage: number;
  languages: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AIRequest {
  code: string;
  language: string;
  errorType: string;
  errorMessage: string;
  context?: string;
  userId?: string;
}

export interface TerminalError {
  raw: string;
  language?: string;
  errorType?: string;
  line?: number;
  message: string;
}

export interface ExtensionConfig {
  apiUrl: string;
  apiKey: string;
  enableAutoAnalysis: boolean;
  enableTerminalAnalysis: boolean;
  theme: "dark" | "light";
  supportedLanguages: string[];
}
