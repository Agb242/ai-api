'use client';

import { GoogleAuthProvider } from '@/providers/google-oauth-provider';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { KnotflowLogo } from '@/components/layout/KnotflowLogo';
import { SITE } from '@/lib/site';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleAuthProvider>
      <div className="flex min-h-screen flex-col bg-background px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between py-6">
          <Link href="/" className="inline-flex text-foreground" aria-label={SITE.name}>
            <KnotflowLogo size={28} showWordmark />
          </Link>
          <LanguageSwitcher />
        </div>
        <main className="flex flex-1 flex-col items-center justify-center pb-10">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card px-6 py-8 sm:px-8 sm:py-10">
            {children}
          </div>
        </main>
      </div>
    </GoogleAuthProvider>
  );
}
