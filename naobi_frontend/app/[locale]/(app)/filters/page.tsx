'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { filtersApi, guardrailsApi } from '@/lib/api/gateway.api';
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
  const [guardrailSample, setGuardrailSample] = useState('test content');
  const [selectedGuardrails, setSelectedGuardrails] = useState<string[]>([]);

  const { data: rules = [] } = useQuery({
    queryKey: ['filters', org?.id],
    queryFn: async () => {
      const res = await filtersApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ['filter-stats', org?.id],
    queryFn: async () => {
      const res = await filtersApi.stats(14);
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { total_blocks: number; series: { day: string; blocks: number }[] };
    },
    enabled: !!org?.id,
  });

  const { data: guardrails } = useQuery({
    queryKey: ['guardrails', org?.id],
    queryFn: async () => {
      const res = await guardrailsApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { bound_ids: string[]; platform: any };
    },
    enabled: !!org?.id,
  });

  useEffect(() => {
    if (guardrails?.bound_ids) setSelectedGuardrails(guardrails.bound_ids.map(String));
  }, [guardrails?.bound_ids]);

  const platformList: { id: string; name: string }[] = (() => {
    const raw = guardrails?.platform;
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.guardrails)
        ? raw.guardrails
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
    return arr.map((g: any) => ({
      id: String(g.guardrail_name || g.guardrail_id || g.id || g.name),
      name: String(g.guardrail_name || g.name || g.id),
    }));
  })();

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

  const bindMut = useMutation({
    mutationFn: async () => {
      const res = await guardrailsApi.bind(selectedGuardrails);
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('guardrailsBound'));
      qc.invalidateQueries({ queryKey: ['guardrails'] });
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

  async function testGuardrail(id: string) {
    const res = await guardrailsApi.test(id, guardrailSample);
    if (res.success) {
      toast.message(JSON.stringify(res.data));
    } else toast.error(res.error?.message);
  }

  function toggleGuardrail(id: string) {
    setSelectedGuardrails((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">{t('statsTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('statsTotal', { n: stats?.total_blocks ?? 0 })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(stats?.series || []).slice(-7).map((d) => (
            <span
              key={String(d.day)}
              className="rounded border border-border px-2 py-1 font-mono text-[11px]"
            >
              {String(d.day).slice(0, 10)}: {d.blocks}
            </span>
          ))}
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

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">{t('guardrailsTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('guardrailsHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t('guardrailSample')}</Label>
          <Input value={guardrailSample} onChange={(e) => setGuardrailSample(e.target.value)} />
        </div>
        {platformList.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('guardrailsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {platformList.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGuardrails.includes(g.id)}
                    onChange={() => toggleGuardrail(g.id)}
                  />
                  {g.name}
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => testGuardrail(g.id)}>
                  {t('test')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" onClick={() => bindMut.mutate()} disabled={bindMut.isPending}>
          {t('bindGuardrails')}
        </Button>
      </div>
    </div>
  );
}
