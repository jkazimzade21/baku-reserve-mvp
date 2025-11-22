/**
 * Wait tool for Chrome DevTools
 * Wait for elements and conditions
 */

import { MCPClient } from '../../lib/mcp-client';

/**
 * Wait for text to appear on the page
 */
export async function waitFor(text: string, timeout?: number): Promise<void> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'wait_for', {
    text,
    timeout
  });
}

/**
 * Wait for element to appear (with retries)
 */
export async function waitForElement(
  finder: () => Promise<any>,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<any> {
  const { timeout = 10000, interval = 500 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = await finder();
    if (element) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Element not found within ${timeout}ms`);
}

/**
 * Wait for page to be idle (no network activity)
 */
export async function waitForIdle(timeout = 2000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeout));
}