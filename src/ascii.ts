/**
 * DEBUGXIA ASCII Art and Banner
 */

export const DEBUGXIA_ASCII = `
 ___  ___ ___  ___ ___ _   _ _  _ ___  _   _   _
|   \\| __| _ )| _ \\ _ \\ | | | ||_)| |  | \\_/ |  / |
| |) | _|| _ \\|  _/  _/ |_| | || \\| |__ \\_/ /  /_/ 
|___/|___|___/|_| |_|  \\___/|_||_|\\_|_______| /___\\ 

 ___ ___ _   _ _  _ _   _ ___  ___  ___  _ __  ___
| __/ __| | | | ||_| | | / _ \\| _ \\/ _ \\| '_ \\/ __|
|_|\\__ \\ |_| | || | | |_| (_) | // (_) | | | \\__ \\
|___/___/\\___/|_||_|  \\___/\\___/|___|\\___/|_| |_|___/

AI-Powered Error Scanning & Analysis
   v0.1.0 - Beta Release
`;

export const SCANNER_STARTING = `
    🔍 DEBUGXIA Scanner Initializing...
       ├─ Scanning workspace for errors
       ├─ Monitoring terminal output
       ├─ Analyzing code patterns
       └─ Ready to detect issues
`;

export const DEBUGXIA_BANNER = `
████████████████████████████████████████████████████
█  DEBUGXIA - Advanced Code Debugging & Analysis  █
████████████████████████████████████████████████████
`;

export const SCANNER_ACTIVE = `
    ✅ DEBUGXIA Scanner Active
       └─ Watching for errors in real-time...
`;

export function displayBanner(): string {
  const timestamp = new Date().toLocaleTimeString();
  return `${DEBUGXIA_ASCII}\n[${timestamp}] Extension activated!\n${SCANNER_STARTING}`;
}
