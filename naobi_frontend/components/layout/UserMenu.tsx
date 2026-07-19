'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuthStore } from '@/lib/stores/auth.store';
import { authService } from '@/lib/api/auth.api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, KeyRound, LogOut, MessageSquare, Settings, Users } from 'lucide-react';

export function UserMenu() {
  const t = useTranslations('header');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const logout = useAuthStore((s) => s.logout);

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '??';

  async function handleLogout() {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    logout();
    router.push('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-1 pr-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar size="sm">
            {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[120px] truncate text-left text-[13px] font-medium sm:block">
            {user?.full_name || tNav('userFallback')}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user?.full_name || tNav('userFallback')}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
            {org?.name ? (
              <span className="mt-1 truncate text-xs text-muted-foreground">
                {t('org')}: {org.name}
              </span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organizations" className="cursor-pointer">
            <Building2 className="size-4" />
            {t('organizations')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/keys" className="cursor-pointer">
            <KeyRound className="size-4" />
            {t('apiKeys')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/playground" className="cursor-pointer">
            <MessageSquare className="size-4" />
            {tNav('playground')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/members" className="cursor-pointer">
            <Settings className="size-4" />
            {t('settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/members" className="cursor-pointer">
            <Users className="size-4" />
            {tNav('team')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void handleLogout()}
          className="cursor-pointer"
        >
          <LogOut className="size-4" />
          {tNav('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
