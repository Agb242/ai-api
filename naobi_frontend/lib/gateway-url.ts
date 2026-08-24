/** Public gateway base URL (no trailing slash). */
export function getGatewayBase(): string {
  const explicit = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';
  return api.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

export const PLAYGROUND_KEY_STORAGE = 'knotflow_playground_key';

export function rememberPlaygroundKey(plaintext: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PLAYGROUND_KEY_STORAGE, plaintext);
  } catch {
    /* ignore */
  }
}

export function readPlaygroundKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PLAYGROUND_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function clearPlaygroundKey() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PLAYGROUND_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}
