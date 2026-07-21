'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { logsApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Link } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAuthToken } from '@/lib/auth-token';

export default function LogsPage() {
  const t = useTranslations('logs');
  const org = useAuthStore((s) => s.org);
  const [tag, setTag] = useState('');
  const [endUser, setEndUser] = useState('');
  const [applied, setApplied] = useState<{ tag?: string; end_user?: string }>({});

  const { data: logs = [] } = useQuery({
    queryKey: ['logs', org?.id, applied],
    queryFn: async () => {
      const res = await logsApi.list(100, applied);
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  const auditExportHref = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';
    return `${base}/audit/export.csv?source=all`;
  }, []);

  async function downloadAuditCsv() {
    const token = getAuthToken();
    const res = await fetch(auditExportHref, {
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

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/audit">{t('openAudit')}</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadAuditCsv}>
            {t('exportAudit')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">{t('filterTag')}</label>
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="app:checkout"
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">{t('filterEndUser')}</label>
          <Input
            value={endUser}
            onChange={(e) => setEndUser(e.target.value)}
            placeholder="user-123"
            className="w-40"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            setApplied({
              tag: tag.trim() || undefined,
              end_user: endUser.trim() || undefined,
            })
          }
        >
          {t('applyFilters')}
        </Button>
      </div>

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
                <th className="px-4 py-2">{t('endUser')}</th>
                <th className="px-4 py-2">{t('tags')}</th>
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
                    {l.metadata?.end_user_id || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {Array.isArray(l.metadata?.tags) ? l.metadata.tags.join(', ') : '—'}
                  </td>
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
