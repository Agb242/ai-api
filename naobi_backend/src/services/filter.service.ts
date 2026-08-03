import { FilterRule, FilterAction } from '../models/FilterRule';
import { knex } from '../config/database';
import { auditService } from './audit.service';

export interface FilterResult {
  action: 'pass' | 'block' | 'redact';
  rule?: FilterRule;
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
    const rule = await FilterRule.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      name: params.name,
      type: params.type,
      pattern: params.pattern,
      action: params.action,
      active: params.active ?? true,
    });
    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      action: 'filter.create',
      resourceType: 'filter_rule',
      resourceId: rule.id,
      metadata: { name: params.name },
    });
    return rule;
  },

  async update(
    organizationId: string,
    ruleId: string,
    patch: Partial<Pick<FilterRule, 'name' | 'type' | 'pattern' | 'action' | 'active'>>,
    actorUserId?: string | null,
  ) {
    const rule = await FilterRule.query().findOne({ id: ruleId, organization_id: organizationId });
    if (!rule) return null;
    const updated = await rule.$query().patchAndFetch(patch);
    await auditService.record({
      organizationId,
      actorUserId,
      action: 'filter.update',
      resourceType: 'filter_rule',
      resourceId: ruleId,
    });
    return updated;
  },

  async remove(organizationId: string, ruleId: string, actorUserId?: string | null) {
    const n = await FilterRule.query().delete().where({ id: ruleId, organization_id: organizationId });
    if (n) {
      await auditService.record({
        organizationId,
        actorUserId,
        action: 'filter.delete',
        resourceType: 'filter_rule',
        resourceId: ruleId,
      });
    }
    return n;
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
