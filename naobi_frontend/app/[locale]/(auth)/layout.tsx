'use client';

import { GoogleAuthProvider } from '@/providers/google-oauth-provider';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleAuthProvider>
      <div className="flex min-h-screen flex-col bg-background px-4 sm:px-6">
        <SiteHeader variant="auth" />
        <main className="flex flex-1 flex-col items-center justify-center py-10">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </GoogleAuthProvider>
  );
}
