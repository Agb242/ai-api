'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { logsApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Link } from '@/i18n/routing';

export default function LogsPage() {
  const t = useTranslations('logs');
  const org = useAuthStore((s) => s.org);

  const { data: logs = [] } = useQuery({
    queryKey: ['logs', org?.id],
    queryFn: async () => {
      const res = await logsApi.list(100);
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
      <div className="rounded-xl border border-border bg-card">
        {logs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {t('empty')}{' '}
            <Link href="/keys" className="text-primary underline">
              API
            </Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2">{t('date')}</th>
                <th className="px-4 py-2">{t('model')}</th>
                <th className="px-4 py-2">{t('status')}</th>
                <th className="px-4 py-2">{t('latency')}</th>
                <th className="px-4 py-2">{t('cost')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l: any) => (
                <tr key={l.id} className="border-b border-border">
                  <td className="px-4 py-3 font-mono text-xs">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{l.model_id}</td>
                  <td className="px-4 py-3">{l.status}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {l.latency_ms != null ? `${l.latency_ms} ms` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {Number(l.cost || 0).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
