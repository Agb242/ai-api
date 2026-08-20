'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from './Sidebar';
import { SiteHeader } from './SiteHeader';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status } = useAuth();
  const t = useTranslations('layout');
  const tNav = useTranslations('nav');
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[220px] p-0 sm:max-w-[220px]" showCloseButton={false}>
          <SheetTitle className="sr-only">{tNav('menu')}</SheetTitle>
          <Sidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-2 h-9 w-9 shrink-0 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={tNav('openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <SiteHeader variant="app" />
          </div>
        </div>
        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
