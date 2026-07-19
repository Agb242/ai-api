/**
 * Résout le token de session utilisé par l'API REST et Socket.io.
 * Priorité : localStorage auth_token → cookie → zustand persist (auth-storage).
 */
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

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    window.location.hostname.endsWith('knotflow.cloud');
  const secure = isProduction ? '; Secure' : '';
  const domain = isProduction ? '; Domain=.knotflow.cloud' : '';

  document.cookie = `auth-token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}${domain}`;
}
