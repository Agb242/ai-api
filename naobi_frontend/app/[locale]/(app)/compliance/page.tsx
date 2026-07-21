'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { complianceApi } from '@/lib/api/compliance.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';

export default function CompliancePage() {
  const t = useTranslations('compliance');
  const org = useAuthStore((s) => s.org);
  const [payload, setPayload] = useState<any>(null);

  const exportMut = useMutation({
    mutationFn: async () => {
      const res = await complianceApi.export();
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: (data) => {
      setPayload(data);
      toast.success(t('exported'));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-${org?.id || 'org'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div>
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Button
        type="button"
        onClick={() => exportMut.mutate()}
        disabled={exportMut.isPending || !org?.id}
        className="w-fit"
      >
        {exportMut.isPending ? t('exporting') : t('export')}
      </Button>
      {payload ? (
        <pre className="max-h-[420px] overflow-auto rounded-xl border border-border bg-card p-4 text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
