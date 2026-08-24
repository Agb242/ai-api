'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
  LayoutDashboard,
  KeyRound,
  Shield,
  Boxes,
  Users,
  ScrollText,
  X,
  MessageSquare,
  FileSearch,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  // ClipboardCheck — Compliance hidden (audit_v3)
  // CreditCard, Wallet — temporarily unused (Billing/Wallet hidden)
} from 'lucide-react';
import Image from 'next/image';
import { SITE } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface SidebarProps {
  onClose?: () => void;
}

const COLLAPSE_STORAGE_KEY = 'knotflow_sidebar_collapsed';

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const org = useAuthStore((s) => s.org);
  const t = useTranslations('nav');
  const tLayout = useTranslations('layout');
  const [collapsed, setCollapsed] = useState(false);

  // Only ever collapse the persistent desktop rail — the mobile Sheet always
  // passes onClose and should stay in full/expanded form.
  const collapsible = !onClose;

  useEffect(() => {
    if (!collapsible) return;
    try {
      const v =
        localStorage.getItem(COLLAPSE_STORAGE_KEY) ??
        localStorage.getItem('noabi_sidebar_collapsed');
      setCollapsed(v === '1');
    } catch {
      /* ignore */
    }
  }, [collapsible]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const menuItems = [
    { icon: LayoutDashboard, labelKey: 'dashboard' as const, href: '/dashboard' },
    { icon: KeyRound, labelKey: 'keys' as const, href: '/keys' },
    { icon: ScrollText, labelKey: 'logs' as const, href: '/logs' },
    { icon: FileSearch, labelKey: 'audit' as const, href: '/audit' },
    { icon: MessageSquare, labelKey: 'playground' as const, href: '/playground' },
    { icon: Bot, labelKey: 'agents' as const, href: '/agents' },
    { icon: Shield, labelKey: 'filters' as const, href: '/filters' },
    // Temporarily hidden — static checklist only (see audit_v3.md)
    // { icon: ClipboardCheck, labelKey: 'compliance' as const, href: '/compliance' },
    { icon: Boxes, labelKey: 'models' as const, href: '/models' },
    // Temporarily hidden until MoMo/Wallet demo-ready (see audit_v2.md)
    // { icon: CreditCard, labelKey: 'billing' as const, href: '/billing' },
    // { icon: Wallet, labelKey: 'wallet' as const, href: '/wallet' },
    { icon: Users, labelKey: 'team' as const, href: '/members' },
  ];

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-150',
        collapsed ? 'w-[64px]' : 'w-[220px]',
      )}
    >
      <div className={cn('flex items-center gap-2 px-4 py-5', collapsed ? 'justify-center' : 'justify-between')}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <Image
            src={SITE.logo}
            alt={SITE.name}
            width={collapsed ? 24 : 28}
            height={collapsed ? 24 : 28}
            className="shrink-0 rounded-md object-contain"
          />
          {!collapsed ? (
            <span className="font-display text-[16px] font-semibold tracking-tight text-foreground">
              {SITE.name}
            </span>
          ) : null}
        </Link>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={onClose}
            aria-label={t('closeMenu')}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
        {collapsible && !collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={toggleCollapsed}
            aria-label={t('collapseSidebar')}
            title={t('collapseSidebar')}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {collapsible && collapsed ? (
        <div className="flex justify-center px-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={toggleCollapsed}
            aria-label={t('expandSidebar')}
            title={t('expandSidebar')}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? t(item.labelKey) : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-accent-soft text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 stroke-[1.6]" />
              {!collapsed ? t(item.labelKey) : null}
            </Link>
          );
        })}
      </nav>

      {org?.name && !collapsed ? (
        <div className="shrink-0 border-t border-border p-3">
          <p className="truncate px-2 text-[13px] font-medium text-foreground">{org.name}</p>
          <p className="px-2 text-[11px] text-muted-foreground">{tLayout('auth.logoAlt')}</p>
        </div>
      ) : null}
    </aside>
  );
}
