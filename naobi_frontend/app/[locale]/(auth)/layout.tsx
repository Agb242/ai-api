'use client';

import { GoogleAuthProvider } from '@/providers/google-oauth-provider';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { NoabiLogo } from '@/components/layout/NoabiLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleAuthProvider>
      <div className="flex min-h-screen flex-col bg-background px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-foreground" aria-label="noabi">
            <NoabiLogo size={26} />
            <span className="font-display text-[17px] font-semibold tracking-tight">noabi</span>
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
