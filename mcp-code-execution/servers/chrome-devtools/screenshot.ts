/**
 * Screenshot tool for Chrome DevTools
 * Capture visual state with minimal context overhead
 */

import { MCPClient } from '../../lib/mcp-client';

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;  // 0-100, for JPEG/WebP
  fullPage?: boolean;
  uid?: string;  // Element UID from snapshot
  filePath?: string;  // Save to file instead of returning
}

/**
 * Capture a screenshot of the current page or element
 */
export async function screenshot(options: ScreenshotOptions = {}): Promise<Buffer | void> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'take_screenshot', options);
}

/**
 * Capture full page screenshot
 */
export async function fullPageScreenshot(filePath?: string): Promise<Buffer | void> {
  return screenshot({
    fullPage: true,
    filePath
  });
}

/**
 * Capture element screenshot
 */
export async function elementScreenshot(
  uid: string,
  filePath?: string
): Promise<Buffer | void> {
  return screenshot({
    uid,
    filePath
  });
}

/**
 * Capture and compare screenshots for visual regression testing
 */
export async function captureForComparison(
  name: string,
  options: ScreenshotOptions = {}
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = `./screenshots/${name}-${timestamp}.png`;

  await screenshot({
    ...options,
    filePath,
    format: 'png'
  });

  console.log(`Screenshot saved: ${filePath}`);
}