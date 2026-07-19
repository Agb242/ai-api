'use client';

import { useCallback } from 'react';
import { authService } from '@/lib/api/auth.api';
import { useAuthStore, type AuthStatus } from '@/lib/stores/auth.store';
import { getAuthToken } from '@/lib/auth-token';
import type { User } from '@/lib/types/auth.types';
import type { Organization } from '@/lib/types/member.types';
import { resolvePostAuthRoute } from '@/lib/auth/resolve-post-auth-route';

export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const bootstrapError = useAuthStore((s) => s.bootstrapError);
  const clearAll = useAuthStore((s) => s.clearAll);
  const applySessionPayload = useAuthStore((s) => s.applySessionPayload);
  const setStatus = useAuthStore((s) => s.setStatus);
  const login = useAuthStore((s) => s.login);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    clearAll();
  }, [clearAll]);

  const bootstrap = useCallback(async () => {
    setStatus('bootstrapping');
    const token = getAuthToken();
    if (!token) {
      clearAll();
      return 'unauthenticated' as AuthStatus;
    }

    const res = await authService.me();
    if (!res.success || !res.data) {
      clearAll();
      return 'unauthenticated' as AuthStatus;
    }

    const payload = res.data as any;
    const user = (payload.user || payload) as User;
    const session = payload.session || {
      id: payload.session?.id || 'session',
      token: payload.token || token,
      expires_at: payload.session?.expires_at || payload.expires_at,
    };
    const organizations = (payload.organizations || []) as Organization[];
    const activeOrganization =
      payload.active_organization ||
      payload.default_organization ||
      (organizations.length === 1 ? organizations[0] : null);

    if (!user?.id || !session?.token) {
      clearAll();
      return 'unauthenticated' as AuthStatus;
    }

    applySessionPayload({
      user,
      session: { ...session, token: session.token || token },
      organizations,
      activeOrganization,
    });

    return useAuthStore.getState().status;
  }, [applySessionPayload, clearAll, setStatus]);

  return {
    status,
    isAuthenticated,
    hasHydrated,
    bootstrapError,
    bootstrap,
    login,
    logout,
    clearAll,
    resolvePostAuthRoute,
  };
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}

export function useSession() {
  return useAuthStore((s) => s.session);
}

export function useOrganization() {
  const org = useAuthStore((s) => s.org);
  const organizations = useAuthStore((s) => s.organizations);
  const setOrg = useAuthStore((s) => s.setOrg);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);

  return {
    org,
    organizations,
    setOrg,
    setOrganizations,
    hasOrganization: organizations.length > 0,
  };
}
