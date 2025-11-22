/**
 * Chrome DevTools MCP Server
 * Progressive disclosure interface for browser automation
 *
 * Tools are loaded on-demand to minimize context usage.
 * Each tool is a separate module that can be imported as needed.
 */

export interface ChromeDevToolsServer {
  name: string;
  version: string;
  description: string;
  availableTools: string[];
}

export const server: ChromeDevToolsServer = {
  name: "chrome-devtools",
  version: "0.10.2",
  description: "Browser automation and testing through Chrome DevTools Protocol",
  availableTools: [
    "navigate",      // Navigate to URLs
    "screenshot",    // Capture screenshots
    "click",         // Click elements
    "fill",          // Fill form inputs
    "snapshot",      // Take page snapshots
    "listPages",     // List open pages
    "newPage",       // Open new page
    "closePage",     // Close page
    "selectPage",    // Select active page
    "evaluate",      // Execute JavaScript
    "waitFor",       // Wait for elements
    "hover",         // Hover over elements
    "pressKey",      // Press keyboard keys
    "drag",          // Drag and drop
    "resize",        // Resize viewport
    "emulate",       // Emulate devices
    "performance",   // Performance monitoring
    "network",       // Network monitoring
    "console",       // Console monitoring
  ]
};

/**
 * Discover available tools in this server
 * Returns a list of tool names and their descriptions
 */
export function discoverTools(): Array<{name: string, description: string}> {
  return server.availableTools.map(tool => ({
    name: tool,
    description: `Load with: import { ${tool} } from './servers/chrome-devtools/${tool}'`
  }));
}

/**
 * Get tool module path for dynamic imports
 */
export function getToolPath(toolName: string): string {
  if (!server.availableTools.includes(toolName)) {
    throw new Error(`Tool '${toolName}' not found in chrome-devtools server`);
  }
  return `./servers/chrome-devtools/${toolName}`;
}
