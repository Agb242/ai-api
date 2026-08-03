import { ApiKey } from '../models/ApiKey';
import { RequestLog } from '../models/RequestLog';
import { redisClient } from '../config/redis';
import { litellmAdmin } from './litellm-admin.service';
import { apiKeyService } from './api-key.service';
import logger from '../config/logger';

const CACHE_TTL_SEC = 60;
const SNAPSHOT_TTL_SEC = 900;

function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

function normalizeLitellmKey(row: Record<string, unknown> | null) {
  if (!row) return null;
  const modelSpend = row.model_spend;
  const models = Array.isArray(row.models) ? row.models : undefined;
  return defined({
    key_alias: row.key_alias != null ? String(row.key_alias) : undefined,
    spend: row.spend != null ? Number(row.spend) : undefined,
    max_budget: row.max_budget != null ? Number(row.max_budget) : undefined,
    budget_duration: row.budget_duration != null ? String(row.budget_duration) : undefined,
    budget_reset_at: row.budget_reset_at != null ? String(row.budget_reset_at) : undefined,
    blocked: typeof row.blocked === 'boolean' ? row.blocked : undefined,
    rpm_limit: row.rpm_limit != null ? Number(row.rpm_limit) : undefined,
    tpm_limit: row.tpm_limit != null ? Number(row.tpm_limit) : undefined,
    max_parallel_requests:
      row.max_parallel_requests != null ? Number(row.max_parallel_requests) : undefined,
    models_allowed: models && models.length ? models.map(String) : undefined,
    model_spend:
      modelSpend && typeof modelSpend === 'object' && Object.keys(modelSpend as object).length
        ? modelSpend
        : undefined,
    last_active: row.last_active != null ? String(row.last_active) : undefined,
    expires: row.expires != null ? String(row.expires) : undefined,
  });
}

function normalizeSpendLog(log: any) {
  return defined({
    request_id: log.request_id != null ? String(log.request_id) : undefined,
    call_type: log.call_type != null ? String(log.call_type) : undefined,
    model: log.model != null ? String(log.model) : undefined,
    provider: log.custom_llm_provider != null ? String(log.custom_llm_provider) : undefined,
    status: log.status != null ? String(log.status) : undefined,
    spend: log.spend != null ? Number(log.spend) : undefined,
    prompt_tokens: log.prompt_tokens != null ? Number(log.prompt_tokens) : undefined,
    completion_tokens: log.completion_tokens != null ? Number(log.completion_tokens) : undefined,
    total_tokens: log.total_tokens != null ? Number(log.total_tokens) : undefined,
    request_duration_ms:
      log.request_duration_ms != null ? Number(log.request_duration_ms) : undefined,
    start_time: log.startTime != null ? String(log.startTime) : undefined,
    end_time: log.endTime != null ? String(log.endTime) : undefined,
    api_base: log.api_base != null ? String(log.api_base) : undefined,
  });
}

function normalizeGatewayLog(row: RequestLog) {
  return defined({
    request_id: row.id,
    model: row.model_id != null ? String(row.model_id) : undefined,
    status: row.status != null ? String(row.status) : undefined,
    spend: row.cost != null ? Number(row.cost) : undefined,
    prompt_tokens: row.tokens_input != null ? Number(row.tokens_input) : undefined,
    completion_tokens: row.tokens_output != null ? Number(row.tokens_output) : undefined,
    total_tokens:
      row.tokens_input != null || row.tokens_output != null
        ? Number(row.tokens_input || 0) + Number(row.tokens_output || 0)
        : undefined,
    request_duration_ms: row.latency_ms != null ? Number(row.latency_ms) : undefined,
    start_time: row.created_at != null ? String(row.created_at) : undefined,
    error_code: row.error_code != null ? String(row.error_code) : undefined,
    provider: row.router_backend != null ? String(row.router_backend) : undefined,
    source: 'gateway' as const,
  });
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: unknown, ttl = CACHE_TTL_SEC) {
  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn('analytics cache set failed', { err });
  }
}

export const keyAnalyticsService = {
  async analytics(organizationId: string, keyId: string) {
    const key = await apiKeyService.getById(organizationId, keyId);
    if (!key) return null;

    const cacheKey = `nexusia:key-analytics:${keyId}`;
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return cached;

    const localMetrics = await apiKeyService.metrics(organizationId, keyId);
    const litellmRow = await litellmAdmin.resolveKeyRecord({
      litellmUserId: key.litellm_user_id,
      litellmKeyId: key.litellm_key_id,
    });
    const litellm = normalizeLitellmKey(litellmRow);

    const localTotals = localMetrics?.totals;
    const hasLocalRequests = localTotals && localTotals.requests > 0;

    // Prefer LiteLLM daily activity totals for this key (prompt/completion), fallback local gateway
    let tokens_input: number | undefined;
    let tokens_output: number | undefined;
    let tokens_source: 'litellm' | 'gateway' | undefined;
    try {
      const usagePayload = await this.usage(organizationId, keyId, 90);
      let inSum = 0;
      let outSum = 0;
      for (const p of usagePayload?.series || []) {
        inSum += Number((p as any).prompt_tokens || 0);
        outSum += Number((p as any).completion_tokens || 0);
      }
      if (inSum > 0 || outSum > 0) {
        tokens_input = inSum;
        tokens_output = outSum;
        tokens_source = usagePayload?.source === 'gateway' ? 'gateway' : 'litellm';
      }
    } catch (err) {
      logger.warn('analytics usage token sum failed', { keyId, err });
    }
    if (tokens_input == null && tokens_output == null && hasLocalRequests) {
      tokens_input = localTotals!.tokens_input;
      tokens_output = localTotals!.tokens_output;
      tokens_source = 'gateway';
    }

    const overview = defined({
      status: key.status,
      last_used_at: key.last_used_at ? String(key.last_used_at) : undefined,
      budget_max: key.budget_max != null ? Number(key.budget_max) : undefined,
      budget_consumed: key.budget_consumed != null ? Number(key.budget_consumed) : undefined,
      litellm_blocked: litellm?.blocked,
      litellm_spend: litellm?.spend,
      litellm_max_budget: litellm?.max_budget,
      litellm_last_active: litellm?.last_active,
      gateway_requests: hasLocalRequests ? localTotals!.requests : undefined,
      gateway_cost: hasLocalRequests ? localTotals!.cost : undefined,
      gateway_tokens_input: hasLocalRequests ? localTotals!.tokens_input : undefined,
      gateway_tokens_output: hasLocalRequests ? localTotals!.tokens_output : undefined,
      tokens_input,
      tokens_output,
      tokens_source,
      gateway_avg_latency_ms:
        hasLocalRequests && localTotals!.avg_latency_ms > 0
          ? localTotals!.avg_latency_ms
          : undefined,
      gateway_error_count:
        hasLocalRequests && localTotals!.error_count > 0 ? localTotals!.error_count : undefined,
    });

    const payload = {
      key: apiKeyService.publicKeyFields(key),
      overview,
      litellm: litellm || undefined,
      sources: {
        local: true,
        litellm: Boolean(litellm),
      },
    };

    await cacheSet(cacheKey, payload);
    return payload;
  },

  async usage(organizationId: string, keyId: string, days = 14) {
    const key = await apiKeyService.getById(organizationId, keyId);
    if (!key) return null;

    const snapKey = `nexusia:key-usage:${keyId}:${days}`;
    const cached = await cacheGet<any>(snapKey);
    if (cached) return cached;

    const { startDate, endDate } = dateRange(days);
    let series: Array<Record<string, unknown>> = [];
    let source: 'litellm' | 'gateway' | null = null;

    if (key.litellm_user_id && key.litellm_key_id) {
      const daily = await litellmAdmin.userDailyActivity({
        userId: key.litellm_user_id,
        startDate,
        endDate,
      });
      const results = Array.isArray((daily as any)?.results) ? (daily as any).results : [];
      const token = key.litellm_key_id;
      for (const day of results) {
        const breakdownKeys = day?.breakdown?.api_keys || {};
        // Prefer per-key bucket when present; else use day metrics only if single-key user days are empty for this token
        let metrics = null as any;
        for (const [hash, bucket] of Object.entries(breakdownKeys)) {
          if (
            hash === token ||
            hash.startsWith(token.slice(0, 16)) ||
            token.startsWith(hash.slice(0, 16))
          ) {
            const b = bucket as any;
            metrics = b?.metrics && typeof b.metrics === 'object' ? b.metrics : b;
            break;
          }
        }
        if (!metrics && Object.keys(breakdownKeys).length === 0 && day?.metrics) {
          // User-level day without api_keys breakdown — skip to avoid attributing other keys' spend
          continue;
        }
        if (!metrics) continue;
        const point = defined({
          day: String(day.date).slice(0, 10),
          spend: metrics.spend != null ? Number(metrics.spend) : undefined,
          prompt_tokens: metrics.prompt_tokens != null ? Number(metrics.prompt_tokens) : undefined,
          completion_tokens:
            metrics.completion_tokens != null ? Number(metrics.completion_tokens) : undefined,
          total_tokens: metrics.total_tokens != null ? Number(metrics.total_tokens) : undefined,
          api_requests: metrics.api_requests != null ? Number(metrics.api_requests) : undefined,
          successful_requests:
            metrics.successful_requests != null ? Number(metrics.successful_requests) : undefined,
          failed_requests:
            metrics.failed_requests != null ? Number(metrics.failed_requests) : undefined,
        });
        if (Object.keys(point).length > 1) series.push(point);
      }
      if (series.length) source = 'litellm';
    }

    if (!series.length) {
      const local = await apiKeyService.metrics(organizationId, keyId);
      series = (local?.series || [])
        .map((r) =>
          defined({
            day: String(r.day).slice(0, 10),
            api_requests: r.requests > 0 ? r.requests : undefined,
            spend: r.cost > 0 ? r.cost : undefined,
            total_tokens: r.tokens > 0 ? r.tokens : undefined,
          }),
        )
        .filter((p) => Object.keys(p).length > 1);
      if (series.length) source = 'gateway';
    }

    const payload = series.length ? { series, source, days } : { series: [], source: null, days };
    await cacheSet(snapKey, payload, SNAPSHOT_TTL_SEC);
    return payload;
  },

  async models(organizationId: string, keyId: string) {
    const key = await apiKeyService.getById(organizationId, keyId);
    if (!key) return null;

    const litellmRow = await litellmAdmin.resolveKeyRecord({
      litellmUserId: key.litellm_user_id,
      litellmKeyId: key.litellm_key_id,
    });
    const modelSpend = (litellmRow?.model_spend || {}) as Record<string, number>;
    const fromSpend = Object.entries(modelSpend)
      .filter(([, v]) => Number(v) > 0)
      .map(([model, spend]) => ({ model, spend: Number(spend) }))
      .sort((a, b) => b.spend - a.spend);

    if (fromSpend.length) {
      return { items: fromSpend, source: 'litellm' as const };
    }

    // Aggregate from gateway logs
    const rows = await RequestLog.query()
      .where({ organization_id: organizationId, api_key_id: keyId })
      .whereNotNull('model_id')
      .select('model_id')
      .count('* as requests')
      .sum('cost as cost')
      .groupBy('model_id')
      .orderByRaw('count(*) desc')
      .limit(50);

    const items = (rows as any[])
      .map((r) =>
        defined({
          model: r.model_id != null ? String(r.model_id) : undefined,
          requests: Number(r.requests || 0) || undefined,
          spend: Number(r.cost || 0) || undefined,
        }),
      )
      .filter((x) => x.model);

    return items.length ? { items, source: 'gateway' as const } : { items: [], source: null };
  },

  async providers(organizationId: string, keyId: string) {
    const key = await apiKeyService.getById(organizationId, keyId);
    if (!key) return null;

    // Prefer spend logs (key-scoped). Day-level providers are user-wide — only use when
    // api_keys breakdown confirms this token on that day AND we have no logs.
    if (key.litellm_key_id) {
      const raw = await litellmAdmin.spendLogsByToken(key.litellm_key_id, { limit: 200 });
      if (raw?.length) {
        const agg = new Map<string, { spend: number; api_requests: number }>();
        for (const log of raw) {
          const name = log.custom_llm_provider != null ? String(log.custom_llm_provider) : '';
          if (!name) continue;
          const cur = agg.get(name) || { spend: 0, api_requests: 0 };
          cur.spend += Number(log.spend || 0);
          cur.api_requests += 1;
          agg.set(name, cur);
        }
        const items = Array.from(agg.entries())
          .map(([provider, m]) =>
            defined({
              provider,
              spend: m.spend > 0 ? m.spend : undefined,
              api_requests: m.api_requests > 0 ? m.api_requests : undefined,
            }),
          )
          .filter((x) => x.provider && (x.spend != null || x.api_requests != null));
        if (items.length) return { items, source: 'litellm' as const };
      }
    }

    return { items: [], source: null };
  },

  async logs(
    organizationId: string,
    keyId: string,
    opts: {
      source?: 'litellm' | 'gateway' | 'auto';
      page?: number;
      limit?: number;
      status?: string;
      model?: string;
    },
  ) {
    const key = await apiKeyService.getById(organizationId, keyId);
    if (!key) return null;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 50));
    const sourcePref = opts.source || 'auto';

    if (sourcePref === 'gateway' || (sourcePref === 'auto' && !key.litellm_key_id)) {
      const local = await apiKeyService.logs(organizationId, keyId, {
        page,
        limit,
        status: opts.status,
      });
      if (!local) return null;
      let items = local.items.map(normalizeGatewayLog);
      if (opts.model) {
        items = items.filter((i) => i.model === opts.model);
      }
      return {
        items,
        pagination: local.pagination,
        source: 'gateway' as const,
      };
    }

    if (key.litellm_key_id) {
      const raw = await litellmAdmin.spendLogsByToken(key.litellm_key_id, {
        limit: 200,
        model: opts.model,
        status: opts.status,
      });
      if (raw && raw.length) {
        let items = raw.map((l) => ({ ...normalizeSpendLog(l), source: 'litellm' as const }));
        if (opts.status) {
          items = items.filter((i) => i.status === opts.status);
        }
        if (opts.model) {
          items = items.filter((i) => i.model === opts.model);
        }
        const total = items.length;
        const offset = (page - 1) * limit;
        const pageItems = items.slice(offset, offset + limit);
        return {
          items: pageItems,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
          },
          source: 'litellm' as const,
        };
      }
    }

    // Fallback gateway
    if (sourcePref === 'auto') {
      const local = await apiKeyService.logs(organizationId, keyId, {
        page,
        limit,
        status: opts.status,
      });
      if (!local) return null;
      return {
        items: local.items.map(normalizeGatewayLog),
        pagination: local.pagination,
        source: 'gateway' as const,
      };
    }

    return { items: [], pagination: { page, limit, total: 0, pages: 1 }, source: null };
  },

  async errors(organizationId: string, keyId: string) {
    const logs = await this.logs(organizationId, keyId, {
      source: 'auto',
      page: 1,
      limit: 100,
    });
    if (!logs) return null;

    const items = logs.items.filter(
      (i) => i.status && i.status !== 'success' && i.status !== 'redacted',
    );
    if (!items.length) {
      return { items: [], total: 0, source: logs.source };
    }

    const byModel = new Map<string, number>();
    const byProvider = new Map<string, number>();
    for (const i of items) {
      if (i.model) byModel.set(i.model, (byModel.get(i.model) || 0) + 1);
      if (i.provider) byProvider.set(i.provider, (byProvider.get(i.provider) || 0) + 1);
    }

    return {
      total: items.length,
      items,
      by_model: Array.from(byModel, ([model, count]) => ({ model, count })),
      by_provider: Array.from(byProvider, ([provider, count]) => ({ provider, count })),
      source: logs.source,
    };
  },

  /** BullMQ: warm Redis snapshots for active keys */
  async syncSnapshots(limit = 50) {
    const keys = await ApiKey.query()
      .where({ status: 'active' })
      .whereNotNull('litellm_user_id')
      .orderBy('updated_at', 'desc')
      .limit(limit);

    let synced = 0;
    for (const key of keys) {
      try {
        await this.analytics(key.organization_id, key.id);
        await this.usage(key.organization_id, key.id, 14);
        synced += 1;
      } catch (err) {
        logger.warn('key analytics snapshot failed', { id: key.id, err });
      }
    }
    return { synced };
  },
};
