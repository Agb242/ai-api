'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowRight, Menu, X } from 'lucide-react';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { KnotflowLogo } from '@/components/layout/KnotflowLogo';
import { useAuthStore } from '@/lib/stores/auth.store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const MARKETING_NAV = [
  { href: '/#accueil', key: 'navHome' as const },
  { href: '/#modeles', key: 'navModels' as const },
  { href: '/#tarifs', key: 'navPricing' as const },
  { href: '/#docs', key: 'navDocs' as const },
  { href: '/#apropos', key: 'navAbout' as const },
];

type SiteHeaderProps = {
  /** marketing | auth | app */
  variant?: 'marketing' | 'auth' | 'app';
  className?: string;
};

export function SiteHeader({ variant = 'marketing', className }: SiteHeaderProps) {
  const t = useTranslations('marketing');
  const tHeader = useTranslations('header');
  const status = useAuthStore((s) => s.status);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const org = useAuthStore((s) => s.org);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthed =
    hasHydrated &&
    (status === 'authenticated_ready' ||
      status === 'authenticated_no_org' ||
      status === 'authenticated_needs_org_pick');

  const homeHref = isAuthed && status === 'authenticated_ready' ? '/dashboard' : '/';

  return (
    <header
      className={cn(
        'relative z-30 w-full',
        variant === 'app' ? 'border-b border-border bg-card' : 'border-b border-transparent bg-transparent',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-[64px] items-center justify-between gap-3 px-4 md:px-6',
          variant === 'marketing' && 'mx-auto h-[72px] max-w-[1200px] px-5 md:px-8',
          variant === 'auth' && 'mx-auto max-w-6xl px-0',
        )}
      >
        <Link href={homeHref} className="flex shrink-0 items-center text-foreground">
          <KnotflowLogo size={28} showWordmark />
        </Link>

        {variant === 'marketing' && !isAuthed ? (
          <nav className="hidden items-center gap-0.5 lg:flex">
            {MARKETING_NAV.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[#5c5c5c] transition-colors hover:text-[#0a0a0a]"
              >
                {t(item.key)}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-1.5 sm:gap-2">
          {isAuthed && org?.name && variant !== 'auth' ? (
            <span className="hidden max-w-[140px] truncate text-[12px] text-muted-foreground md:inline">
              {org.name}
            </span>
          ) : null}

          <LanguageSwitcher
            className={
              variant === 'marketing'
                ? '[&_button]:rounded-full [&_button]:border-0 [&_button]:px-2 [&_button]:py-1.5'
                : undefined
            }
          />

          {isAuthed ? (
            <UserMenu />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-3 py-2 text-[13px] font-medium text-[#5c5c5c] transition hover:text-[#0a0a0a] sm:inline"
              >
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0a0a0a] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#222]"
              >
                {variant === 'auth' ? tHeader('signUp') : t('ctaHeader')}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
              </Link>
            </>
          )}

          {variant === 'marketing' && !isAuthed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={tHeader('menu')}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      {mobileOpen && variant === 'marketing' && !isAuthed ? (
        <nav className="border-t border-border bg-background px-5 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {MARKETING_NAV.map((item) => (
              <a
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t(item.key)}
              </a>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
