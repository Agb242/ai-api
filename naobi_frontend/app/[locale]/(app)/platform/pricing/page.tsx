'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { platformApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/routing';

type PlatformAdminRow = {
  id: string;
  email: string;
  status: string;
  created_at?: string;
};

export default function PlatformPricingPage() {
  const t = useTranslations('platform');
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const [marginText, setMarginText] = useState('{}');
  const [discountText, setDiscountText] = useState('{}');
  const [inviteEmail, setInviteEmail] = useState('');

  useEffect(() => {
    if (user && !user.is_platform_admin) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-pricing'],
    queryFn: async () => {
      const res = await platformApi.getPricing();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { margin?: unknown; discount?: unknown };
    },
    enabled: !!user?.is_platform_admin,
  });

  const { data: admins = [] } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      const res = await platformApi.listAdmins();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as PlatformAdminRow[]) || [];
    },
    enabled: !!user?.is_platform_admin,
  });

  useEffect(() => {
    if (data?.margin !== undefined) {
      setMarginText(JSON.stringify(data.margin ?? {}, null, 2));
    }
    if (data?.discount !== undefined) {
      setDiscountText(JSON.stringify(data.discount ?? {}, null, 2));
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      let margin: unknown;
      let discount: unknown;
      try {
        margin = JSON.parse(marginText);
        discount = JSON.parse(discountText);
      } catch {
        throw new Error(t('invalidJson'));
      }
      const res = await platformApi.putPricing({ margin, discount });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('saved'));
      qc.invalidateQueries({ queryKey: ['platform-pricing'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const inviteMut = useMutation({
    mutationFn: async () => {
      const res = await platformApi.inviteAdmin(inviteEmail.trim());
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('inviteOk'));
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['platform-admins'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!user?.is_platform_admin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-7">
      <div>
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('margin')}</label>
            <textarea
              className="min-h-[220px] w-full rounded-md border border-border bg-card p-3 font-mono text-xs"
              value={marginText}
              onChange={(e) => setMarginText(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('discount')}</label>
            <textarea
              className="min-h-[220px] w-full rounded-md border border-border bg-card p-3 font-mono text-xs"
              value={discountText}
              onChange={(e) => setDiscountText(e.target.value)}
            />
          </div>
        </div>
      )}

      <div>
        <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {t('save')}
        </Button>
      </div>

      <section className="max-w-xl space-y-4 border border-border bg-card p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide">{t('adminsTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('adminsSub')}</p>
        </div>

        <ul className="divide-y divide-border rounded-md border border-border">
          {admins.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{t('adminsEmpty')}</li>
          ) : (
            admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate font-mono text-xs">{a.email}</span>
                <span className="shrink-0 text-[11px] uppercase text-muted-foreground">
                  {a.status === 'active' ? t('statusActive') : t('statusPending')}
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder={t('invitePlaceholder')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!inviteEmail.trim() || inviteMut.isPending}
            onClick={() => inviteMut.mutate()}
          >
            {t('invite')}
          </Button>
        </div>
      </section>
    </div>
  );
}
