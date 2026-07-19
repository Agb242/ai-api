'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { walletApi } from '@/lib/api/gateway.api';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth.store';

export default function WalletPage() {
  const t = useTranslations('wallet');
  const tb = useTranslations('billing');
  const org = useAuthStore((s) => s.org);

  const { data } = useQuery({
    queryKey: ['wallet', org?.id],
    queryFn: async () => {
      const res = await walletApi.get();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as any;
    },
    enabled: !!org?.id,
  });

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>

      <div className="border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">{t('balance')}</p>
        <p className="mt-1 font-mono text-3xl font-medium">
          {Number(data?.balance ?? 0).toLocaleString()} cr.
        </p>
        {data?.below_alert ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('alert')}</p>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">{t('topupViaBilling')}</p>
        <Button asChild className="mt-3 rounded-none" variant="outline">
          <Link href="/billing">{tb('buy')}</Link>
        </Button>
      </div>

      <div className="border border-border bg-card">
        <p className="border-b border-border px-4 py-3 text-sm font-medium">{t('history')}</p>
        <ul className="divide-y divide-border">
          {(data?.transactions || []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</li>
          ) : (
            (data?.transactions || []).map((tx: any) => (
              <li key={tx.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium capitalize">{tx.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString()} · {tx.status}
                  </p>
                </div>
                <span className="font-mono">
                  {tx.type === 'debit' ? '−' : '+'}
                  {Number(tx.amount).toFixed(4)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
