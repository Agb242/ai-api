'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { complianceApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';

export default function CompliancePage() {
  const t = useTranslations('compliance');
  const locale = useLocale();
  const org = useAuthStore((s) => s.org);
  const role = useAuthStore((s) => s.currentMember?.role);

  const { data } = useQuery({
    queryKey: ['compliance-checklist', org?.id],
    queryFn: async () => {
      const res = await complianceApi.checklist();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as {
        items?: Array<{ id: string; fr: string; en: string }>;
        provider?: unknown;
      };
    },
    enabled: !!org?.id,
  });

  async function downloadExport() {
    const res = await complianceApi.export();
    if (!res.success || !res.data) {
      toast.error(res.error?.message || t('exportFailed'));
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'noabi-compliance-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('exportOk'));
  }

  const items = data?.items || [];

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {role === 'owner' ? (
          <Button type="button" variant="outline" onClick={() => void downloadExport()}>
            {t('export')}
          </Button>
        ) : null}
      </div>

      <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{locale === 'en' ? item.en : item.fr}</span>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">{t('empty')}</li>
        ) : null}
      </ul>

      <p className="text-xs text-muted-foreground">{t('disclaimer')}</p>
    </div>
  );
}
