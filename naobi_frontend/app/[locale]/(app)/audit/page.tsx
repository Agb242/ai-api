'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { auditApi } from '@/lib/api/audit.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';
import { getAuthToken } from '@/lib/auth-token';

export default function AuditPage() {
  const t = useTranslations('audit');
  const org = useAuthStore((s) => s.org);
  const [source, setSource] = useState<'all' | 'gateway' | 'filter' | 'litellm'>('all');

  const { data } = useQuery({
    queryKey: ['audit', org?.id, source],
    queryFn: async () => {
      const res = await auditApi.list({ source, page: 1, limit: 80 });
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { items: any[]; pagination: any };
    },
    enabled: !!org?.id,
  });

  async function downloadCsv() {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';
    const token = getAuthToken();
    const res = await fetch(`${base}/audit/export.csv?source=${source}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Org-ID': org?.id || '',
      },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = data?.items || [];

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button type="button" size="sm" onClick={downloadCsv}>
          {t('exportCsv')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'gateway', 'filter', 'litellm'] as const).map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={source === s ? 'default' : 'outline'}
            onClick={() => setSource(s)}
          >
            {t(`source_${s}`)}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((e: any) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{e.summary}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.source} · {e.action}
                  </p>
                </div>
                <time className="font-mono text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
