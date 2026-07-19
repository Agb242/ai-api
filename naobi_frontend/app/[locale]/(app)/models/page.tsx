'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { cn } from '@/lib/utils';

export default function ModelsPage() {
  const t = useTranslations('models');
  const td = useTranslations('dashboard');
  const org = useAuthStore((s) => s.org);

  const { data, error, isLoading } = useQuery({
    queryKey: ['litellm-models', org?.id],
    queryFn: async () => {
      const res = await billingApi.litellmModels();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as any;
    },
    enabled: !!org?.id,
    refetchInterval: 60000,
  });

  const models = Array.isArray(data?.data) ? data.data : [];
  const healthy = data?.litellm_healthy;

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        <span className="font-mono text-[11px] uppercase text-muted-foreground">
          LiteLLM · {healthy ? td('available') : td('degraded')}
        </span>
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
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">{t('provider')}</th>
                <th className="px-4 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                models.map((m: any) => (
                  <tr key={m.id || m.model_id || m.id} className="border-b border-border">
                    <td className="px-4 py-3 font-mono text-xs">{m.id || m.model_id}</td>
                    <td className="px-4 py-3">{m.owned_by || m.provider || 'litellm'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2.5 py-0.5 text-[11px] font-medium',
                          healthy
                            ? 'bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]'
                            : 'bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]',
                        )}
                      >
                        {healthy ? td('available') : td('degraded')}
                      </span>
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
