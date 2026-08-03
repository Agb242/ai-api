'use client';

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
  ClipboardCheck,
  // CreditCard, Wallet — temporarily unused (Billing/Wallet hidden)
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const org = useAuthStore((s) => s.org);
  const t = useTranslations('nav');
  const tLayout = useTranslations('layout');

  const menuItems = [
    { icon: LayoutDashboard, labelKey: 'dashboard' as const, href: '/dashboard' },
    { icon: KeyRound, labelKey: 'keys' as const, href: '/keys' },
    { icon: ScrollText, labelKey: 'logs' as const, href: '/logs' },
    { icon: FileSearch, labelKey: 'audit' as const, href: '/audit' },
    { icon: MessageSquare, labelKey: 'playground' as const, href: '/playground' },
    { icon: Shield, labelKey: 'filters' as const, href: '/filters' },
    { icon: ClipboardCheck, labelKey: 'compliance' as const, href: '/compliance' },
    { icon: Boxes, labelKey: 'models' as const, href: '/models' },
    // Temporarily hidden until MoMo/Wallet demo-ready (see audit_v2.md)
    // { icon: CreditCard, labelKey: 'billing' as const, href: '/billing' },
    // { icon: Wallet, labelKey: 'wallet' as const, href: '/wallet' },
    { icon: Users, labelKey: 'team' as const, href: '/members' },
  ];

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="font-display text-[16px] font-semibold tracking-tight text-foreground">
            noabi
          </span>
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
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-accent-soft text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 stroke-[1.6]" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {org?.name ? (
        <div className="shrink-0 border-t border-border p-3">
          <p className="truncate px-2 text-[13px] font-medium text-foreground">{org.name}</p>
          <p className="px-2 text-[11px] text-muted-foreground">{tLayout('auth.logoAlt')}</p>
        </div>
      ) : null}
    </aside>
  );
}
