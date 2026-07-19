'use client';

import { useEffect } from 'react';
import { authService } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { persistSessionToken } from '@/lib/auth/session-client';

/** Silently refresh session token when close to expiry. */
export function useAuthRefresh() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const clearAll = useAuthStore((s) => s.clearAll);
  const organizations = useAuthStore((s) => s.organizations);
  const applySessionPayload = useAuthStore((s) => s.applySessionPayload);
  const org = useAuthStore((s) => s.org);

  useEffect(() => {
    if (!session?.token || !user) return;

    const expiresAt = session.expires_at ? new Date(session.expires_at).getTime() : 0;
    const msLeft = expiresAt - Date.now();
    if (msLeft > 7 * 24 * 60 * 60 * 1000) return;

    let cancelled = false;
    (async () => {
      const res = await authService.refresh();
      if (cancelled) return;
      if (res.success && (res.data as any)?.token) {
        const data = res.data as any;
        const token = data.token as string;
        persistSessionToken(token);
        applySessionPayload({
          user,
          session: {
            id: data.session?.id || session.id,
            token,
            expires_at: data.session?.expires_at || data.data?.expires_at || session.expires_at,
          },
          organizations,
          activeOrganization: org,
        });
      } else if (
        !res.success &&
        (res.error?.code === 'INVALID_SESSION' || res.error?.code === 'UNAUTHORIZED')
      ) {
        clearAll();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.token, session?.expires_at, user, clearAll, applySessionPayload, organizations, org, session?.id]);
}
