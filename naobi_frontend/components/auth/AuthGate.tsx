'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/lib/hooks/useAuth';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useAuthRefresh } from '@/lib/hooks/useAuthRefresh';

const PUBLIC_PREFIXES = [
  '/',
  '/login',
  '/register',
  '/invite',
  '/onboarding',
  '/organizations',
  '/buy',
];

function stripLocale(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || '/';
  return pathname;
}

function isPublicPath(localePath: string): boolean {
  if (localePath === '/' || localePath === '') return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== '/' && (localePath === p || localePath.startsWith(`${p}/`)),
  );
}

/**
 * Session source of truth: GET /auth/me after hydrate.
 * Routes are enforced here — middleware only checks cookie presence.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('layout');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { status, hasHydrated, bootstrap, bootstrapError } = useAuth();
  const booted = useRef(false);
  useAuthRefresh();

  const localePath = stripLocale(pathname || '/', locale);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      useAuthStore.setState({ hasHydrated: true });
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      useAuthStore.setState({ hasHydrated: true });
    });
    const failsafe = window.setTimeout(() => {
      useAuthStore.setState({ hasHydrated: true });
    }, 1500);
    return () => {
      unsub();
      window.clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated || booted.current) return;
    booted.current = true;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      useAuthStore.setState({ bootstrapError: 'Authentication timed out' });
      useAuthStore.getState().clearAll();
    }, 8000);

    (async () => {
      try {
        await bootstrap();
      } catch {
        if (!cancelled) {
          useAuthStore.setState({ bootstrapError: 'Authentication failed' });
          useAuthStore.getState().clearAll();
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [hasHydrated, bootstrap]);

  useEffect(() => {
    if (status === 'bootstrapping' || !hasHydrated) return;

    const publicPath = isPublicPath(localePath);

    if (status === 'unauthenticated') {
      if (!publicPath) {
        router.replace(`/login?next=${encodeURIComponent(localePath)}`);
      }
      return;
    }

    if (status === 'authenticated_no_org') {
      if (localePath !== '/onboarding' && !localePath.startsWith('/invite')) {
        router.replace('/onboarding');
      }
      return;
    }

    if (status === 'authenticated_needs_org_pick') {
      if (localePath !== '/organizations') {
        router.replace('/organizations');
      }
      return;
    }

    if (status === 'authenticated_ready') {
      if (
        localePath === '/login' ||
        localePath === '/register' ||
        localePath === '/onboarding' ||
        localePath === '/organizations'
      ) {
        router.replace('/dashboard');
      }
    }
  }, [status, hasHydrated, localePath, router]);

  const showBootstrap =
    !hasHydrated ||
    status === 'bootstrapping' ||
    (!isPublicPath(localePath) &&
      status !== 'authenticated_ready' &&
      status !== 'unauthenticated');

  if (showBootstrap && !isPublicPath(localePath)) {
    return (
      <div
        className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {bootstrapError || t('loadingAuth') || 'Loading authentication…'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
