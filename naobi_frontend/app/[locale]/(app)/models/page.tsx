'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { modelsApi } from '@/lib/api/models.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { cn } from '@/lib/utils';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { statusDotClass } from '@/lib/types/playground-model';
import { Badge } from '@/components/ui/badge';

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export default function ModelsPage() {
  const t = useTranslations('models');
  const td = useTranslations('dashboard');
  const org = useAuthStore((s) => s.org);

  const { data, error, isLoading } = useQuery({
    queryKey: ['model-catalog', org?.id],
    queryFn: async () => {
      const res = await modelsApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id,
    refetchInterval: 60000,
  });

  const models = (Array.isArray(data?.data) ? data.data : []) as PlaygroundModel[];
  const catalogStatus = data?.catalog_status;
  const statusLabel =
    catalogStatus === 'available' ? td('catalogStatusAvailable') : td('catalogStatusDegraded');

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        {catalogStatus ? (
          <Badge variant="outline" className="text-[10px] font-normal uppercase">
            {statusLabel}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{td('empty')}</p>
      ) : (
        <div className="border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2">{t('title')}</th>
                <th className="px-4 py-2">{t('provider')}</th>
                <th className="px-4 py-2">{t('contextLabel')}</th>
                <th className="px-4 py-2">{t('capabilities')}</th>
                <th className="px-4 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{m.display_name || m.id}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{m.id}</p>
                    </td>
                    <td className="px-4 py-3">{m.provider || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {m.context_window
                        ? t('context', { n: formatContext(m.context_window) })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(m.capabilities || []).slice(0, 4).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px] font-normal">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.status ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(m.status))}
                          />
                          {m.status}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
