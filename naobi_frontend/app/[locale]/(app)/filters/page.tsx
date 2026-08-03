'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { filtersApi } from '@/lib/api/gateway.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/stores/auth.store';

export default function FiltersPage() {
  const t = useTranslations('filters');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    type: 'keyword' as 'keyword' | 'regex',
    pattern: '',
    action: 'block' as 'block' | 'redact',
    sample: '',
  });
  const [testResult, setTestResult] = useState<any>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['filters', org?.id],
    queryFn: async () => {
      const res = await filtersApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  const { data: guardrail } = useQuery({
    queryKey: ['guardrail', org?.id],
    queryFn: async () => {
      const res = await filtersApi.guardrailStatus();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { enabled: boolean; configured: boolean };
    },
    enabled: !!org?.id,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await filtersApi.create({
        name: form.name,
        type: form.type,
        pattern: form.pattern,
        action: form.action,
        active: true,
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('activate'));
      qc.invalidateQueries({ queryKey: ['filters'] });
      setForm((f) => ({ ...f, name: '', pattern: '' }));
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await filtersApi.update(id, { active });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['filters'] }),
  });

  const guardrailMut = useMutation({
    mutationFn: async (enable: boolean) => {
      const res = enable
        ? await filtersApi.enableGuardrail()
        : await filtersApi.disableGuardrail();
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrail'] });
      toast.success(t('guardrailToggle'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function runTest() {
    const res = await filtersApi.test({
      sample: form.sample,
      type: form.type,
      pattern: form.pattern,
      action: form.action,
    });
    if (res.success) setTestResult(res.data);
    else toast.error(res.error?.message);
  }

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">{t('guardrailTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('guardrailHint')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {guardrail?.enabled ? t('guardrailOn') : t('guardrailOff')}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={guardrailMut.isPending}
            onClick={() => guardrailMut.mutate(!guardrail?.enabled)}
          >
            {t('guardrailToggle')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label>{t('name')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('type')}</Label>
              <select
                className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              >
                <option value="keyword">keyword</option>
                <option value="regex">regex</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('action')}</Label>
              <select
                className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as any })}
              >
                <option value="block">{t('block')}</option>
                <option value="redact">{t('redact')}</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('pattern')}</Label>
            <Input
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('sample')}</Label>
            <Input
              value={form.sample}
              onChange={(e) => setForm({ ...form, sample: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={runTest}>
              {t('test')}
            </Button>
            <Button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!form.name || !form.pattern}
            >
              {t('create')}
            </Button>
          </div>
          {testResult ? (
            <pre className="overflow-x-auto rounded border border-border bg-muted p-3 font-mono text-xs">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card">
          {rules.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {r.type} · {r.action} · {r.pattern}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMut.mutate({ id: r.id, active: !r.active })}
                  >
                    {r.active ? t('deactivate') : t('activate')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
