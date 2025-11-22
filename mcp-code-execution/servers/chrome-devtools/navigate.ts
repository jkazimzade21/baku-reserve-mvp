/**
 * Navigation tool for Chrome DevTools
 * Minimal interface - loads only when needed
 */

import { MCPClient } from '../../lib/mcp-client';

export interface NavigateOptions {
  url?: string;
  type?: 'url' | 'back' | 'forward' | 'reload';
  timeout?: number;
  ignoreCache?: boolean;
}

/**
 * Navigate the currently selected page
 * @param urlOrOptions - URL string or navigation options
 * @returns Promise<void>
 */
export async function navigate(urlOrOptions: string | NavigateOptions): Promise<void> {
  const client = await MCPClient.getInstance();

  const options: NavigateOptions = typeof urlOrOptions === 'string'
    ? { url: urlOrOptions, type: 'url' }
    : urlOrOptions;

  return client.call('chrome-devtools', 'navigate_page', options);
}

/**
 * Navigate to a URL and wait for it to load
 */
export async function navigateAndWait(url: string, waitFor?: string): Promise<void> {
  await navigate(url);
  if (waitFor) {
    const { waitFor: waitForElement } = await import('./waitFor');
    await waitForElement(waitFor);
  }
}

/**
 * Navigate back in browser history
 */
export async function back(): Promise<void> {
  return navigate({ type: 'back' });
}

/**
 * Navigate forward in browser history
 */
export async function forward(): Promise<void> {
  return navigate({ type: 'forward' });
}

/**
 * Reload the current page
 */
export async function reload(ignoreCache = false): Promise<void> {
  return navigate({ type: 'reload', ignoreCache });
}