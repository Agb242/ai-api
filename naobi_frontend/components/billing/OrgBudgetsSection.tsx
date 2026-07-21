'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { budgetsApi, type OrgBudget } from '@/lib/api/budgets.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth.store';

export function OrgBudgetsSection() {
  const t = useTranslations('billing');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [ceiling, setCeiling] = useState('');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets', org?.id],
    queryFn: async () => {
      const res = await budgetsApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as OrgBudget[]) || [];
    },
    enabled: !!org?.id,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const n = Number(ceiling);
      if (Number.isNaN(n) || n < 0) throw new Error(t('budgetInvalid'));
      const res = await budgetsApi.create({ ceiling: n, period });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('budgetCreated'));
      setCeiling('');
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await budgetsApi.remove(id);
      if (!res.success) throw new Error(res.error?.message);
    },
    onSuccess: () => {
      toast.success(t('budgetDeleted'));
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-base font-semibold">{t('orgBudgetTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('orgBudgetHint')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
        <div className="space-y-1.5">
          <Label>{t('orgBudgetCeiling')}</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={ceiling}
            onChange={(e) => setCeiling(e.target.value)}
            placeholder="100"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('orgBudgetPeriod')}</Label>
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
        <div className="flex items-end">
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !ceiling.trim()}
          >
            {t('orgBudgetCreate')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('orgBudgetEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {budgets.map((b) => {
            const pct = Math.min(100, Math.round((b.usage_ratio || 0) * 100));
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {b.consumed.toFixed(2)} / {b.ceiling.toFixed(2)} USD
                    </span>
                    <Badge variant="outline">{b.period}</Badge>
                    {b.soft_limit_hit ? (
                      <Badge variant="secondary">{t('softLimit')}</Badge>
                    ) : null}
                    {b.hard_limit_hit ? (
                      <Badge variant="destructive">{t('hardLimit')}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${b.hard_limit_hit ? 'bg-destructive' : b.soft_limit_hit ? 'bg-amber-500' : 'bg-foreground'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => deleteMut.mutate(b.id)}
                  disabled={deleteMut.isPending}
                >
                  {t('orgBudgetDelete')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
