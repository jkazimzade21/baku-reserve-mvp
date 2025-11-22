/**
 * Form filling tool for Chrome DevTools
 * Fill inputs, textareas, and select elements
 */

import { MCPClient } from '../../lib/mcp-client';

/**
 * Fill a form element with a value
 */
export async function fill(uid: string, value: string): Promise<void> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'fill', {
    uid,
    value
  });
}

/**
 * Fill multiple form elements at once
 */
export async function fillForm(elements: Array<{uid: string, value: string}>): Promise<void> {
  const client = await MCPClient.getInstance();
  return client.call('chrome-devtools', 'fill_form', {
    elements
  });
}

/**
 * Clear and fill an input
 */
export async function clearAndFill(uid: string, value: string): Promise<void> {
  // First clear the field
  await fill(uid, '');
  // Then fill with new value
  await fill(uid, value);
}

/**
 * Fill a form and submit
 */
export async function fillAndSubmit(
  formData: Array<{uid: string, value: string}>,
  submitButtonUid: string
): Promise<void> {
  await fillForm(formData);

  const { click } = await import('./click');
  await click(submitButtonUid);
}