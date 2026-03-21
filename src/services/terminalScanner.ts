#!/usr/bin/env node

/**
 * DEBUGXIA Terminal Scanner
 * Scans terminal output for errors and sends them to the backend
 * This script runs in a separate terminal and monitors for errors
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface TerminalError {
  type: string;
  message: string;
  timestamp: string;
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  language?: string;
  stack?: string;
}

class TerminalScanner {
  private apiUrl: string;
  private apiKey: string;
  private projectPath: string;
  private detectedErrors: TerminalError[] = [];

  constructor(apiUrl: string, apiKey: string, projectPath: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.projectPath = projectPath;
    this.logBanner();
  }

  private logBanner(): void {
    const banner = `
╔═══════════════════════════════════════════════════════════════╗
║          DEBUGXIA Terminal Scanner - Real-time Monitor        ║
║                    Scanning for Errors...                     ║
╚═══════════════════════════════════════════════════════════════╝
    `;
    console.log(banner);
  }

  /**
   * Scan project files for common errors
   */
  async scanProjectFiles(): Promise<void> {
    console.log('📂 Scanning project files for errors...\n');
    
    try {
      const srcPath = path.join(this.projectPath, 'src');
      if (!fs.existsSync(srcPath)) {
        console.log('⚠️  src directory not found');
        return;
      }

      this.scanDirectory(srcPath);
      console.log(`✅ Found ${this.detectedErrors.length} issue(s)\n`);
    } catch (error) {
      console.error('❌ Scanning failed:', error);
    }
  }

  /**
   * Recursively scan directory for TypeScript/JavaScript errors
   */
  private scanDirectory(dir: string, depth: number = 0): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && depth < 3) {
        this.scanDirectory(filePath, depth + 1);
      } else if (file.match(/\.(ts|tsx|js|jsx|py|java)$/)) {
        this.analyzeFile(filePath);
      }
    }
  }

  /**
   * Analyze file for common errors
   */
  private analyzeFile(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);

    lines.forEach((line, index) => {
      // Check for common errors
      if (line.includes('TODO') || line.includes('FIXME')) {
        this.logError({
          type: 'TODO',
          message: line.trim(),
          filePath,
          line: index + 1,
          severity: 'low'
        });
      }

      if (line.includes('console.error') || line.includes('throw new Error')) {
        this.logError({
          type: 'Error Handler',
          message: line.trim(),
          filePath,
          line: index + 1,
          severity: 'medium'
        });
      }

      if (line.match(/any\s*[=:]/)) {
        this.logError({
          type: 'TypeScript Warning',
          message: `Using 'any' type: ${line.trim()}`,
          filePath,
          line: index + 1,
          severity: 'low'
        });
      }

      if (line.includes('//') && line.includes('DANGEROUS')) {
        this.logError({
          type: 'Dangerous Code',
          message: line.trim(),
          filePath,
          line: index + 1,
          severity: 'high'
        });
      }
    });
  }

  /**
   * Log and store detected error
   */
  private logError(error: {
    type: string;
    message: string;
    filePath: string;
    line: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    const terminalError: TerminalError = {
      type: error.type,
      message: error.message,
      timestamp: new Date().toISOString(),
      source: error.filePath,
      severity: error.severity,
      language: path.extname(error.filePath).replace('.', '')
    };

    this.detectedErrors.push(terminalError);
    
    const icon = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
      critical: '⛔'
    }[error.severity];

    console.log(`${icon} [${error.type}] Line ${error.line}: ${error.message}`);
  }

  /**
   * Send detected errors to backend
   */
  async sendErrorsToBackend(): Promise<void> {
    if (this.detectedErrors.length === 0) {
      console.log('ℹ️  No errors to report\n');
      return;
    }

    try {
      console.log(`📤 Sending ${this.detectedErrors.length} error(s) to backend...\n`);

      for (const error of this.detectedErrors) {
        await axios.post(
          `${this.apiUrl}/api/errors/report`,
          {
            error_type: error.type,
            error_message: error.message,
            severity: error.severity,
            file_name: error.source,
            language: error.language,
            created_at: error.timestamp
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      console.log('✅ All errors sent successfully!\n');
    } catch (error) {
      console.error('❌ Failed to send errors:', error);
    }
  }

  /**
   * Start monitoring terminal in real-time
   */
  startMonitoring(): void {
    console.log('👂 Listening for terminal errors...\n');

    process.stdin.on('data', (buffer) => {
      const input = buffer.toString().trim();

      // Detect error messages in terminal
      if (
        input.includes('Error') ||
        input.includes('FATAL') ||
        input.includes('Exception') ||
        input.includes('failed')
      ) {
        console.log('\n🚨 Error detected in terminal!');
        console.log(`   └─ ${input}\n`);

        this.detectedErrors.push({
          type: 'Terminal Error',
          message: input,
          timestamp: new Date().toISOString(),
          source: 'Terminal Output',
          severity: 'high'
        });
      }
    });

    // Periodic scan every 30 seconds
    setInterval(() => {
      this.scanProjectFiles();
    }, 30000);
  }

  /**
   * Run the scanner
   */
  async run(): Promise<void> {
    try {
      await this.scanProjectFiles();
      await this.sendErrorsToBackend();
      this.startMonitoring();
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  }
}

// Initialize and run scanner
const apiUrl = process.env.DEBUGXIA_API_URL || 'http://localhost:3000';
const apiKey = process.env.DEBUGXIA_API_KEY || '';
const projectPath = process.cwd();

const scanner = new TerminalScanner(apiUrl, apiKey, projectPath);
scanner.run();
