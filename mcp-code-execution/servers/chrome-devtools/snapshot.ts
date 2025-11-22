/**
 * Snapshot tool for Chrome DevTools
 * Capture page structure for element discovery
 */

import { MCPClient } from '../../lib/mcp-client';

export interface SnapshotOptions {
  verbose?: boolean;
  filePath?: string;
}

/**
 * Take a text snapshot of the current page
 * Returns structured data with element UIDs
 */
export async function snapshot(options: SnapshotOptions = {}): Promise<any> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'take_snapshot', options);
}

/**
 * Find elements in snapshot by text content
 */
export function findByText(snapshotData: any, text: string): any[] {
  if (!snapshotData?.elements) return [];

  return snapshotData.elements.filter((el: any) =>
    el.text?.toLowerCase().includes(text.toLowerCase())
  );
}

/**
 * Find elements in snapshot by role
 */
export function findByRole(snapshotData: any, role: string): any[] {
  if (!snapshotData?.elements) return [];

  return snapshotData.elements.filter((el: any) =>
    el.role?.toLowerCase() === role.toLowerCase()
  );
}

/**
 * Find form inputs in snapshot
 */
export function findInputs(snapshotData: any): any[] {
  return findByRole(snapshotData, 'textbox')
    .concat(findByRole(snapshotData, 'combobox'))
    .concat(findByRole(snapshotData, 'searchbox'));
}

/**
 * Find buttons in snapshot
 */
export function findButtons(snapshotData: any): any[] {
  return findByRole(snapshotData, 'button');
}