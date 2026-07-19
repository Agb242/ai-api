import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

type Locale = 'fr' | 'en';

/** Routes accessibles sans cookie (marketing + auth + onboarding org) */
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/register',
  '/invite',
  '/onboarding',
  '/organizations',
  '/buy',
];

function normalizePath(pathname: string): { locale: Locale; localePath: string } {
  const localeMatch = pathname.match(/^\/(fr|en)(?=\/|$)/);
  const locale = (localeMatch?.[1] ?? routing.defaultLocale) as Locale;
  let localePath = localeMatch ? pathname.slice(localeMatch[0].length) || '/' : pathname;
  if (!localePath.startsWith('/')) localePath = `/${localePath}`;
  if (localePath.length > 1 && localePath.endsWith('/')) {
    localePath = localePath.slice(0, -1);
  }
  return { locale, localePath };
}

function isPublicPath(localePath: string): boolean {
  if (localePath === '/' || localePath === '') return true;
  return PUBLIC_PATH_PREFIXES.some(
    (p) => localePath === p || localePath.startsWith(`${p}/`),
  );
}

function hasAuthCookie(request: NextRequest): boolean {
  const raw = request.cookies.get('auth-token')?.value;
  return Boolean(raw && raw.trim().length > 0);
}

/**
 * Edge gate: cookie presence only for protected routes.
 * Cookie is NOT proof of a valid session — AuthGate validates via GET /auth/me.
 * Never redirect /login → /dashboard based on cookie alone.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale, localePath } = normalizePath(pathname);

  if (isPublicPath(localePath)) {
    return intlMiddleware(request);
  }

  if (!hasAuthCookie(request)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('next', localePath);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|avatar|icons|images|fonts|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)).*)',
  ],
};
