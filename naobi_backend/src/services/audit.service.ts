import { knex } from '../config/database';
import { litellmAdmin } from './litellm-admin.service';

export type AuditSource = 'all' | 'gateway' | 'filter' | 'litellm';

export type AuditEvent = {
  id: string;
  source: 'gateway' | 'filter' | 'litellm';
  at: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
};

export const auditService = {
  async list(
    organizationId: string,
    opts: { source?: AuditSource; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 50));
    const source = opts.source || 'all';
    const events: AuditEvent[] = [];

    if (source === 'all' || source === 'gateway') {
      const logs = await knex('request_logs')
        .where({ organization_id: organizationId })
        .orderBy('created_at', 'desc')
        .limit(200)
        .select('id', 'created_at', 'status', 'model_id', 'cost', 'filter_action', 'error_code', 'metadata');
      for (const row of logs as any[]) {
        events.push({
          id: `gw-${row.id}`,
          source: 'gateway',
          at: new Date(row.created_at).toISOString(),
          action: row.status,
          summary: `${row.model_id || 'n/a'} · ${row.status}${row.filter_action ? ` · ${row.filter_action}` : ''}`,
          meta: {
            cost: row.cost,
            error_code: row.error_code,
            end_user_id: row.metadata?.end_user_id,
            tags: row.metadata?.tags,
          },
        });
      }
    }

    if (source === 'all' || source === 'filter') {
      const audits = await knex('filter_audit_logs')
        .where({ organization_id: organizationId })
        .orderBy('created_at', 'desc')
        .limit(200)
        .select('id', 'created_at', 'action', 'rule_id', 'request_log_id');
      for (const row of audits as any[]) {
        events.push({
          id: `fl-${row.id}`,
          source: 'filter',
          at: new Date(row.created_at).toISOString(),
          action: row.action,
          summary: `filter ${row.action} · rule ${row.rule_id}`,
          meta: { rule_id: row.rule_id, request_log_id: row.request_log_id },
        });
      }
    }

    if (source === 'all' || source === 'litellm') {
      const ll = await litellmAdmin.auditList({ page: 1, pageSize: 50 });
      const arr = Array.isArray(ll)
        ? ll
        : Array.isArray((ll as any)?.data)
          ? (ll as any).data
          : Array.isArray((ll as any)?.audit_logs)
            ? (ll as any).audit_logs
            : [];
      for (const row of arr) {
        const at = row.updated_at || row.created_at || row.timestamp || new Date().toISOString();
        events.push({
          id: `ll-${row.id || row.audit_id || Math.random().toString(36).slice(2)}`,
          source: 'litellm',
          at: new Date(at).toISOString(),
          action: String(row.action || row.event || 'audit'),
          summary: String(row.table_name || row.object || row.message || 'litellm audit'),
          meta: row,
        });
      }
    }

    events.sort((a, b) => (a.at < b.at ? 1 : -1));
    const total = events.length;
    const offset = (page - 1) * limit;
    const items = events.slice(offset, offset + limit);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    };
  },

  toCsv(events: AuditEvent[]): string {
    const header = 'id,source,at,action,summary\n';
    const rows = events.map((e) => {
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      return [e.id, e.source, e.at, e.action, e.summary].map(esc).join(',');
    });
    return header + rows.join('\n');
  },
};
