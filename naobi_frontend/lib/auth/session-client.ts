import { syncAuthToken } from '../auth-token';

/** Clear all client-side session artifacts. Cookie/localStorage are transport only. */
export function clearAuthCookie(): void {
  if (typeof window === 'undefined') return;
  document.cookie = `auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function clearAllClientSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth-storage');
  } catch {
    /* ignore */
  }
  clearAuthCookie();
}

export function persistSessionToken(token: string): void {
  syncAuthToken(token);
}
