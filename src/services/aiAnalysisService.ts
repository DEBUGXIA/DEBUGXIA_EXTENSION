/**
 * AI Analysis Service
 * Uses OpenRouter API (gpt-4o-mini) for accurate code analysis
 * Local syntax detection for instant error scoring
 */

import axios, { AxiosInstance } from "axios";

export interface CodeAnalysis {
  errorScore: number;
  codeQualityScore: number;
  optimizationScore: number;
  summary: string;
  suggestions: string[];
  issues: string[];
}

export class AIAnalysisService {
  private client: AxiosInstance;
  private apiKey: string;
  private apiUrl: string = "https://openrouter.ai/api/v1";
  private model: string = "openai/gpt-4o-mini";
  private analysisCache: Map<string, CodeAnalysis> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey?: string) {
    // Load API key from environment variable or use provided value
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || "";
    
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 60000,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://debugxia.dev",
        "X-Title": "DEBUGXIA"
      },
    });
  }

  /**
   * Analyze code using AI (OpenRouter - gpt-4o-mini)
   */
  async analyzeCode(code: string, language: string, fileName: string): Promise<CodeAnalysis> {
    try {
      // Check cache first
      const cacheKey = `${fileName}:${code.length}`;
      if (this.analysisCache.has(cacheKey)) {
        console.log("⚡ Using cached analysis for:", fileName);
        return this.analysisCache.get(cacheKey)!;
      }

      console.log("🤖 Analyzing code...", { fileName, language, lines: code.split("\n").length });

      // FAST PATH: Local syntax error detection
      const localErrors = this.detectLocalSyntaxErrors(code, language);
      console.log(`📍 Found ${localErrors.errorCount} local syntax errors`);

      // If we found syntax errors, STILL call AI for accurate statistics
      if (localErrors.errorCount > 0) {
        console.log("🤖 Calling AI for accurate error analysis and scoring...");
        try {
          const aiAnalysis = await this.callAIAnalysis(code, language, fileName);
          // Merge local findings with AI analysis
          aiAnalysis.issues = [...new Set([...localErrors.errors, ...aiAnalysis.issues])];
          this.analysisCache.set(cacheKey, aiAnalysis);
          return aiAnalysis;
        } catch (aiError: any) {
          console.error("⚠️ AI analysis failed, using local analysis:", (aiError as any)?.message || String(aiError));
          // Fall back to local analysis
          const analysis = this.buildAnalysisFromLocalErrors(localErrors, code, language, fileName);
          this.analysisCache.set(cacheKey, analysis);
          return analysis;
        }
      }

      // SLOW PATH: Call AI for deeper analysis if no syntax errors
      console.log("📤 Sending to AI for deep analysis...");
      const prompt = this.buildAnalysisPrompt(code, language, fileName);
      
      const requestBody = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: `You are an elite AI code analyzer with expert-level knowledge of all programming languages. Your job is to identify ALL actual errors in code.

SCORING RULES:
- errorScore: MUST be 0 if NO errors found. Only 1-100 if actual errors exist (syntax, logic, security)
- codeQualityScore: 0-100 for design, readability, maintainability
- optimizationScore: 0-100 for performance potential

CRITICAL RESPONSE RULES:
1. ALWAYS respond with ONLY valid JSON - NO explanations, NO markdown, NO comments
2. Follow the exact structure provided
3. Distinguish ERRORS (code is broken) from IMPROVEMENTS (style, performance)
4. Categorize issues by severity: CRITICAL (breaks code), HIGH (major), MEDIUM, LOW
5. Include line numbers for ALL issues
6. Provide actionable fixes for each issue

Your response must be parseable valid JSON.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      };

      const response = await this.client.post("/chat/completions", requestBody);

      if (!response.data || !response.data.choices) {
        console.error("❌ Invalid response from OpenRouter:", response.data);
        return this.getDefaultAnalysis();
      }

      const aiResponse = response.data.choices?.[0]?.message?.content || "";
      console.log("✅ Response received from OpenRouter");
      console.log("📝 AI Response (first 300 chars):", aiResponse.substring(0, 300));

      // Parse JSON from AI response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          console.log("✅ AI Analysis parsed successfully");
          
          const result = {
            errorScore: Math.max(0, Math.min(100, analysis.errorScore ?? 0)),
            codeQualityScore: Math.max(0, Math.min(100, analysis.codeQualityScore ?? 70)),
            optimizationScore: Math.max(0, Math.min(100, analysis.optimizationScore ?? 65)),
            summary: analysis.summary || "Code analyzed",
            suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions : [],
            issues: Array.isArray(analysis.issues) ? analysis.issues : [],
          };
          
          this.analysisCache.set(cacheKey, result);
          return result;
        } catch (parseError) {
          console.error("❌ Failed to parse JSON:", parseError, "Response:", aiResponse);
          return this.getDefaultAnalysis();
        }
      }
      
      console.warn("⚠️ No JSON found in response");
      return this.getDefaultAnalysis();
    } catch (error: any) {
      console.error("❌ AI Analysis error:", error.message);
      if (error.response) {
        console.error("   Status:", error.response.status);
        console.error("   Message:", error.response.data?.error?.message);
      }
      return this.getDefaultAnalysis();
    }
  }

  /**
   * Call AI analysis separately (for verification of detected errors)
   */
  private async callAIAnalysis(code: string, language: string, fileName: string): Promise<CodeAnalysis> {
    console.log("📤 Sending code to AI for analysis...");
    
    const prompt = this.buildAnalysisPrompt(code, language, fileName);
    
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are an elite code analyzer. Analyze code and respond with ONLY valid JSON using this structure exactly:
{
  "errorScore": <0 if NO errors found, 1-100 based on error severity and count>,
  "codeQualityScore": <0-100 based on design, readability, maintainability>,
  "optimizationScore": <0-100 based on performance potential>,
  "summary": "<executive summary>",
  "issues": ["<issue1>", "<issue2>"],
  "suggestions": ["<suggestion1>", "<suggestion2>"]
}

CRITICAL: If code has NO actual syntax/logic errors, errorScore MUST be 0.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    };

    const response = await this.client.post("/chat/completions", requestBody);

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid API response");
    }

    const aiResponse = response.data.choices[0].message.content;
    console.log("✅ AI Response received");

    // Parse JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log(`📊 AI Analysis: error=${analysis.errorScore}, quality=${analysis.codeQualityScore}`);

    return {
      errorScore: Math.max(0, Math.min(100, analysis.errorScore ?? 0)),
      codeQualityScore: Math.max(0, Math.min(100, analysis.codeQualityScore ?? 65)),
      optimizationScore: Math.max(0, Math.min(100, analysis.optimizationScore ?? 60)),
      summary: analysis.summary || "Code analyzed",
      suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions : [],
      issues: Array.isArray(analysis.issues) ? analysis.issues : [],
    };
  }

  /**
   * Detect local syntax errors quickly (no AI call needed)
   */
  private detectLocalSyntaxErrors(code: string, language: string): any {
    const errors: string[] = [];
    const lines = code.split('\n');
    let errorCount = 0;

    if (language === 'python') {
      let inMultilineString = false;
      let stringDelimiter = '';

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        
        if (trimmed.startsWith('#') && !inMultilineString) return;

        // Check for triple-quoted strings
        if (line.includes('"""') || line.includes("'''")) {
          const delimiter = line.includes('"""') ? '"""' : "'''";
          const count = (line.match(new RegExp(delimiter.replace(/'/g, "\\'"), 'g')) || []).length;
          if (count % 2 !== 0) {
            inMultilineString = !inMultilineString;
            stringDelimiter = delimiter;
          }
        }

        if (inMultilineString) return;

        // 1. Unterminated strings - MOST COMMON ERROR
        const singleQuotes = (line.match(/'/g) || []).length;
        const doubleQuotes = (line.match(/"/g) || []).length;
        
        if (singleQuotes % 2 !== 0) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Unterminated string (single quote)`);
          errorCount += 30;
        }
        if (doubleQuotes % 2 !== 0) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Unterminated string (double quote)`);
          errorCount += 30;
        }

        // 2. Missing colon after control structures
        if (/^(class|def|if|elif|else|for|while|with|try|except|finally)\s+/.test(trimmed) && !trimmed.endsWith(':')) {
          const keyword = trimmed.split(' ')[0];
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Missing ':' after '${keyword}'`);
          errorCount += 25;
        }

        // 3. Indentation errors
        if (idx > 0 && trimmed.length > 0) {
          const prevLine = lines[idx - 1].trim();
          if (prevLine.endsWith(':') && !prevLine.startsWith('#')) {
            const currentIndent = line.search(/\S/);
            const prevIndent = lines[idx - 1].search(/\S/);
            if (currentIndent <= prevIndent && prevIndent >= 0 && currentIndent >= 0) {
              errors.push(`Line ${lineNum}: ❌ INDENT ERROR - Expected indentation`);
              errorCount += 20;
            }
          }
        }

        // 4. Typos
        if (/\b(retrun|prrint|imort|fro|whlie)\b/.test(trimmed)) {
          const match = trimmed.match(/\b(retrun|prrint|imort|fro|whlie)\b/);
          if (match) errors.push(`Line ${lineNum}: ⚠️ TYPO - '${match[0]}'`);
          errorCount += 12;
        }

        // 5. Mismatched parentheses
        const openParen = (line.match(/\(/g) || []).length;
        const closeParen = (line.match(/\)/g) || []).length;
        if (openParen !== closeParen) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Mismatched parentheses`);
          errorCount += 18;
        }
      });
    } else if (language === 'javascript' || language === 'typescript') {
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || !trimmed) return;

        // 1. Unterminated strings
        const singleQuotes = (line.match(/'/g) || []).length;
        const doubleQuotes = (line.match(/"/g) || []).length;
        const backticks = (line.match(/`/g) || []).length;
        
        if (singleQuotes % 2 !== 0) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Unterminated string (single quote)`);
          errorCount += 30;
        }
        if (doubleQuotes % 2 !== 0) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Unterminated string (double quote)`);
          errorCount += 30;
        }
        if (backticks % 2 !== 0) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Unterminated template string`);
          errorCount += 30;
        }

        // 2. Missing braces
        if (/^(if|for|while|function)\s*\(/.test(trimmed) && !trimmed.includes('{') && !lines[idx + 1]?.includes('{')) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Missing '{'`);
          errorCount += 20;
        }

        // 3. Typos
        if (/\b(fuction|retrun|consol|vvar|cconst)\b/.test(trimmed)) {
          const match = trimmed.match(/\b(fuction|retrun|consol|vvar|cconst)\b/);
          if (match) errors.push(`Line ${lineNum}: ⚠️ TYPO - '${match[0]}'`);
          errorCount += 12;
        }

        // 4. Mismatched braces/brackets
        const openBrace = (line.match(/\{/g) || []).length;
        const closeBrace = (line.match(/\}/g) || []).length;
        const openBracket = (line.match(/\[/g) || []).length;
        const closeBracket = (line.match(/\]/g) || []).length;
        
        if (openBrace !== closeBrace) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Mismatched braces`);
          errorCount += 18;
        }
        if (openBracket !== closeBracket) {
          errors.push(`Line ${lineNum}: ❌ SYNTAX ERROR - Mismatched brackets`);
          errorCount += 18;
        }
      });
    }

    return { errorCount, errors };
  }

  /**
   * Build analysis from local errors with AI verification for accuracy
   */
  private buildAnalysisFromLocalErrors(localErrors: any, code: string, language: string, fileName: string): CodeAnalysis {
    const errorCount = localErrors.errorCount;
    
    // Map error count to realistic error scores
    let errorScore = 0;
    let codeQualityScore = 0;
    let optimizationScore = 0;

    if (errorCount === 0) {
      // No errors - excellent code
      errorScore = 0;
      codeQualityScore = 85;
      optimizationScore = 75;
    } else if (errorCount < 10) {
      // Minor errors
      errorScore = 25;
      codeQualityScore = 60;
      optimizationScore = 65;
    } else if (errorCount < 20) {
      // Moderate errors
      errorScore = 50;
      codeQualityScore = 40;
      optimizationScore = 45;
    } else if (errorCount < 40) {
      // Serious errors
      errorScore = 75;
      codeQualityScore = 25;
      optimizationScore = 30;
    } else {
      // Critical errors
      errorScore = 95;
      codeQualityScore = 10;
      optimizationScore = 15;
    }

    const summary = errorCount > 0 
      ? `🔴 Found ${errorCount} errors: ${localErrors.errors[0]}${localErrors.errors.length > 1 ? ' and more...' : ''}`
      : `✅ No syntax errors detected`;

    console.log(`📊 Error Analysis: score=${errorScore}, quality=${codeQualityScore}, optimization=${optimizationScore}`);

    return {
      errorScore,
      codeQualityScore,
      optimizationScore,
      summary,
      suggestions: localErrors.errors.length > 0 
        ? localErrors.errors 
        : ["Code looks good! Consider adding comments", "Add type hints for better clarity"],
      issues: localErrors.errors,
    };
  }

  /**
   * Build analysis prompt for AI - INSANELY ACCURATE VERSION
   */
  private buildAnalysisPrompt(code: string, language: string, fileName: string): string {
    return `You are an elite code analyzer with 20+ years of experience. Carefully analyze this ${language} code file "${fileName}".

SCORING RULES:
- errorScore: MUST be 0 if code has NO syntax/logic errors. Only increase if actual errors found (1-100 scale of severity)
- codeQualityScore: 0-100 based on readability, design, maintainability, best practices
- optimizationScore: 0-100 based on performance potential and efficiency

CRITICAL INSTRUCTIONS:
1. Identify ALL actual errors: syntax errors, logic errors, security vulnerabilities
2. Distinguish between ERRORS (code won't run/is broken) and IMPROVEMENTS (style, performance)
3. Categorize by severity: CRITICAL (breaks code), HIGH (wrong behavior), MEDIUM (inefficient), LOW (style)
4. Provide exact line numbers for each issue
5. If NO ERRORS found, set errorScore to 0

Return ONLY valid JSON:
{
  "errorScore": <0-100: 0 if no errors, 1-100 based on error severity>,
  "codeQualityScore": <0-100 based on design, readability, maintainability>,
  "optimizationScore": <0-100 based on performance potential>,
  "summary": "<1-2 sentence executive summary>",
  "issues": [
    {
      "line": <line number>,
      "type": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "category": "<syntax|logic|security|performance|bestpractice>",
      "issue": "<specific problem description>",
      "fix": "<exact fix or suggestion>"
    }
  ],
  "suggestions": [
    "<actionable improvement #1>",
    "<actionable improvement #2>"
  ]
}

Code to analyze:
\`\`\`${language}
${code}
\`\`\`

ANALYZE NOW. Return ONLY valid JSON.`;
  }

  /**
   * Fix errors in code using AI
   */
  async fixErrors(code: string, language: string): Promise<string> {
    try {
      console.log("🤖 Fixing errors with AI...");

      const response = await this.client.post("/chat/completions", {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert code fixer. Fix all errors in the provided code. Respond with ONLY the corrected code, no explanations.",
          },
          {
            role: "user",
            content: `Fix all errors in this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      });

      const fixedCode = response.data.choices?.[0]?.message?.content || code;
      console.log("✅ Errors fixed by AI");
      
      // Extract code from markdown if wrapped
      const codeMatch = fixedCode.match(/```[\s\S]*?\n([\s\S]*?)\n```/) || fixedCode.match(/```[\s\S]*?(?:\n([\s\S]*?))?```/);
      return codeMatch ? codeMatch[1].trim() : fixedCode.trim();
    } catch (error) {
      console.error("❌ Error fixing:", error);
      return code;
    }
  }

  /**
   * Optimize code using AI
   */
  async optimizeCode(code: string, language: string): Promise<string> {
    try {
      console.log("🤖 Optimizing code with AI...");

      const response = await this.client.post("/chat/completions", {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert code optimizer. Optimize the code for performance, readability, and best practices. Respond with ONLY the optimized code, no explanations.",
          },
          {
            role: "user",
            content: `Optimize this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      });

      const optimizedCode = response.data.choices?.[0]?.message?.content || code;
      console.log("✅ Code optimized by AI");
      
      // Extract code from markdown if wrapped
      const codeMatch = optimizedCode.match(/```[\s\S]*?\n([\s\S]*?)\n```/) || optimizedCode.match(/```[\s\S]*?(?:\n([\s\S]*?))?```/);
      return codeMatch ? codeMatch[1].trim() : optimizedCode.trim();
    } catch (error) {
      console.error("❌ Error optimizing:", error);
      return code;
    }
  }

  /**
   * Analyze terminal error using AI
   */
  async fixTerminalError(errorMessage: string): Promise<string> {
    try {
      console.log("🤖 Analyzing terminal error with AI...");

      const response = await this.client.post("/chat/completions", {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert debugger. Explain the terminal error and suggest fixes. Be concise.",
          },
          {
            role: "user",
            content: `Analyze this error:\n${errorMessage}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 512,
      });

      const explanation = response.data.choices?.[0]?.message?.content || "Unable to analyze error.";
      console.log("✅ Terminal error analyzed by AI");
      return explanation;
    } catch (error) {
      console.error("❌ Error analyzing terminal:", error);
      return "Unable to analyze terminal error.";
    }
  }

  /**
   * Default analysis when API fails
   */
  private getDefaultAnalysis(): CodeAnalysis {
    return {
      errorScore: 0,
      codeQualityScore: 50,
      optimizationScore: 50,
      summary: "Local analysis only - AI service unavailable. Using syntax checking.",
      suggestions: ["Verify API key is valid", "Check internet connection", "Review code for syntax errors"],
      issues: ["Could not reach AI service - local analysis only"],
    };
  }

  /**
   * Test if API key is valid
   */
  async testApiKey(): Promise<boolean> {
    try {
      console.log("🔑 Testing Together.ai API key...");
      
      const response = await this.client.post("/chat/completions", {
        model: this.model,
        messages: [{
          role: "user",
          content: "Respond with: OK"
        }],
        max_tokens: 10,
      });

      if (response.status === 200 && response.data.choices) {
        console.log("✅ API Key is VALID!");
        return true;
      }
      
      console.error("❌ API Key test failed: Invalid response");
      return false;
    } catch (error: any) {
      console.error("❌ API Key test failed:", error);
      if (error.response?.status === 401) {
        console.error("   ERROR: Unauthorized - API key is invalid or expired");
      } else if (error.response?.status === 429) {
        console.error("   ERROR: Rate limited - Too many requests");
      } else if (error.response?.data?.error) {
        console.error("   ERROR:", error.response.data.error.message);
      }
      return false;
    }
  }

  /**
   * Set API Key
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 60000,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    console.log("🔑 API Key updated");
  }

  /**
   * Set Model
   */
  setModel(model: string): void {
    this.model = model;
    console.log("🤖 Model switched to:", model);
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get API URL
   */
  getApiUrl(): string {
    return this.apiUrl;
  }
}
