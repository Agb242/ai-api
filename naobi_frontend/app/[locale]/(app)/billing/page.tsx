'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { billingApi } from '@/lib/api/billing.api';
import { budgetsApi } from '@/lib/api/budgets.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/stores/auth.store';
import { cn } from '@/lib/utils';

type Pack = {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  price_xof: number;
  currency: string;
  max_budget: number;
  advantages?: string[];
  models?: string[];
};

export default function BillingPage() {
  const t = useTranslations('billing');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [packId, setPackId] = useState('');
  const [phone, setPhone] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<any>(null);
  const [claimKey, setClaimKey] = useState('');
  const [ceiling, setCeiling] = useState('100');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [overage, setOverage] = useState<'block' | 'alert'>('block');

  const { data: packs = [] } = useQuery({
    queryKey: ['packs'],
    queryFn: async () => {
      const res = await billingApi.listPacks();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as Pack[]) || [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ['billing-history', org?.id],
    queryFn: async () => {
      const res = await billingApi.history();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  const { data: health } = useQuery({
    queryKey: ['litellm-health'],
    queryFn: async () => {
      const res = await billingApi.litellmHealth();
      return res.data as any;
    },
    enabled: !!org?.id,
    refetchInterval: 30000,
  });

  const { data: activeBudget } = useQuery({
    queryKey: ['budget-active', org?.id],
    queryFn: async () => {
      const res = await budgetsApi.active();
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id,
  });

  useEffect(() => {
    if (activeBudget) {
      setCeiling(String(activeBudget.ceiling));
      setPeriod(activeBudget.period);
      setOverage(activeBudget.overage_action);
    }
  }, [activeBudget]);

  useEffect(() => {
    try {
      const pending =
        sessionStorage.getItem('noabi_pending_claim_key') ||
        sessionStorage.getItem('nexusai_pending_claim_key');
      if (pending) {
        setClaimKey(pending);
        sessionStorage.removeItem('noabi_pending_claim_key');
        sessionStorage.removeItem('nexusai_pending_claim_key');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!ref) return;
    const id = setInterval(async () => {
      const res = await billingApi.status(ref);
      if (res.success) {
        setPollStatus(res.data);
        if ((res.data as any)?.status === 'approved') {
          clearInterval(id);
          if ((res.data as any)?.key) {
            setClaimKey((res.data as any).key);
            toast.success(t('paymentOk'));
          }
          qc.invalidateQueries({ queryKey: ['billing-history'] });
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }, [ref, qc, t]);

  const buyMut = useMutation({
    mutationFn: async () => {
      const res = await billingApi.initiate({
        pack_id: packId,
        phone,
        pseudo,
        operator: 'mtn',
        country: 'BJ',
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data as any;
    },
    onSuccess: (data) => {
      setRef(data.external_reference);
      setPollStatus({ status: data.status });
      toast.success(t('paymentStarted'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimMut = useMutation({
    mutationFn: async () => {
      const res = await billingApi.claim(claimKey.trim());
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('claimed'));
      setClaimKey('');
      qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const budgetMut = useMutation({
    mutationFn: async () => {
      const res = await budgetsApi.upsert({
        period,
        ceiling: Number(ceiling),
        overage_action: overage,
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('ceilingSaved'));
      qc.invalidateQueries({ queryKey: ['budget-active'] });
      qc.invalidateQueries({ queryKey: ['metrics-dashboard'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-8 p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <span
          className={cn(
            'font-mono text-[11px] uppercase tracking-wide',
            health?.litellm_healthy ? 'text-[hsl(var(--success))]' : 'text-muted-foreground',
          )}
        >
          {t('platformStatus')} · {health?.litellm_healthy ? t('healthy') : t('degraded')}
        </span>
      </div>

      <section className="max-w-lg space-y-4 border border-border bg-card p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide">{t('ceilings')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('ceilingsSub')}</p>
        </div>
        {activeBudget ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t('activeCeiling')}: {activeBudget.consumed.toFixed(4)} / {activeBudget.ceiling} (
            {Math.round(activeBudget.usage_ratio * 100)}%)
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('noCeiling')}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('ceiling')}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('period')}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}
            >
              <option value="day">{t('periodDay')}</option>
              <option value="week">{t('periodWeek')}</option>
              <option value="month">{t('periodMonth')}</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('overage')}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={overage}
              onChange={(e) => setOverage(e.target.value as 'block' | 'alert')}
            >
              <option value="block">{t('overageBlock')}</option>
              <option value="alert">{t('overageAlert')}</option>
            </select>
          </div>
        </div>
        <Button
          disabled={!ceiling || Number(ceiling) <= 0 || budgetMut.isPending}
          onClick={() => budgetMut.mutate()}
        >
          {t('saveCeiling')}
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {packs.map((p) => (
          <button
            key={p.slug || p.id}
            type="button"
            onClick={() => setPackId(p.slug || p.id)}
            className={cn(
              'rounded-none border border-border bg-card p-5 text-left transition-colors',
              packId === (p.slug || p.id) ? 'border-foreground bg-foreground text-background' : 'hover:border-foreground/40',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold">{p.name}</h2>
              <p className="font-mono text-sm">
                {p.price_xof?.toLocaleString()} {p.currency}
              </p>
            </div>
            <p className={cn('mt-1 text-sm', packId === (p.slug || p.id) ? 'text-background/70' : 'text-muted-foreground')}>
              {p.tagline}
            </p>
            <p className="mt-3 font-mono text-xs opacity-80">
              {t('budget')}: ${p.max_budget}
            </p>
          </button>
        ))}
      </section>

      <section className="max-w-md space-y-4 border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{t('buy')}</h2>
        <div className="space-y-2">
          <Label htmlFor="pseudo">{t('pseudo')}</Label>
          <Input id="pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} className="rounded-none" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="22901…" className="rounded-none" />
        </div>
        <Button
          className="w-full rounded-none"
          disabled={!packId || !phone || !pseudo || buyMut.isPending}
          onClick={() => buyMut.mutate()}
        >
          {buyMut.isPending ? t('processing') : t('payMomo')}
        </Button>
        {ref ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t('ref')}: {ref} · {pollStatus?.status || '…'}
          </p>
        ) : null}
      </section>

      <section className="max-w-md space-y-4 border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{t('claimTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('claimHint')}</p>
        <Input
          value={claimKey}
          onChange={(e) => setClaimKey(e.target.value)}
          placeholder="sk-…"
          className="rounded-none font-mono text-xs"
        />
        <Button
          variant="outline"
          className="rounded-none"
          disabled={!claimKey.trim() || claimMut.isPending}
          onClick={() => claimMut.mutate()}
        >
          {t('claim')}
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{t('history')}</h2>
        <div className="border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2">{t('date')}</th>
                <th className="px-4 py-2">{t('pack')}</th>
                <th className="px-4 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                    {t('emptyHistory')}
                  </td>
                </tr>
              ) : (
                history.map((row: any) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">{row.pack_name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
