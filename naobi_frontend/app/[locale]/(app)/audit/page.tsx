'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { auditApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';

export default function AuditPage() {
  const t = useTranslations('audit');
  const org = useAuthStore((s) => s.org);
  const role = useAuthStore((s) => s.currentMember?.role);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', org?.id],
    queryFn: async () => {
      const res = await auditApi.list({ limit: 100 });
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { items?: any[]; pagination?: unknown };
    },
    enabled: !!org?.id,
  });

  const items = data?.items || [];

  async function downloadCsv() {
    const res = await auditApi.exportCsv();
    if (!res.success || !res.blob) {
      toast.error(res.error?.message || t('exportFailed'));
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'knotflow-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('exportOk'));
  }

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        {role === 'owner' ? (
          <Button type="button" variant="outline" onClick={() => void downloadCsv()}>
            {t('export')}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2">{t('timestamp')}</th>
                <th className="px-4 py-2">{t('source')}</th>
                <th className="px-4 py-2">{t('action')}</th>
                <th className="px-4 py-2">{t('actor')}</th>
                <th className="px-4 py-2">{t('resource')}</th>
                <th className="px-4 py-2">{t('detail')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row: any) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">{row.source}</td>
                  <td className="px-4 py-3">{row.action}</td>
                  <td className="px-4 py-3 text-xs">{row.actor || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.resource}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-xs text-muted-foreground">
                    {row.detail || '—'}
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
