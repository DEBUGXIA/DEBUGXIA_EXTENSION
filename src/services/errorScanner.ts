/**
 * Error Scanner Service
 * Scans the entire codebase for files with errors using AI
 */

import * as vscode from "vscode";
import * as path from "path";
import { AIAnalysisService } from "./aiAnalysisService";
import { StorageService } from "./storageService";

export interface ErrorFileReport {
  filePath: string;
  fileName: string;
  errorScore: number;
  issues: string[];
  summary: string;
  language: string;
  timestamp: number;
}

export class ErrorScanner {
  private isScanning = false;
  private scanResults: ErrorFileReport[] = [];

  constructor(
    private aiAnalysisService: AIAnalysisService,
    private storageService: StorageService
  ) {}

  /**
   * Get all Python files from current workspace ONLY
   */
  private async getPythonFiles(): Promise<vscode.Uri[]> {
    try {
      console.log('🔍 Searching for Python files in workspace...');
      
      // Check if workspace is open
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        console.warn('⚠️ No workspace folder is open');
        vscode.window.showErrorMessage('❌ No workspace folder open! Please open a folder first.');
        return [];
      }

      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      console.log('📁 Workspace path:', workspacePath);

      // Search ONLY within the workspace folder
      const pythonFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 100);
      
      // Double-check: only include files that are inside the workspace folder
      const workspaceFiles = pythonFiles.filter(file => {
        const isInWorkspace = file.fsPath.startsWith(workspacePath);
        if (!isInWorkspace) {
          console.log(`⚠️ Skipping file outside workspace: ${file.fsPath}`);
        }
        return isInWorkspace;
      });

      console.log(`📊 Found ${pythonFiles.length} Python files, ${workspaceFiles.length} in workspace`);
      
      // Filter out test files and temporary files
      const excludePatterns = [
        /^test/i,                    // test*.py
        /test$/i,                    // *test.py
        /testfail/i,                 // testfail*.py (demo files)
        /demo/i,                     // demo*.py
        /sample/i,                   // sample*.py
        /fixture/i,                  // fixture*.py
        /mock/i,                     // mock*.py
        /_old/i,                     // *_old.py
        /temp/i,                     // temp*.py
        /tmp/i,                      // tmp*.py
        /\btest\b/i,                // any file with 'test' in name
      ];
      
      const filteredFiles = workspaceFiles.filter(file => {
        const fileName = file.fsPath.split('\\').pop()?.split('/').pop() || '';
        return !excludePatterns.some(pattern => pattern.test(fileName));
      });
      
      console.log(`✅ Filtered to ${filteredFiles.length} production files for scanning`);
      return filteredFiles;
    } catch (error) {
      console.error('❌ Error getting Python files:', error);
      return [];
    }
  }

  /**
   * Scan all files for errors
   */
  async scanForErrors(onProgress?: (current: number, total: number) => void): Promise<ErrorFileReport[]> {
    if (this.isScanning) {
      console.warn('⚠️ Scan already in progress');
      return [];
    }

    this.isScanning = true;
    this.scanResults = [];

    try {
      console.log('🚀 Starting error scan...');
      const files = await this.getPythonFiles();
      
      if (files.length === 0) {
        console.log('⚠️ No Python files found to scan');
        vscode.window.showWarningMessage('No Python files found in workspace');
        this.isScanning = false;
        return [];
      }

      console.log(`📊 Scanning ${files.length} files for errors...`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(i + 1, files.length);
        
        try {
          // Read file
          const fileContent = await vscode.workspace.fs.readFile(file);
          const text = new TextDecoder().decode(fileContent);
          
          const fileName = path.basename(file.fsPath);
          const language = path.extname(file.fsPath).slice(1) || 'python';
          
          console.log(`🔍 Analyzing [${i + 1}/${files.length}]: ${fileName}`);
          
          // Get AI analysis
          const analysis = await this.aiAnalysisService.analyzeCode(text, language, fileName);
          
          // Only include files with errors (errorScore > 0)
          if (analysis.errorScore > 0) {
            const report: ErrorFileReport = {
              filePath: file.fsPath,
              fileName: fileName,
              errorScore: analysis.errorScore,
              issues: analysis.issues || [],
              summary: analysis.summary || 'File contains errors',
              language: language,
              timestamp: Date.now(),
            };
            
            this.scanResults.push(report);
            console.log(`⚠️ Found errors in ${fileName} (score: ${analysis.errorScore})`);
            
            // Save to storage
            const lines = text.split('\n').length;
            const functionCount = (text.match(/^def /gm) || []).length;
            const classCount = (text.match(/^class /gm) || []).length;
            
            await this.storageService.saveAnalysis({
              fileName: file.fsPath,
              displayName: fileName,
              language,
              lines,
              functions: functionCount,
              classes: classCount,
              errorScore: analysis.errorScore,
              codeQualityScore: analysis.codeQualityScore,
              optimizationScore: analysis.optimizationScore,
              summary: analysis.summary,
              issues: analysis.issues,
              suggestions: analysis.suggestions,
              timestamp: Date.now(),
            });
          } else {
            console.log(`✅ No errors in ${fileName}`);
          }
        } catch (err) {
          console.error(`❌ Error analyzing ${file.fsPath}:`, err);
        }
      }

      console.log(`\n✅ Scan complete! Found ${this.scanResults.length} files with errors`);
      this.isScanning = false;
      
      return this.scanResults;
      
    } catch (error) {
      console.error('❌ Error during scan:', error);
      this.isScanning = false;
      throw error;
    }
  }

  /**
   * Get last scan results
   */
  getResults(): ErrorFileReport[] {
    return this.scanResults;
  }

  /**
   * Check if scan is in progress
   */
  isScanning_(): boolean {
    return this.isScanning;
  }
}
