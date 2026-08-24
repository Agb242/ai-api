'use client';

import { GoogleAuthProvider } from '@/providers/google-oauth-provider';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleAuthProvider>
      <div className="flex min-h-screen flex-col bg-background px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg justify-end py-6">
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
