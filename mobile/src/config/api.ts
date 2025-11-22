/**
 * Minimal fetch wrapper for the mobile app.
 * API_URL comes from Expo "extra" (see app.json), but we allow fallback for dev.
 */
const API_URL =
  (typeof globalThis !== "undefined" &&
    // In dev with Expo SDK 49+: Constants.expoConfig?.extra
    // In production (EAS/Updates): Constants.manifest?.extra (legacy) or runtime env
    (globalThis as any)?.EXPO_PUBLIC_API_URL) ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://192.168.0.148:8000";

const full = (path: string) => {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_URL}${path}`;
};

async function handle(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText;
    throw new Error(`API ${res.status} ${msg}`);
  }
  return data;
}

export const api = {
  base: API_URL,
  url: full,
  get: (path: string, init: RequestInit = {}) =>
    fetch(full(path), { ...init, method: "GET" }).then(handle),
  post: (path: string, body: any, init: RequestInit = {}) =>
    fetch(full(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify(body),
      ...init,
    }).then(handle),
  del: (path: string, init: RequestInit = {}) =>
    fetch(full(path), { method: "DELETE", ...init }).then(handle),
};
