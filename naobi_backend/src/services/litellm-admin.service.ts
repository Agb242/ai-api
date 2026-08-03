import crypto from 'crypto';
import { config } from '../config/server';
import logger from '../config/logger';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.litellm.apiKey}`,
  };
}

function requireConfigured() {
  if (!config.litellm.apiKey || !config.litellm.baseUrl) {
    throw Object.assign(new Error('LITELLM_NOT_CONFIGURED'), {
      code: 'LITELLM_NOT_CONFIGURED',
    });
  }
}

function slugify(pseudo: string): string {
  return (
    pseudo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'user'
  );
}

export const litellmAdmin = {
  configured(): boolean {
    return Boolean(config.litellm.apiKey && config.litellm.baseUrl);
  },

  async assertHealthy() {
    requireConfigured();
    const ok = await this.health();
    if (!ok) {
      throw Object.assign(new Error('LITELLM_UNAVAILABLE'), {
        code: 'LITELLM_UNAVAILABLE',
      });
    }
  },

  async provisionUserAndKey(params: {
    pseudo: string;
    phone: string;
    externalRef: string;
    models: string[];
    maxBudget: number;
    duration: string;
    rpmLimit?: number;
    tpmLimit?: number;
    packId: string;
  }) {
    await this.assertHealthy();

    const userId = `${slugify(params.pseudo)}-${crypto.randomBytes(2).toString('hex')}`;
    const userEmail = `${slugify(params.pseudo)}@nexusai.local`;

    const userResp = await fetch(`${config.litellm.baseUrl}/user/new`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        user_id: userId,
        user_alias: params.pseudo,
        user_email: userEmail,
        models: params.models,
        max_budget: params.maxBudget,
        metadata: {
          pack_id: params.packId,
          phone: params.phone,
          external_ref: params.externalRef,
        },
      }),
    });
    if (!userResp.ok && userResp.status !== 409) {
      const errText = await userResp.text();
      throw new Error(`LiteLLM /user/new ${userResp.status}: ${errText}`);
    }

    const keyResp = await fetch(`${config.litellm.baseUrl}/key/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        user_id: userId,
        key_alias: `pack-${params.packId}-${params.externalRef}`.slice(0, 64),
        models: params.models,
        max_budget: params.maxBudget,
        duration: params.duration,
        rpm_limit: params.rpmLimit,
        tpm_limit: params.tpmLimit,
        metadata: {
          phone: params.phone,
          pack_id: params.packId,
          external_ref: params.externalRef,
        },
      }),
    });
    if (!keyResp.ok) {
      const errText = await keyResp.text();
      throw new Error(`LiteLLM /key/generate ${keyResp.status}: ${errText}`);
    }
    const data = (await keyResp.json()) as {
      key: string;
      expires?: string;
      token_id?: string;
      key_name?: string;
    };
    return {
      key: data.key,
      user_id: userId,
      user_alias: params.pseudo,
      expires: data.expires || null,
      litellm_key_id: data.token_id || data.key_name || null,
    };
  },

  async generateKey(params: {
    userId: string;
    keyAlias: string;
    models?: string[];
    maxBudget?: number | null;
    duration?: string;
    metadata?: Record<string, unknown>;
    teamId?: string | null;
    rpmLimit?: number | null;
    tpmLimit?: number | null;
  }) {
    await this.assertHealthy();
    const body: Record<string, unknown> = {
      user_id: params.userId,
      key_alias: params.keyAlias.slice(0, 64),
      models: params.models,
      max_budget: params.maxBudget ?? undefined,
      duration: params.duration || '365d',
      metadata: params.metadata || {},
    };
    if (params.teamId) body.team_id = params.teamId;
    if (params.rpmLimit != null) body.rpm_limit = params.rpmLimit;
    if (params.tpmLimit != null) body.tpm_limit = params.tpmLimit;

    const keyResp = await fetch(`${config.litellm.baseUrl}/key/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!keyResp.ok) {
      const errText = await keyResp.text();
      throw new Error(`LiteLLM /key/generate ${keyResp.status}: ${errText}`);
    }
    return (await keyResp.json()) as {
      key: string;
      expires?: string;
      token_id?: string;
      key_name?: string;
    };
  },

  async updateKey(params: {
    key: string;
    maxBudget?: number | null;
    rpmLimit?: number | null;
    tpmLimit?: number | null;
    models?: string[] | null;
    teamId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    requireConfigured();
    const body: Record<string, unknown> = { key: params.key };
    if (params.maxBudget !== undefined) body.max_budget = params.maxBudget;
    if (params.rpmLimit !== undefined) body.rpm_limit = params.rpmLimit;
    if (params.tpmLimit !== undefined) body.tpm_limit = params.tpmLimit;
    if (params.models !== undefined) body.models = params.models;
    if (params.teamId) body.team_id = params.teamId;
    if (params.metadata) body.metadata = params.metadata;

    const resp = await fetch(`${config.litellm.baseUrl}/key/update`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /key/update ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async regenerateKey(rawKey: string): Promise<{ key: string; token_id?: string; key_name?: string } | null> {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/key/regenerate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ key: rawKey }),
    });
    if (!resp.ok) {
      logger.warn('LiteLLM key/regenerate failed', { status: resp.status });
      return null;
    }
    return (await resp.json()) as { key: string; token_id?: string; key_name?: string };
  },

  async resetKeySpend(rawKey: string): Promise<boolean> {
    requireConfigured();
    const encoded = encodeURIComponent(rawKey);
    let resp = await fetch(`${config.litellm.baseUrl}/key/${encoded}/reset_spend`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    if (resp.ok) return true;
    resp = await fetch(`${config.litellm.baseUrl}/key/update`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ key: rawKey, spend: 0 }),
    });
    return resp.ok;
  },

  async teamNew(params: {
    teamAlias: string;
    teamId?: string;
    maxBudget?: number | null;
    models?: string[];
    metadata?: Record<string, unknown>;
  }) {
    await this.assertHealthy();
    const resp = await fetch(`${config.litellm.baseUrl}/team/new`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        team_alias: params.teamAlias,
        team_id: params.teamId || params.teamAlias,
        max_budget: params.maxBudget ?? undefined,
        models: params.models,
        metadata: params.metadata || {},
      }),
    });
    if (!resp.ok && resp.status !== 409) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /team/new ${resp.status}: ${errText}`);
    }
    if (resp.status === 409) {
      return { team_id: params.teamId || params.teamAlias };
    }
    const data = (await resp.json()) as { team_id?: string; team_alias?: string };
    return { team_id: data.team_id || params.teamId || params.teamAlias, ...data };
  },

  async teamInfo(teamId: string) {
    requireConfigured();
    const resp = await fetch(
      `${config.litellm.baseUrl}/team/info?team_id=${encodeURIComponent(teamId)}`,
      { headers: headers() },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /team/info ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async teamUpdate(params: {
    teamId: string;
    maxBudget?: number | null;
    models?: string[];
    metadata?: Record<string, unknown>;
  }) {
    requireConfigured();
    const body: Record<string, unknown> = { team_id: params.teamId };
    if (params.maxBudget !== undefined) body.max_budget = params.maxBudget;
    if (params.models) body.models = params.models;
    if (params.metadata) body.metadata = params.metadata;
    const resp = await fetch(`${config.litellm.baseUrl}/team/update`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /team/update ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async teamMemberAdd(params: {
    teamId: string;
    userId: string;
    role?: 'admin' | 'user';
  }) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/team/member_add`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        team_id: params.teamId,
        member: {
          user_id: params.userId,
          role: params.role || 'user',
        },
      }),
    });
    if (!resp.ok && resp.status !== 409) {
      const errText = await resp.text();
      logger.warn('LiteLLM team/member_add failed', { status: resp.status, err: errText });
      return false;
    }
    return true;
  },

  async teamMemberDelete(params: { teamId: string; userId: string }) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/team/member_delete`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        team_id: params.teamId,
        user_id: params.userId,
      }),
    });
    return resp.ok || resp.status === 404;
  },

  async teamDailyActivity(params: {
    teamId: string;
    startDate: string;
    endDate: string;
  }): Promise<Record<string, unknown> | null> {
    if (!this.configured() || !params.teamId) return null;
    try {
      const q = new URLSearchParams({
        team_id: params.teamId,
        start_date: params.startDate,
        end_date: params.endDate,
      });
      const resp = await fetch(`${config.litellm.baseUrl}/team/daily/activity?${q}`, {
        headers: headers(),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return null;
      return (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      logger.warn('LiteLLM teamDailyActivity failed', { err });
      return null;
    }
  },

  async spendTags(opts?: {
    startDate?: string;
    endDate?: string;
  }): Promise<any[] | null> {
    if (!this.configured()) return null;
    try {
      const q = new URLSearchParams();
      if (opts?.startDate) q.set('start_date', opts.startDate);
      if (opts?.endDate) q.set('end_date', opts.endDate);
      const qs = q.toString();
      const resp = await fetch(
        `${config.litellm.baseUrl}/spend/tags${qs ? `?${qs}` : ''}`,
        { headers: headers(), signal: AbortSignal.timeout(20000) },
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      return null;
    } catch (err) {
      logger.warn('LiteLLM spendTags failed', { err });
      return null;
    }
  },

  async budgetNew(params: {
    maxBudget: number;
    budgetDuration?: string;
    budgetId?: string;
  }) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/budget/new`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        max_budget: params.maxBudget,
        budget_duration: params.budgetDuration || '30d',
        budget_id: params.budgetId,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /budget/new ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async budgetUpdate(params: { budgetId: string; maxBudget: number }) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/budget/update`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        budget_id: params.budgetId,
        max_budget: params.maxBudget,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /budget/update ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async ensureUser(params: { userId: string; userAlias: string; userEmail: string }) {
    await this.assertHealthy();
    const userResp = await fetch(`${config.litellm.baseUrl}/user/new`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        user_id: params.userId,
        user_alias: params.userAlias,
        user_email: params.userEmail,
      }),
    });
    if (!userResp.ok && userResp.status !== 409) {
      const errText = await userResp.text();
      throw new Error(`LiteLLM /user/new ${userResp.status}: ${errText}`);
    }
  },

  async keyInfo(rawKey: string) {
    requireConfigured();
    const resp = await fetch(
      `${config.litellm.baseUrl}/key/info?key=${encodeURIComponent(rawKey)}`,
      { headers: headers() },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /key/info ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async keyInfoByToken(tokenId: string) {
    requireConfigured();
    const resp = await fetch(
      `${config.litellm.baseUrl}/key/info?key_alias=${encodeURIComponent(tokenId)}`,
      { headers: headers() },
    );
    if (!resp.ok) {
      // fallback: some LiteLLM versions use key= hash or list
      const list = await fetch(`${config.litellm.baseUrl}/key/info`, {
        method: 'GET',
        headers: headers(),
      });
      if (!list.ok) {
        const errText = await resp.text();
        throw new Error(`LiteLLM /key/info ${resp.status}: ${errText}`);
      }
      return list.json();
    }
    return resp.json();
  },

  async userInfo(userId: string) {
    requireConfigured();
    const resp = await fetch(
      `${config.litellm.baseUrl}/user/info?user_id=${encodeURIComponent(userId)}`,
      { headers: headers() },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM /user/info ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  /**
   * Resolve virtual-key row from /user/info by matching token hash (== api_keys.litellm_key_id).
   * Soft-fail: returns null when not found / proxy down.
   */
  async resolveKeyRecord(params: {
    litellmUserId?: string | null;
    litellmKeyId?: string | null;
  }): Promise<Record<string, unknown> | null> {
    if (!this.configured() || !params.litellmUserId || !params.litellmKeyId) return null;
    try {
      const info = (await this.userInfo(params.litellmUserId)) as {
        keys?: Array<Record<string, unknown>>;
      };
      const keys = Array.isArray(info.keys) ? info.keys : [];
      const match = keys.find((k) => String(k.token || '') === params.litellmKeyId);
      if (!match) return null;

      // Enrich via /key/info?key_alias= when alias exists (soft — keep user/info row on failure)
      const alias = match.key_alias != null ? String(match.key_alias) : '';
      if (alias) {
        const byAlias = await this.keyInfoByAlias(alias);
        const infoPayload =
          byAlias && typeof byAlias === 'object' && (byAlias as any).info
            ? ((byAlias as any).info as Record<string, unknown>)
            : byAlias;
        if (infoPayload && typeof infoPayload === 'object') {
          return { ...match, ...infoPayload, key_alias: alias, token: match.token };
        }
      }
      return match;
    } catch (err) {
      logger.warn('LiteLLM resolveKeyRecord failed', { err });
      return null;
    }
  },

  /** Alias for plan naming — filters spend logs by key_alias when token hash unavailable. */
  async spendLogsByAlias(
    keyAlias: string,
    opts?: { limit?: number; startDate?: string; endDate?: string; model?: string; status?: string },
  ): Promise<any[] | null> {
    if (!this.configured() || !keyAlias) return null;
    try {
      const q = new URLSearchParams({
        key_alias: keyAlias,
        summarize: 'false',
      });
      if (opts?.limit) q.set('limit', String(opts.limit));
      if (opts?.startDate) q.set('start_date', opts.startDate);
      if (opts?.endDate) q.set('end_date', opts.endDate);
      if (opts?.model) q.set('model', opts.model);
      if (opts?.status) q.set('status_filter', opts.status);

      const resp = await fetch(`${config.litellm.baseUrl}/spend/logs?${q}`, {
        headers: headers(),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      return null;
    } catch (err) {
      logger.warn('LiteLLM spendLogsByAlias failed', { err });
      return null;
    }
  },

  async keyInfoByAlias(keyAlias: string): Promise<Record<string, unknown> | null> {
    if (!this.configured() || !keyAlias) return null;
    try {
      const resp = await fetch(
        `${config.litellm.baseUrl}/key/info?key_alias=${encodeURIComponent(keyAlias)}`,
        { headers: headers(), signal: AbortSignal.timeout(10000) },
      );
      if (!resp.ok) return null;
      return (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      logger.warn('LiteLLM keyInfoByAlias failed', { err });
      return null;
    }
  },

  async userDailyActivity(params: {
    userId: string;
    startDate: string;
    endDate: string;
  }): Promise<Record<string, unknown> | null> {
    if (!this.configured() || !params.userId) return null;
    try {
      const q = new URLSearchParams({
        user_id: params.userId,
        start_date: params.startDate,
        end_date: params.endDate,
      });
      const resp = await fetch(`${config.litellm.baseUrl}/user/daily/activity?${q}`, {
        headers: headers(),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return null;
      return (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      logger.warn('LiteLLM userDailyActivity failed', { err });
      return null;
    }
  },

  /**
   * Transaction logs for a virtual key. Prefer api_key=token hash (litellm_key_id).
   */
  async spendLogsByToken(
    tokenHash: string,
    opts?: { limit?: number; startDate?: string; endDate?: string; model?: string; status?: string },
  ): Promise<any[] | null> {
    if (!this.configured() || !tokenHash) return null;
    try {
      const q = new URLSearchParams({
        api_key: tokenHash,
        summarize: 'false',
      });
      if (opts?.limit) q.set('limit', String(opts.limit));
      if (opts?.startDate) q.set('start_date', opts.startDate);
      if (opts?.endDate) q.set('end_date', opts.endDate);
      if (opts?.model) q.set('model', opts.model);
      if (opts?.status) q.set('status_filter', opts.status);

      let resp = await fetch(`${config.litellm.baseUrl}/spend/logs?${q}`, {
        headers: headers(),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        resp = await fetch(
          `${config.litellm.baseUrl}/global/spend/logs?api_key=${encodeURIComponent(tokenHash)}`,
          { headers: headers(), signal: AbortSignal.timeout(20000) },
        );
      }
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      return null;
    } catch (err) {
      logger.warn('LiteLLM spendLogsByToken failed', { err });
      return null;
    }
  },

  async spendLogs(rawKey: string, limit = 50) {
    requireConfigured();
    let resp = await fetch(
      `${config.litellm.baseUrl}/global/spend/logs?api_key=${encodeURIComponent(rawKey)}&limit=${limit}`,
      { headers: headers() },
    );
    if (!resp.ok) {
      resp = await fetch(`${config.litellm.baseUrl}/global/spend/logs`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ api_key: rawKey, limit }),
      });
    }
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM spend/logs ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async spendDaily(rawKey: string, days = 7) {
    requireConfigured();
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const dayMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dayMap.set(fmt(d), 0);
    }

    const resp = await fetch(`${config.litellm.baseUrl}/global/spend/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        api_key: rawKey,
        start_date: fmt(start),
        end_date: fmt(today),
        group_by: 'day',
      }),
    });
    if (resp.ok) {
      const reportData = (await resp.json()) as any[];
      if (Array.isArray(reportData)) {
        reportData.forEach((row) => {
          const dayKey = String(row.day || row.date || row.startTime || '').slice(0, 10);
          if (dayMap.has(dayKey)) {
            dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (row.spend || row.total_spend || 0));
          }
        });
        return {
          points: Array.from(dayMap, ([date, spend]) => ({ date, spend })),
          source: 'report' as const,
        };
      }
    }

    const logs = await this.spendLogs(rawKey, 100);
    const arr = Array.isArray(logs) ? logs : (logs as any).data || [];
    arr.forEach((log: any) => {
      const ts = log.startTime || log.timestamp;
      if (!ts) return;
      const dayKey = String(ts).slice(0, 10);
      if (dayMap.has(dayKey)) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (log.spend || 0));
      }
    });
    const source = Array.from(dayMap.values()).some((v) => v > 0) ? 'logs' : 'empty';
    return { points: Array.from(dayMap, ([date, spend]) => ({ date, spend })), source };
  },

  async listModels() {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/v1/models`, {
      headers: headers(),
    });
    if (!resp.ok) throw new Error(`LiteLLM /v1/models ${resp.status}`);
    return resp.json();
  },

  async health(): Promise<boolean> {
    if (!this.configured()) return false;
    const paths = [
      config.litellm.healthPath,
      '/health/liveliness',
      '/health/readiness',
      '/health',
    ];
    const unique = [...new Set(paths.filter(Boolean))];
    for (const p of unique) {
      try {
        // Liveliness is often unauthenticated; try both
        let resp = await fetch(`${config.litellm.baseUrl}${p}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) return true;
        resp = await fetch(`${config.litellm.baseUrl}${p}`, {
          headers: headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) return true;
      } catch {
        /* try next path */
      }
    }
    return false;
  },

  async deleteKey(rawKey: string) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/key/delete`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ keys: [rawKey] }),
    });
    return resp.ok;
  },

  async deleteKeysByAlias(aliases: string[]) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/key/delete`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ key_aliases: aliases }),
    });
    return resp.ok;
  },

  async blockKey(rawKey: string) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/key/block`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ key: rawKey }),
    });
    if (!resp.ok) {
      const alt = await fetch(`${config.litellm.baseUrl}/key/block`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ keys: [rawKey] }),
      });
      return alt.ok;
    }
    return true;
  },

  async unblockKey(rawKey: string) {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/key/unblock`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ key: rawKey }),
    });
    if (!resp.ok) {
      const alt = await fetch(`${config.litellm.baseUrl}/key/unblock`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ keys: [rawKey] }),
      });
      return alt.ok;
    }
    return true;
  },

  async listAudit(opts?: { startDate?: string; endDate?: string }): Promise<any[] | null> {
    if (!this.configured()) return null;
    try {
      const q = new URLSearchParams();
      if (opts?.startDate) q.set('start_date', opts.startDate);
      if (opts?.endDate) q.set('end_date', opts.endDate);
      const qs = q.toString();
      const resp = await fetch(`${config.litellm.baseUrl}/audit${qs ? `?${qs}` : ''}`, {
        headers: headers(),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      return null;
    } catch (err) {
      logger.warn('LiteLLM listAudit failed', { err });
      return null;
    }
  },

  async getCostMarginConfig(): Promise<unknown | null> {
    if (!this.configured()) return null;
    try {
      const resp = await fetch(`${config.litellm.baseUrl}/config/cost_margin_config`, {
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  },

  async setCostMarginConfig(body: unknown): Promise<unknown> {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/config/cost_margin_config`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM cost_margin_config ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async getCostDiscountConfig(): Promise<unknown | null> {
    if (!this.configured()) return null;
    try {
      const resp = await fetch(`${config.litellm.baseUrl}/config/cost_discount_config`, {
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  },

  async setCostDiscountConfig(body: unknown): Promise<unknown> {
    requireConfigured();
    const resp = await fetch(`${config.litellm.baseUrl}/config/cost_discount_config`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LiteLLM cost_discount_config ${resp.status}: ${errText}`);
    }
    return resp.json();
  },

  async listGuardrails(): Promise<any[] | null> {
    if (!this.configured()) return null;
    try {
      let resp = await fetch(`${config.litellm.baseUrl}/v2/guardrails/list`, {
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        resp = await fetch(`${config.litellm.baseUrl}/guardrails/list`, {
          headers: headers(),
          signal: AbortSignal.timeout(10000),
        });
      }
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray((data as any)?.guardrails)) return (data as any).guardrails;
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      return null;
    } catch {
      return null;
    }
  },

  async registerGuardrail(params: {
    guardrailName: string;
    litellmParams?: Record<string, unknown>;
  }): Promise<{ guardrail_id?: string; guardrail_name?: string } | null> {
    if (!this.configured()) return null;
    try {
      const resp = await fetch(`${config.litellm.baseUrl}/guardrails/register`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          guardrail_name: params.guardrailName,
          litellm_params: params.litellmParams || {
            guardrail: 'custom_code',
            mode: 'pre_call',
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        logger.warn('LiteLLM registerGuardrail failed', { status: resp.status });
        return null;
      }
      return (await resp.json()) as { guardrail_id?: string; guardrail_name?: string };
    } catch (err) {
      logger.warn('LiteLLM registerGuardrail error', { err });
      return null;
    }
  },

  async applyGuardrail(params: {
    guardrailName?: string;
    text: string;
  }): Promise<{ blocked: boolean; response?: unknown } | null> {
    if (!this.configured()) return null;
    try {
      const resp = await fetch(`${config.litellm.baseUrl}/guardrails/apply_guardrail`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          guardrail_name: params.guardrailName,
          texts: [params.text],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as any;
      const blocked =
        data?.blocked === true ||
        data?.action === 'BLOCKED' ||
        (Array.isArray(data?.responses) &&
          data.responses.some((r: any) => r?.blocked || r?.action === 'BLOCKED'));
      return { blocked: !!blocked, response: data };
    } catch {
      return null;
    }
  },

  async complianceCheck(kind: 'gdpr' | 'eu-ai-act'): Promise<unknown | null> {
    if (!this.configured()) return null;
    try {
      const path = kind === 'gdpr' ? '/compliance/gdpr' : '/compliance/eu-ai-act';
      const resp = await fetch(`${config.litellm.baseUrl}${path}`, {
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return { available: false, status: resp.status };
      return { available: true, data: await resp.json() };
    } catch {
      return { available: false };
    }
  },
};

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
