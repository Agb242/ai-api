import { AuditEvent } from '../models/AuditEvent';
import { knex } from '../config/database';
import { litellmAdmin } from './litellm-admin.service';
import { config } from '../config/server';
import logger from '../config/logger';

export type AuditRow = {
  id: string;
  timestamp: string;
  source: 'product' | 'filter' | 'gateway' | 'litellm';
  action: string;
  actor: string | null;
  resource: string;
  detail: string;
};

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export const auditService = {
  retentionDays(): number {
    return parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10) || 90;
  },

  async record(params: {
    organizationId: string;
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await AuditEvent.query().insert({
        organization_id: params.organizationId,
        actor_user_id: params.actorUserId || null,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        metadata: params.metadata || {},
      } as any);
    } catch (err) {
      logger.warn('audit record failed', { err, action: params.action });
    }
  },

  async list(
    organizationId: string,
    opts?: { from?: string; to?: string; page?: number; limit?: number },
  ): Promise<{ items: AuditRow[]; pagination: { page: number; limit: number; total: number } }> {
    const page = Math.max(1, opts?.page || 1);
    const limit = Math.min(100, Math.max(1, opts?.limit || 50));
    const from = opts?.from ? new Date(opts.from) : new Date(Date.now() - 30 * 86400000);
    const to = opts?.to ? new Date(opts.to) : new Date();

    const rows: AuditRow[] = [];

    const events = await AuditEvent.query()
      .where({ organization_id: organizationId })
      .where('created_at', '>=', from.toISOString())
      .where('created_at', '<=', to.toISOString())
      .withGraphFetched('actor')
      .orderBy('created_at', 'desc')
      .limit(200);

    for (const e of events) {
      rows.push({
        id: e.id,
        timestamp: String(e.created_at),
        source: 'product',
        action: e.action,
        actor: (e as any).actor?.email || e.actor_user_id || null,
        resource: `${e.resource_type}:${e.resource_id || ''}`,
        detail: JSON.stringify(e.metadata || {}),
      });
    }

    const filterLogs = await knex('filter_audit_logs')
      .where({ organization_id: organizationId })
      .where('created_at', '>=', from.toISOString())
      .where('created_at', '<=', to.toISOString())
      .orderBy('created_at', 'desc')
      .limit(200);

    for (const f of filterLogs as any[]) {
      rows.push({
        id: String(f.id),
        timestamp: String(f.created_at),
        source: 'filter',
        action: String(f.action || 'filter'),
        actor: null,
        resource: `filter_rule:${f.rule_id || ''}`,
        detail: f.request_log_id ? `request_log=${f.request_log_id}` : '',
      });
    }

    const gateway = await knex('request_logs')
      .where({ organization_id: organizationId })
      .whereIn('status', ['blocked', 'error', 'redacted'])
      .where('created_at', '>=', from.toISOString())
      .where('created_at', '<=', to.toISOString())
      .orderBy('created_at', 'desc')
      .limit(100);

    for (const g of gateway as any[]) {
      rows.push({
        id: String(g.id),
        timestamp: String(g.created_at),
        source: 'gateway',
        action: String(g.status),
        actor: null,
        resource: `request:${g.id}`,
        detail: [g.model_id, g.error_code, g.filter_action].filter(Boolean).join(' '),
      });
    }

    try {
      const remote = await litellmAdmin.listAudit({
        startDate: from.toISOString().slice(0, 10),
        endDate: to.toISOString().slice(0, 10),
      });
      for (const a of remote || []) {
        rows.push({
          id: `ll-${a.id || a.event_id || Math.random().toString(36).slice(2)}`,
          timestamp: String(a.created_at || a.timestamp || new Date().toISOString()),
          source: 'litellm',
          action: String(a.action || a.event || 'audit'),
          actor: a.user || a.actor || null,
          resource: String(a.resource || a.object || 'litellm'),
          detail: typeof a === 'object' ? JSON.stringify(a).slice(0, 500) : '',
        });
      }
    } catch {
      /* soft-fail */
    }

    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const total = rows.length;
    const offset = (page - 1) * limit;
    return {
      items: rows.slice(offset, offset + limit),
      pagination: { page, limit, total },
    };
  },

  async exportCsv(organizationId: string, opts?: { from?: string; to?: string }): Promise<string> {
    const { items } = await this.list(organizationId, {
      ...opts,
      page: 1,
      limit: 5000,
    });
    const header = 'timestamp,source,action,actor,resource,detail';
    const lines = items.map((r) =>
      [
        csvEscape(r.timestamp),
        csvEscape(r.source),
        csvEscape(r.action),
        csvEscape(r.actor || ''),
        csvEscape(r.resource),
        csvEscape(r.detail),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  },

  async purgeExpired() {
    const days = this.retentionDays();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const n = await AuditEvent.query().where('created_at', '<', cutoff).delete();
    return { deleted: n, cutoff, days };
  },
};

// silence unused if config imported for future
void config;
