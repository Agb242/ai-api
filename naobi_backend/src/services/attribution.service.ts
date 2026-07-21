import { knex } from '../config/database';
import { litellmAdmin } from './litellm-admin.service';

export const attributionService = {
  async spendByTag(organizationId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await knex('request_logs')
      .where({ organization_id: organizationId })
      .where('created_at', '>=', since.toISOString())
      .whereRaw(`metadata ? 'tags'`)
      .select('metadata', 'cost', 'id');

    const map = new Map<string, { tag: string; requests: number; cost: number }>();
    for (const row of rows as any[]) {
      const tags = Array.isArray(row.metadata?.tags) ? row.metadata.tags : [];
      for (const tag of tags) {
        const key = String(tag);
        const cur = map.get(key) || { tag: key, requests: 0, cost: 0 };
        cur.requests += 1;
        cur.cost += Number(row.cost || 0);
        map.set(key, cur);
      }
    }

    const local = Array.from(map.values()).sort((a, b) => b.cost - a.cost);
    const litellm = (await litellmAdmin.spendTags()) || (await litellmAdmin.globalSpendTags());

    return { local, litellm, days };
  },

  async endUserActivity(organizationId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await knex('request_logs')
      .where({ organization_id: organizationId })
      .where('created_at', '>=', since.toISOString())
      .whereRaw(`metadata ? 'end_user_id'`)
      .select(
        knex.raw(`metadata->>'end_user_id' as end_user_id`),
        knex.raw('count(*)::int as requests'),
        knex.raw('coalesce(sum(cost),0)::float as cost'),
        knex.raw('max(created_at) as last_seen'),
      )
      .groupByRaw(`metadata->>'end_user_id'`)
      .orderByRaw('cost desc')
      .limit(100);

    return {
      items: (rows as any[]).map((r) => ({
        end_user_id: r.end_user_id,
        requests: Number(r.requests || 0),
        cost: Number(r.cost || 0),
        last_seen: r.last_seen,
      })),
      days,
    };
  },

  async listEndUsers(organizationId: string) {
    const local = await this.endUserActivity(organizationId, 90);
    const customers = await litellmAdmin.customerList();
    return { local: local.items, litellm_customers: customers };
  },

  async blockEndUser(userId: string) {
    return litellmAdmin.customerBlock(userId);
  },
};
