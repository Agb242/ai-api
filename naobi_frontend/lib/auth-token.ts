/**
 * Session token for REST API, Socket.io, and Next middleware (cookie gate).
 * Priority: localStorage auth_token → cookie → zustand persist (auth-storage).
 */

/** Optional override, e.g. `.noabi.cloud` — must match the public site host. */
const COOKIE_DOMAIN_ENV = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '').trim();

function cookieDomainAttr(hostname: string): string {
  if (COOKIE_DOMAIN_ENV) {
    const d = COOKIE_DOMAIN_ENV.startsWith('.') ? COOKIE_DOMAIN_ENV : `.${COOKIE_DOMAIN_ENV}`;
    return `; Domain=${d}`;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
  if (hostname === 'noabi.cloud' || hostname.endsWith('.noabi.cloud')) {
    return '; Domain=.noabi.cloud';
  }
  if (hostname === 'knotflow.cloud' || hostname.endsWith('.knotflow.cloud')) {
    return '; Domain=.knotflow.cloud';
  }
  if (hostname === 'checkflow.space' || hostname.endsWith('.checkflow.space')) {
    return '; Domain=.checkflow.space';
  }
  // Host-only cookie (safest default for unknown hosts)
  return '';
}

function isSecureCookie(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:' || process.env.NODE_ENV === 'production';
}

function cookieSuffix(): string {
  if (typeof window === 'undefined') return '; SameSite=Lax';
  const secure = isSecureCookie() ? '; Secure' : '';
  const domain = cookieDomainAttr(window.location.hostname);
  return `; SameSite=Lax${secure}${domain}`;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  const fromStorage = localStorage.getItem('auth_token');
  if (fromStorage) return fromStorage;

  const cookieMatch = document.cookie.match(/(?:^|;\s*)auth-token=([^;]+)/);
  if (cookieMatch?.[1]) return decodeURIComponent(cookieMatch[1]);

  try {
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      const token = JSON.parse(raw)?.state?.session?.token;
      if (typeof token === 'string' && token.length > 0) {
        localStorage.setItem('auth_token', token);
        return token;
      }
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

export function syncAuthToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  localStorage.setItem('auth_token', token);
  document.cookie = `auth-token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}${cookieSuffix()}`;
}

/** Clear auth cookie with the same Domain/Secure attrs used when setting it. */
export function clearAuthTokenCookie(): void {
  if (typeof window === 'undefined') return;
  document.cookie = `auth-token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieSuffix()}`;
  // Also clear a host-only leftover if a Domain cookie was previously used
  document.cookie =
    'auth-token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
}
