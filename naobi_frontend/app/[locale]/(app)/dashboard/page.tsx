'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { io, Socket } from 'socket.io-client';
import { metricsApi } from '@/lib/api/gateway.api';
import { keysApi } from '@/lib/api/keys.api';
import { analyticsApi } from '@/lib/api/budgets.api';
import type { ApiKey, ApiKeyCreated } from '@/lib/types/api-key';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { ModelCatalogPreview } from '@/components/models/ModelCatalogPreview';
import type { PlaygroundModel } from '@/lib/types/playground-model';

type LiveRow = {
  id: string;
  model?: string;
  status?: string;
  latency_ms?: number;
  cost?: number;
  created_at?: string;
  filter_action?: string | null;
  rule?: string;
};

function StatusBadge({ status, rule, t }: { status?: string; rule?: string; t: (k: string) => string }) {
  if (status === 'blocked') {
    return (
      <span className="inline-flex items-center rounded-full bg-[hsl(var(--destructive)/0.08)] px-2.5 py-0.5 text-[11px] font-medium text-destructive">
        {t('blocked')}
        {rule ? ` — ${rule}` : ''}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center rounded-full bg-[hsl(var(--warning-soft))] px-2.5 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]">
        {t('error')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[hsl(var(--success-soft))] px-2.5 py-0.5 text-[11px] font-medium text-[hsl(var(--success))]">
      {t('success')}
    </span>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const org = useAuthStore((s) => s.org);
  const session = useAuthStore((s) => s.session);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);

  const { data } = useQuery({
    queryKey: ['metrics-dashboard', org?.id],
    queryFn: async () => {
      const res = await metricsApi.dashboard();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as any;
    },
    enabled: !!org?.id,
    refetchInterval: 15000,
  });

  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['keys', org?.id],
    queryFn: async () => {
      const res = await keysApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as ApiKey[]) || [];
    },
    enabled: !!org?.id,
  });

  const { data: spendTags } = useQuery({
    queryKey: ['spend-tags', org?.id],
    queryFn: async () => {
      const res = await analyticsApi.spendTags();
      if (!res.success) throw new Error(res.error?.message);
      return res.data!;
    },
    enabled: !!org?.id,
  });

  const { data: endUsers } = useQuery({
    queryKey: ['end-users', org?.id],
    queryFn: async () => {
      const res = await analyticsApi.endUsers(30);
      if (!res.success) throw new Error(res.error?.message);
      return res.data!;
    },
    enabled: !!org?.id,
  });

  useEffect(() => {
    if (!org?.id || !session?.token) return;
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1').replace(
      /\/api\/v1\/?$/,
      '',
    );
    const socket: Socket = io(base, {
      auth: { token: session.token },
      transports: ['websocket', 'polling'],
    });
    socket.emit('join_org', org.id);
    socket.on('request:new', (payload: LiveRow) => {
      setLive((prev) => [payload, ...prev].slice(0, 20));
    });
    return () => {
      socket.disconnect();
    };
  }, [org?.id, session?.token]);

  const rows: LiveRow[] = useMemo(() => {
    const recent = (data?.recent || []) as LiveRow[];
    const merged = [...live, ...recent];
    const seen = new Set<string>();
    return merged.filter((r) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [live, data?.recent]);

  const metrics = data?.metrics || {
    requests_today: 0,
    tokens_today: 0,
    latency_avg_ms: 0,
    cost_month: 0,
    platform_spend_total: 0,
  };
  const catalogModels = (Array.isArray(data?.models) ? data.models : []) as PlaygroundModel[];
  const catalogStatus = data?.catalog_status as 'available' | 'degraded' | undefined;
  const budget = data?.budget || { ceiling: null, consumed: 0 };
  const ceiling = budget.ceiling != null ? Number(budget.ceiling) : null;
  const budgetPct =
    ceiling && ceiling > 0
      ? Math.min(100, Math.round((Number(budget.consumed) / ceiling) * 100))
      : 0;

  const showFirstKey = !!org?.id && !keysLoading && keys.length === 0;

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          {org?.name ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('orgLabel')}: <span className="font-medium text-foreground">{org.name}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-1.5 text-[13px]">
          {t('balance')}{' '}
          <span className="font-mono font-medium">
            {Number(data?.wallet?.balance ?? 0).toLocaleString()} {t('credits')}
          </span>
        </div>
      </div>

      {showFirstKey || reveal ? (
        <div className="rounded-xl border border-[#FF6B35]/40 bg-card p-4 md:p-5">
          <p className="font-display text-sm font-semibold">{t('firstKeyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('firstKeyBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!reveal ? (
              <Button onClick={() => setCreateOpen(true)} disabled={!org?.id}>
                {t('createFirstKey')}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/keys">{t('manageKeys')}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => setReveal(created)}
      />
      <RevealApiKeyDialog
        open={!!reveal}
        onOpenChange={(o) => {
          if (!o) setReveal(null);
        }}
        plaintext={reveal?.key ?? null}
        keyName={reveal?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('requestsToday'), value: metrics.requests_today },
          {
            label: t('tokens'),
            value:
              metrics.tokens_today >= 1_000_000
                ? `${(metrics.tokens_today / 1_000_000).toFixed(2)}M`
                : metrics.tokens_today.toLocaleString(),
          },
          {
            label: t('latency'),
            value: `${metrics.latency_avg_ms ?? metrics.latency_median_ms ?? 0}`,
            suffix: ' ms',
          },
          {
            label: t('costMonth'),
            value: `${Number(metrics.platform_spend_total ?? metrics.cost_month ?? 0).toFixed(4)}`,
            suffix: ' USD',
          },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs text-muted-foreground">{m.label}</div>
            <div className="font-mono text-2xl font-medium">
              {m.value}
              {m.suffix ? <span className="text-sm text-muted-foreground">{m.suffix}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 md:p-5">
          <p className="font-display text-sm font-semibold">{t('spendTags')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{t('spendTagsSub')}</p>
          {spendTags?.empty || !spendTags?.tags?.length ? (
            <p className="text-sm text-muted-foreground">{t('spendTagsEmpty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {spendTags.tags.slice(0, 8).map((row: any, i: number) => (
                <li key={i} className="flex justify-between gap-2 font-mono text-xs">
                  <span className="truncate">{row.tag || row.name || JSON.stringify(row).slice(0, 40)}</span>
                  <span>{Number(row.spend ?? row.cost ?? 0).toFixed(4)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4 md:p-5">
          <p className="font-display text-sm font-semibold">{t('endUsers')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{t('endUsersSub')}</p>
          {!endUsers?.items?.length ? (
            <p className="text-sm text-muted-foreground">{t('endUsersEmpty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {endUsers.items.slice(0, 8).map((row) => (
                <li key={row.end_user_id} className="flex justify-between gap-2 font-mono text-xs">
                  <span className="truncate">{row.end_user_id}</span>
                  <span>
                    {row.requests} · {row.cost.toFixed(4)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 md:p-5">
        <p className="font-display text-sm font-semibold">{t('liveFlow')}</p>
        <p className="mb-4 text-xs text-muted-foreground">{t('liveFlowSub')}</p>

        <div className="relative mb-2 flex justify-between px-1">
          <div className="absolute top-[5px] right-[5%] left-[5%] h-px bg-border" />
          {[t('client'), t('filter'), t('router'), t('provider')].map((label) => (
            <div
              key={label}
              className="z-[1] flex flex-col items-center gap-1.5 bg-card px-1 text-[11px] text-muted-foreground"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              {label}
            </div>
          ))}
        </div>
        <div className="relative mb-4 h-5">
          <div className="absolute top-1.5 right-[5%] left-[5%] h-px bg-border" />
          {rows.slice(0, 3).map((r, i) => (
            <span
              key={`${r.id}-pulse`}
              className={cn(
                'absolute top-1.5 h-2 w-2 rounded-full',
                r.status === 'blocked' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ left: `${12 + i * 28}%` }}
            />
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2.5 py-2 font-medium">{t('time')}</th>
                <th className="px-2.5 py-2 font-medium">{t('model')}</th>
                <th className="px-2.5 py-2 font-medium">{t('status')}</th>
                <th className="px-2.5 py-2 font-medium">{t('latencyCol')}</th>
                <th className="px-2.5 py-2 font-medium">{t('cost')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2.5 py-8 text-center text-muted-foreground">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                rows.slice(0, 12).map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-2.5 py-2.5 font-mono text-[12.5px]">
                      {r.created_at ? new Date(r.created_at).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-2.5 py-2.5">{r.model || '—'}</td>
                    <td className="px-2.5 py-2.5">
                      <StatusBadge status={r.status} rule={r.rule} t={t} />
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-[12.5px]">
                      {r.latency_ms != null ? `${r.latency_ms} ms` : '—'}
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-[12.5px]">
                      {Number(r.cost || 0).toFixed(2)} cr.
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-display text-sm font-semibold">{t('budget')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{t('budgetSub')}</p>
          {ceiling ? (
            <>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  {Number(budget.consumed).toFixed(2)} / {ceiling}
                </span>
                <span>{budgetPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${budgetPct}%` }} />
              </div>
            </>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">—</p>
          )}
        </div>
        <ModelCatalogPreview
          models={catalogModels}
          catalogStatus={catalogStatus}
        />
      </div>
    </div>
  );
}
