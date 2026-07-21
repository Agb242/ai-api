import { FilterRule, FilterAction } from '../models/FilterRule';
import { Organization } from '../models/Organization';
import { knex } from '../config/database';
import { litellmAdmin } from './litellm-admin.service';
import logger from '../config/logger';

export interface FilterResult {
  action: 'pass' | 'block' | 'redact';
  rule?: { id: string; name: string };
  content: string;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const body = payload as { messages?: Array<{ content?: unknown }>; prompt?: string; input?: string };
  if (typeof body.prompt === 'string') return body.prompt;
  if (typeof body.input === 'string') return body.input;
  if (!Array.isArray(body.messages)) return JSON.stringify(payload);
  return body.messages
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join(' ');
      }
      return '';
    })
    .join('\n');
}

function applyRedaction(text: string, pattern: string, type: 'regex' | 'keyword'): string {
  if (type === 'keyword') {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }
  try {
    return text.replace(new RegExp(pattern, 'gi'), '[REDACTED]');
  } catch {
    return text;
  }
}

function matches(text: string, pattern: string, type: 'regex' | 'keyword'): boolean {
  if (type === 'keyword') {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return false;
  }
}

function redactPayload(payload: any, pattern: string, type: 'regex' | 'keyword'): any {
  const clone = JSON.parse(JSON.stringify(payload));
  if (typeof clone.prompt === 'string') {
    clone.prompt = applyRedaction(clone.prompt, pattern, type);
  }
  if (Array.isArray(clone.messages)) {
    clone.messages = clone.messages.map((m: any) => {
      if (typeof m.content === 'string') {
        return { ...m, content: applyRedaction(m.content, pattern, type) };
      }
      return m;
    });
  }
  return clone;
}

export const filterService = {
  async list(organizationId: string) {
    return FilterRule.query()
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc');
  },

  async create(params: {
    organizationId: string;
    userId: string;
    name: string;
    type: 'regex' | 'keyword';
    pattern: string;
    action: FilterAction;
    active?: boolean;
  }) {
    return FilterRule.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      name: params.name,
      type: params.type,
      pattern: params.pattern,
      action: params.action,
      active: params.active ?? true,
    });
  },

  async update(
    organizationId: string,
    ruleId: string,
    patch: Partial<Pick<FilterRule, 'name' | 'type' | 'pattern' | 'action' | 'active'>>,
  ) {
    const rule = await FilterRule.query().findOne({ id: ruleId, organization_id: organizationId });
    if (!rule) return null;
    return rule.$query().patchAndFetch(patch);
  },

  async remove(organizationId: string, ruleId: string) {
    return FilterRule.query().delete().where({ id: ruleId, organization_id: organizationId });
  },

  /** Test a rule against sample text without side effects. */
  test(sample: string, type: 'regex' | 'keyword', pattern: string, action: FilterAction) {
    const hit = matches(sample, pattern, type);
    if (!hit) return { matched: false, action: 'pass' as const, output: sample };
    if (action === 'block') return { matched: true, action: 'block' as const, output: sample };
    return {
      matched: true,
      action: 'redact' as const,
      output: applyRedaction(sample, pattern, type),
    };
  },

  /**
   * Evaluate all active rules before provider call (RG-13).
   * Block rules short-circuit; redact rules mutate the payload.
   */
  async evaluate(organizationId: string, payload: any): Promise<{
    result: FilterResult;
    payload: any;
  }> {
    const rules = await FilterRule.query().where({
      organization_id: organizationId,
      active: true,
    });

    let current = payload;
    let text = extractText(current);
    let lastRedactRule: FilterRule | undefined;

    for (const rule of rules) {
      if (!matches(text, rule.pattern, rule.type)) continue;

      if (rule.action === 'block') {
        return {
          result: { action: 'block', rule, content: text },
          payload: current,
        };
      }

      current = redactPayload(current, rule.pattern, rule.type);
      text = extractText(current);
      lastRedactRule = rule;
    }

    if (lastRedactRule) {
      return {
        result: { action: 'redact', rule: lastRedactRule, content: text },
        payload: current,
      };
    }

    return { result: { action: 'pass', content: text }, payload: current };
  },

  /**
   * Local filters first, then optional LiteLLM guardrails bound on the org.
   */
  async evaluateWithGuardrails(
    organization: Organization,
    payload: any,
  ): Promise<{ result: FilterResult; payload: any }> {
    const local = await this.evaluate(organization.id, payload);
    if (local.result.action === 'block') return local;

    const ids = Array.isArray(organization.litellm_guardrail_ids)
      ? (organization.litellm_guardrail_ids as string[])
      : [];
    if (!ids.length || !litellmAdmin.configured()) return local;

    const text =
      local.result.content ||
      (typeof payload?.input === 'string' ? payload.input : JSON.stringify(payload));

    for (const gid of ids) {
      try {
        const applied = await litellmAdmin.applyGuardrail({
          guardrailName: gid,
          texts: [text],
          requestData: { model: payload?.model },
        });
        if (applied?.blocked) {
          return {
            result: {
              action: 'block',
              rule: { id: `guardrail:${gid}`, name: `guardrail:${gid}` },
              content: text,
            },
            payload: local.payload,
          };
        }
      } catch (err) {
        logger.warn('Guardrail apply skipped', { gid, err });
      }
    }

    return local;
  },

  async listAudits(organizationId: string, opts?: { page?: number; limit?: number }) {
    const page = Math.max(1, opts?.page || 1);
    const limit = Math.min(100, Math.max(1, opts?.limit || 50));
    const offset = (page - 1) * limit;
    const q = knex('filter_audit_logs').where({ organization_id: organizationId });
    const countRow = (await q.clone().count('* as count').first()) as any;
    const total = Number(countRow?.count || 0);
    const items = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);
    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    };
  },

  async blockStats(organizationId: string, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const series = await knex('request_logs')
      .where({ organization_id: organizationId, status: 'blocked' })
      .where('created_at', '>=', since.toISOString())
      .select(
        knex.raw("date_trunc('day', created_at)::date as day"),
        knex.raw('count(*)::int as blocks'),
      )
      .groupByRaw("date_trunc('day', created_at)::date")
      .orderByRaw('day asc');

    const auditCount = await knex('filter_audit_logs')
      .where({ organization_id: organizationId, action: 'block' })
      .where('created_at', '>=', since.toISOString())
      .count('* as count')
      .first();

    return {
      days,
      series: (series as any[]).map((r) => ({ day: r.day, blocks: Number(r.blocks || 0) })),
      total_blocks: Number((auditCount as any)?.count || 0),
    };
  },

  async audit(params: {
    organizationId: string;
    ruleId: string;
    action: string;
    requestLogId?: string;
  }) {
    await knex('filter_audit_logs').insert({
      organization_id: params.organizationId,
      rule_id: params.ruleId,
      action: params.action,
      request_log_id: params.requestLogId || null,
    });
  },
};
