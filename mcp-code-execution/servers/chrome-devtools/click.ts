/**
 * Click tool for Chrome DevTools
 * Interact with page elements efficiently
 */

import { MCPClient } from '../../lib/mcp-client';

/**
 * Click on an element by its UID
 */
export async function click(uid: string, doubleClick = false): Promise<void> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'click', {
    uid,
    dblClick: doubleClick
  });
}

/**
 * Double-click on an element
 */
export async function doubleClick(uid: string): Promise<void> {
  return click(uid, true);
}

/**
 * Click and wait for navigation
 */
export async function clickAndWait(uid: string, waitFor?: string): Promise<void> {
  await click(uid);

  if (waitFor) {
    const { waitFor: waitForElement } = await import('./waitFor');
    await waitForElement(waitFor);
  }
}