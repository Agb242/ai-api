'use client';

import React from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from './Sidebar';
import { SiteHeader } from './SiteHeader';
import { useTranslations } from 'next-intl';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status } = useAuth();
  const t = useTranslations('layout');

  if (status !== 'authenticated_ready') {
    return (
      <div
        className="flex h-screen w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">{t('loading')}</span>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SiteHeader variant="app" />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
