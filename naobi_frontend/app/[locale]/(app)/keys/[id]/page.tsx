'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { keysApi } from '@/lib/api/keys.api';
import type { AnalyticsSource, ApiKey, KeyLogItem } from '@/lib/types/api-key';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from '@/i18n/routing';
import { useAuthStore } from '@/lib/stores/auth.store';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import type { ApiKeyCreated } from '@/lib/types/api-key';
import {
  isUpstreamSource,
  readPlatformLastActive,
  readPlatformMaxBudget,
  readPlatformMeta,
  readPlatformSpend,
} from '@/lib/platform-fields';

type ConfirmAction = 'disable' | 'enable' | 'revoke' | 'rotate' | 'resetSpend' | null;

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number' && Number.isNaN(v)) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function SourceBadge({
  source,
  labelPlatform,
  labelApi,
}: {
  source?: AnalyticsSource | string | null;
  labelPlatform: string;
  labelApi: string;
}) {
  if (!source) return null;
  const text = isUpstreamSource(source)
    ? labelPlatform
    : source === 'gateway'
      ? labelApi
      : null;
  if (!text) return null;
  return (
    <Badge variant="outline" className="text-[10px] font-normal">
      {text}
    </Badge>
  );
}

export default function KeyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('keys');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);
  const [logPage, setLogPage] = useState(1);
  const [budgetMax, setBudgetMax] = useState('');
  const [rpmLimit, setRpmLimit] = useState('');
  const [tpmLimit, setTpmLimit] = useState('');
  const [limitsOpen, setLimitsOpen] = useState(false);

  const { data: key, isLoading, error } = useQuery({
    queryKey: ['key', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.get(id);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: analytics } = useQuery({
    queryKey: ['key-analytics', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.analytics(id);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: usage } = useQuery({
    queryKey: ['key-usage', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.usage(id, 14);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: models } = useQuery({
    queryKey: ['key-models', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.models(id);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: providers } = useQuery({
    queryKey: ['key-providers', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.providers(id);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: logs } = useQuery({
    queryKey: ['key-logs', id, org?.id, logPage],
    queryFn: async () => {
      const res = await keysApi.logs(id, { page: logPage, limit: 25, source: 'auto' });
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    enabled: !!org?.id && !!id,
  });

  const { data: errors } = useQuery({
    queryKey: ['key-errors', id, org?.id],
    queryFn: async () => {
      const res = await keysApi.errors(id);
      if (!res.success) return null;
      return res.data ?? null;
    },
    enabled: !!org?.id && !!id,
    retry: false,
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await keysApi.update(id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('updated'));
      setRenameOpen(false);
      qc.invalidateQueries({ queryKey: ['key', id] });
      qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async (action: Exclude<ConfirmAction, null>) => {
      if (action === 'rotate') {
        const res = await keysApi.rotate(id);
        if (!res.success) throw new Error(res.error?.message);
        return { action, data: res.data };
      }
      if (action === 'resetSpend') {
        const res = await keysApi.resetSpend(id);
        if (!res.success) throw new Error(res.error?.message);
        return { action, data: res.data };
      }
      const fn =
        action === 'disable'
          ? keysApi.disable
          : action === 'enable'
            ? keysApi.enable
            : keysApi.revoke;
      const res = await fn(id);
      if (!res.success) throw new Error(res.error?.message);
      return { action, data: res.data };
    },
    onSuccess: ({ action, data }) => {
      if (action === 'rotate' && data && 'key' in (data as ApiKeyCreated)) {
        setReveal(data as ApiKeyCreated);
        toast.success(t('rotated'));
      } else if (action === 'resetSpend') {
        toast.success(t('spendReset'));
      } else {
        toast.success(
          action === 'revoke' ? t('revoked') : action === 'disable' ? t('disabled') : t('enabled'),
        );
      }
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['key', id] });
      qc.invalidateQueries({ queryKey: ['keys'] });
      qc.invalidateQueries({ queryKey: ['key-analytics', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limitsMut = useMutation({
    mutationFn: async () => {
      const res = await keysApi.update(id, {
        budget_max: budgetMax === '' ? null : Number(budgetMax),
        rpm_limit: rpmLimit === '' ? null : Number(rpmLimit),
        tpm_limit: tpmLimit === '' ? null : Number(tpmLimit),
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('limitsSaved'));
      setLimitsOpen(false);
      qc.invalidateQueries({ queryKey: ['key', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openRename(k: ApiKey) {
    setName(k.name);
    setDescription(k.description || '');
    setRenameOpen(true);
  }

  function openLimits(k: ApiKey) {
    setBudgetMax(k.budget_max != null ? String(k.budget_max) : '');
    setRpmLimit(k.rpm_limit != null ? String(k.rpm_limit) : '');
    setTpmLimit(k.tpm_limit != null ? String(k.tpm_limit) : '');
    setLimitsOpen(true);
  }

  const overview = (analytics?.overview || {}) as Record<string, unknown>;
  const platformMeta = {
    ...readPlatformMeta(analytics as unknown as Record<string, unknown>),
    ...readPlatformMeta(key as unknown as Record<string, unknown>),
  };
  const series = usage?.series || [];
  const maxReq = Math.max(
    1,
    ...series.map((s) => Number(s.api_requests ?? 0)),
  );

  const spendVal = readPlatformSpend(overview);
  const maxBudgetVal = readPlatformMaxBudget(overview);
  const lastActiveVal = readPlatformLastActive(overview);

  const metricCards: Array<{ label: string; value: string; source?: AnalyticsSource }> = [];
  if (spendVal != null) {
    metricCards.push({
      label: t('platformSpend'),
      value: `${spendVal.toFixed(4)} USD`,
      source: 'platform',
    });
  } else if (hasValue(overview.gateway_cost)) {
    metricCards.push({
      label: t('metricCost'),
      value: `${Number(overview.gateway_cost).toFixed(4)} USD`,
      source: 'gateway',
    });
  }
  if (hasValue(overview.gateway_requests)) {
    metricCards.push({
      label: t('metricRequests'),
      value: String(overview.gateway_requests),
      source: 'gateway',
    });
  }
  const tokenIn =
    overview.tokens_input ?? overview.gateway_tokens_input;
  const tokenOut =
    overview.tokens_output ?? overview.gateway_tokens_output;
  const tokenSource: AnalyticsSource =
    overview.tokens_source === 'litellm'
      ? 'platform'
      : overview.tokens_source === 'gateway' ||
          hasValue(overview.gateway_tokens_input) ||
          hasValue(overview.gateway_tokens_output)
        ? 'gateway'
        : null;
  if (hasValue(tokenIn) || hasValue(tokenOut)) {
    metricCards.push({
      label: t('metricTokensInput'),
      value: Number(tokenIn || 0).toLocaleString(),
      source: tokenSource,
    });
    metricCards.push({
      label: t('metricTokensOutput'),
      value: Number(tokenOut || 0).toLocaleString(),
      source: tokenSource,
    });
  }
  if (hasValue(overview.gateway_avg_latency_ms)) {
    metricCards.push({
      label: t('metricLatency'),
      value: `${Math.round(Number(overview.gateway_avg_latency_ms))} ms`,
      source: 'gateway',
    });
  }
  if (hasValue(maxBudgetVal)) {
    metricCards.push({
      label: t('platformBudget'),
      value: String(maxBudgetVal),
      source: 'platform',
    });
  }

  const logItems = logs?.items || [];
  const showProviderCol = logItems.some((r) => hasValue(r.provider));
  const showLatencyCol = logItems.some((r) => hasValue(r.request_duration_ms));
  const showSpendCol = logItems.some((r) => hasValue(r.spend));

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">…</p>;
  }

  if (error || !key) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-sm text-destructive">{(error as Error)?.message || t('notFound')}</p>
        <Button asChild variant="outline">
          <Link href="/keys">{t('backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/keys">← {t('backToList')}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-lg font-semibold">{key.name}</h1>
            <Badge variant="outline">{key.status}</Badge>
            {platformMeta.blocked === true ? (
              <Badge variant="destructive">{t('platformBlocked')}</Badge>
            ) : null}
          </div>
          {key.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{key.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openRename(key)}>
            {t('rename')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openLimits(key)}>
            {t('editLimits')}
          </Button>
          {key.status === 'active' || key.status === 'disabled' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm('rotate')}>
              {t('rotate')}
            </Button>
          ) : null}
          {key.status !== 'revoked' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm('resetSpend')}>
              {t('resetSpend')}
            </Button>
          ) : null}
          {key.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm('disable')}>
              {t('disable')}
            </Button>
          ) : null}
          {key.status === 'disabled' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm('enable')}>
              {t('enable')}
            </Button>
          ) : null}
          {key.status !== 'revoked' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirm('revoke')}>
              {t('revoke')}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('createNew')}
          </Button>
        </div>
      </div>

      <section>
        <p className="mb-3 text-sm font-medium">{t('overviewTitle')}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoCard label={t('prefix')} value={`${key.key_prefix}…`} mono />
          <InfoCard label={t('scope')} value={key.scope} />
          {key.created_at ? (
            <InfoCard label={t('createdAt')} value={new Date(key.created_at).toLocaleString()} />
          ) : null}
          {key.last_used_at ? (
            <InfoCard label={t('lastUsed')} value={new Date(key.last_used_at).toLocaleString()} />
          ) : hasValue(lastActiveVal) ? (
            <InfoCard
              label={t('lastUsed')}
              value={new Date(String(lastActiveVal)).toLocaleString()}
            />
          ) : null}
          {key.expires_at ? (
            <InfoCard
              label={t('expiresAt')}
              value={new Date(key.expires_at).toLocaleDateString()}
            />
          ) : (
            <InfoCard label={t('expiresAt')} value={t('neverExpires')} />
          )}
          {key.budget_max != null ? (
            <InfoCard
              label={t('budget')}
              value={`${Number(key.budget_consumed).toFixed(2)} / ${key.budget_max}`}
              mono
            />
          ) : null}
        </div>
      </section>

      {metricCards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((m) => (
            <div key={m.label} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <SourceBadge
                  source={m.source}
                  labelPlatform={t('sourcePlatform')}
                  labelApi={t('sourceApiTraffic')}
                />
              </div>
              <div className="font-mono text-xl font-medium">{m.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {series.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium">{t('usageSeries')}</p>
            <SourceBadge
              source={usage?.source}
              labelPlatform={t('sourcePlatform')}
              labelApi={t('sourceApiTraffic')}
            />
          </div>
          <div className="flex h-28 items-end gap-1">
            {series.map((s) => {
              const reqs = Number(s.api_requests ?? 0);
              return (
                <div key={String(s.day)} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-[#FF6B35]/80"
                    style={{ height: `${Math.max(4, (reqs / maxReq) * 100)}%` }}
                    title={reqs ? `${reqs} req` : s.spend != null ? `${s.spend} USD` : ''}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(s.day).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {models?.items?.length ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium">{t('modelsTitle')}</p>
            <SourceBadge
              source={models.source}
              labelPlatform={t('sourcePlatform')}
              labelApi={t('sourceApiTraffic')}
            />
          </div>
          <ul className="space-y-2">
            {models.items.slice(0, 12).map((m) => (
              <li
                key={m.model}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="font-mono text-xs">{m.model}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {m.spend != null
                    ? `${Number(m.spend).toFixed(4)} USD`
                    : m.requests != null
                      ? `${m.requests}`
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {providers?.items?.length ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium">{t('providersTitle')}</p>
            <SourceBadge
              source={providers.source}
              labelPlatform={t('sourcePlatform')}
              labelApi={t('sourceApiTraffic')}
            />
          </div>
          <ul className="space-y-2">
            {providers.items.map((p) => (
              <li
                key={p.provider}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-xs">{p.provider}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.spend != null
                    ? `${Number(p.spend).toFixed(4)} USD`
                    : p.api_requests != null
                      ? `${p.api_requests}`
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{t('logsTitle')}</p>
            <SourceBadge
              source={logs?.source}
              labelPlatform={t('sourcePlatform')}
              labelApi={t('sourceApiTraffic')}
            />
          </div>
        </div>
        {!logItems.length ? (
          <p className="p-6 text-sm text-muted-foreground">{t('logsEmpty')}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-4 py-2">{t('logDate')}</th>
                  <th className="px-4 py-2">{t('logModel')}</th>
                  {showProviderCol ? <th className="px-4 py-2">{t('logProvider')}</th> : null}
                  <th className="px-4 py-2">{t('status')}</th>
                  {showLatencyCol ? <th className="px-4 py-2">{t('logLatency')}</th> : null}
                  {showSpendCol ? <th className="px-4 py-2">{t('logCost')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {logItems.map((row: KeyLogItem, idx) => (
                  <tr key={row.request_id || `${idx}`} className="border-b border-border">
                    <td className="px-4 py-2 text-xs">
                      {row.start_time ? new Date(row.start_time).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{row.model || '—'}</td>
                    {showProviderCol ? (
                      <td className="px-4 py-2 text-xs">{row.provider || '—'}</td>
                    ) : null}
                    <td className="px-4 py-2">
                      {row.status ? <Badge variant="outline">{row.status}</Badge> : null}
                    </td>
                    {showLatencyCol ? (
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.request_duration_ms != null
                          ? `${row.request_duration_ms} ms`
                          : '—'}
                      </td>
                    ) : null}
                    {showSpendCol ? (
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.spend != null ? Number(row.spend).toFixed(4) : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {logs && logs.pagination.pages > 1 ? (
              <div className="flex items-center justify-end gap-2 p-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage <= 1}
                  onClick={() => setLogPage((p) => p - 1)}
                >
                  ←
                </Button>
                <span className="text-xs text-muted-foreground">
                  {logs.pagination.page} / {logs.pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage >= logs.pagination.pages}
                  onClick={() => setLogPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {errors && errors.total > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium text-destructive">
              {t('errorsTitle')} ({errors.total})
            </p>
            <SourceBadge
              source={errors.source}
              labelPlatform={t('sourcePlatform')}
              labelApi={t('sourceApiTraffic')}
            />
          </div>
          <ul className="space-y-2">
            {errors.items.slice(0, 10).map((e, i) => (
              <li key={e.request_id || i} className="flex flex-wrap gap-2 text-xs">
                <span className="font-mono">{e.model || '—'}</span>
                <Badge variant="outline">{e.status}</Badge>
                {e.error_code ? <span className="text-muted-foreground">{e.error_code}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !name.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('limitsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>{t('budget')}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="USD"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('rpmLimit')}</Label>
              <Input
                type="number"
                min={0}
                value={rpmLimit}
                onChange={(e) => setRpmLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('tpmLimit')}</Label>
              <Input
                type="number"
                min={0}
                value={tpmLimit}
                onChange={(e) => setTpmLimit(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => limitsMut.mutate()} disabled={limitsMut.isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'revoke'
                ? t('revokeConfirmTitle')
                : confirm === 'disable'
                  ? t('disableConfirmTitle')
                  : confirm === 'enable'
                    ? t('enableConfirmTitle')
                    : confirm === 'rotate'
                      ? t('rotateConfirmTitle')
                      : t('resetSpendConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'revoke'
                ? t('revokeConfirmBody')
                : confirm === 'disable'
                  ? t('disableConfirmBody')
                  : confirm === 'enable'
                    ? t('enableConfirmBody')
                    : confirm === 'rotate'
                      ? t('rotateConfirmBody')
                      : t('resetSpendConfirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && actionMut.mutate(confirm)}
              disabled={actionMut.isPending}
            >
              {confirm === 'revoke'
                ? t('revoke')
                : confirm === 'disable'
                  ? t('disable')
                  : confirm === 'enable'
                    ? t('enable')
                    : confirm === 'rotate'
                      ? t('rotate')
                      : t('resetSpend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm font-medium'}>{value}</div>
    </div>
  );
}
