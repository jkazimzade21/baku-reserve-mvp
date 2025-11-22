/**
 * Utility functions for input validation and sanitization
 */

const DIRECTIONAL_OVERRIDE = /[\u202A-\u202E]/g;
const ENTITY_PATTERN = /&#x?[0-9a-f]+;/gi;
const UNICODE_ESCAPE = /\\u[0-9a-f]{4}/gi;
const HEX_ESCAPE = /\\x[0-9a-f]{2}/gi;
const UNSAFE_PROTOCOL = /(javascript|vbscript|data)\s*:/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=/gi;
const SCRIPT_TOKEN = /script/gi;
// eslint-disable-next-line no-useless-escape -- explicit escape keeps char class readable for CodeQL
const SAFE_CHAR_PATTERN = /[^a-z0-9 .,!?@#$%&()\[\]{}:_+\-=;'"/\\|`~\r\n]/gi;

const normalizeInput = (input: string): string => {
  let working = input.normalize('NFKC');
  try {
    working = decodeURIComponent(working);
  } catch {
    // ignore malformed percent-encoding
  }

  let prev = '';
  while (prev !== working) {
    prev = working;
    working = working
      .replace(UNICODE_ESCAPE, '')
      .replace(HEX_ESCAPE, '')
      .replace(ENTITY_PATTERN, '');
  }
  return working;
};

export const sanitizeInput = (input: string): string => {
  if (!input) return '';

  let working = normalizeInput(input);
  working = working
    .replace(UNSAFE_PROTOCOL, ' ')
    .replace(EVENT_HANDLER_ATTR, ' ')
    .replace(SCRIPT_TOKEN, ' ')
    .replace(DIRECTIONAL_OVERRIDE, ' ');
  working = working.replace(SAFE_CHAR_PATTERN, ' ');
  const collapsed = working.replace(/\s+/g, ' ').trim();
  return escapeHtml(collapsed);
};

export const validateEmail = (email: string): boolean => {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhoneNumber = (phone: string): boolean => {
  if (!phone) return false;

  const phoneRegex = /^\+?[\d\s\-()]+$/;
  const digitsOnly = phone.replace(/\D/g, '');

  return phoneRegex.test(phone) && digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

export const validateUrl = (url: string): boolean => {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.toLowerCase();
    return (protocol === 'http:' || protocol === 'https:') && Boolean(urlObj.hostname);
  } catch {
    return false;
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const sanitizeHtml = (html: string): string => {
  if (!html) return '';
  return sanitizeInput(html);
};

export const validateInput = (
  input: string,
  type: 'email' | 'phone' | 'url' | 'text'
): boolean => {
  switch (type) {
    case 'email':
      return validateEmail(input);
    case 'phone':
      return validatePhoneNumber(input);
    case 'url':
      return validateUrl(input);
    case 'text':
      return input.length > 0 && input.length < 10000;
    default:
      return false;
  }
};
