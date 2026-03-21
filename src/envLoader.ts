import * as fs from "fs";
import * as path from "path";

/**
 * Load environment variables from .env file
 */
export function loadEnvFile(extensionPath: string): void {
  try {
    const envPath = path.join(extensionPath, ".env");
    
    if (!fs.existsSync(envPath)) {
      console.log("⚠️  .env file not found at:", envPath);
      return;
    }

    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
        process.env[key] = value;
        
        // Log for debugging (but hide API key)
        if (key === "OPENROUTER_API_KEY") {
          console.log(`✅ Loaded environment variable: ${key} = ${value.substring(0, 20)}...`);
        } else {
          console.log(`✅ Loaded environment variable: ${key}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error loading .env file:", error);
  }
}
