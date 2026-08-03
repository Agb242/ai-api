import { knex } from '../config/database';
import { Organization } from '../models/Organization';
import { litellmAdmin } from './litellm-admin.service';
import logger from '../config/logger';

export type OrgDailyMetrics = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  api_requests: number;
  source: 'litellm_team' | 'litellm_users' | null;
};

function sumDayMetrics(day: any): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  api_requests: number;
} {
  const m = day?.metrics && typeof day.metrics === 'object' ? day.metrics : day;
  return {
    prompt_tokens: Number(m?.prompt_tokens || m?.input_tokens || 0),
    completion_tokens: Number(m?.completion_tokens || m?.output_tokens || 0),
    total_tokens: Number(m?.total_tokens || 0),
    api_requests: Number(m?.api_requests || 0),
  };
}

function sumResultsForDate(
  results: any[],
  dateYmd: string,
): { prompt_tokens: number; completion_tokens: number; total_tokens: number; api_requests: number } {
  let prompt_tokens = 0;
  let completion_tokens = 0;
  let total_tokens = 0;
  let api_requests = 0;
  for (const day of results) {
    const d = String(day?.date || '').slice(0, 10);
    if (d !== dateYmd) continue;
    const s = sumDayMetrics(day);
    prompt_tokens += s.prompt_tokens;
    completion_tokens += s.completion_tokens;
    total_tokens += s.total_tokens || s.prompt_tokens + s.completion_tokens;
    api_requests += s.api_requests;
  }
  return { prompt_tokens, completion_tokens, total_tokens, api_requests };
}

/**
 * Org KPI from LiteLLM swagger fields (prompt/completion tokens).
 * Prefer team daily activity; else sum unique litellm users' daily activity for today.
 */
export async function fetchOrgLitellmTodayMetrics(
  organizationId: string,
): Promise<OrgDailyMetrics | null> {
  if (!litellmAdmin.configured()) return null;

  const today = new Date().toISOString().slice(0, 10);
  const org = await Organization.query().findById(organizationId);

  try {
    if (org?.litellm_team_id) {
      const team = await litellmAdmin.teamDailyActivity({
        teamId: org.litellm_team_id,
        startDate: today,
        endDate: today,
      });
      const results = Array.isArray((team as any)?.results) ? (team as any).results : [];
      if (results.length) {
        const s = sumResultsForDate(results, today);
        return {
          ...s,
          total_tokens: s.total_tokens || s.prompt_tokens + s.completion_tokens,
          source: 'litellm_team',
        };
      }
    }

    const keys = await knex('api_keys')
      .where({ organization_id: organizationId })
      .whereNotNull('litellm_user_id')
      .select('litellm_user_id', 'litellm_key_id');

    const userIds = [
      ...new Set(
        (keys as { litellm_user_id: string; litellm_key_id: string | null }[])
          .map((k) => k.litellm_user_id)
          .filter(Boolean),
      ),
    ];

    if (!userIds.length) return null;

    let prompt_tokens = 0;
    let completion_tokens = 0;
    let total_tokens = 0;
    let api_requests = 0;
    let any = false;

    const keyHashes = (keys as { litellm_key_id: string | null }[])
      .map((k) => k.litellm_key_id)
      .filter(Boolean) as string[];

    for (const userId of userIds) {
      const daily = await litellmAdmin.userDailyActivity({
        userId,
        startDate: today,
        endDate: today,
      });
      const results = Array.isArray((daily as any)?.results) ? (daily as any).results : [];
      for (const day of results) {
        if (String(day?.date || '').slice(0, 10) !== today) continue;
        const breakdown = day?.breakdown?.api_keys;
        if (breakdown && typeof breakdown === 'object' && Object.keys(breakdown).length) {
          for (const [hash, bucket] of Object.entries(breakdown)) {
            const match = keyHashes.some(
              (token) =>
                hash === token ||
                hash.startsWith(token.slice(0, 16)) ||
                token.startsWith(hash.slice(0, 16)),
            );
            if (!match) continue;
            const b = bucket as any;
            const m = b?.metrics && typeof b.metrics === 'object' ? b.metrics : b;
            prompt_tokens += Number(m?.prompt_tokens || m?.input_tokens || 0);
            completion_tokens += Number(m?.completion_tokens || m?.output_tokens || 0);
            total_tokens += Number(
              m?.total_tokens ||
                Number(m?.prompt_tokens || 0) + Number(m?.completion_tokens || 0),
            );
            api_requests += Number(m?.api_requests || 0);
            any = true;
          }
        } else if (day?.metrics) {
          const s = sumDayMetrics(day);
          prompt_tokens += s.prompt_tokens;
          completion_tokens += s.completion_tokens;
          total_tokens += s.total_tokens || s.prompt_tokens + s.completion_tokens;
          api_requests += s.api_requests;
          any = true;
        }
      }
    }

    if (!any) return null;
    return {
      prompt_tokens,
      completion_tokens,
      total_tokens: total_tokens || prompt_tokens + completion_tokens,
      api_requests,
      source: 'litellm_users',
    };
  } catch (err) {
    logger.warn('fetchOrgLitellmTodayMetrics failed', { organizationId, err });
    return null;
  }
}

/** Hide internal proxy tags (litellm branding / noisy UA wrappers). */
export function sanitizeSpendTags(tags: any[]): any[] {
  if (!Array.isArray(tags)) return [];
  const out: any[] = [];
  for (const row of tags) {
    const label = formatSpendTagLabel(row);
    if (!label) continue;
    if (/litellm/i.test(label)) continue;
    out.push({
      ...row,
      tag: label,
      name: label,
      spend: Number(row?.spend ?? row?.cost ?? 0),
    });
  }
  return out;
}

export function formatSpendTagLabel(row: any): string {
  const raw = row?.tag ?? row?.name ?? '';
  if (raw == null) return '';
  if (typeof raw === 'object') {
    const v =
      (raw as any).individual_request_tag ||
      (raw as any).tag ||
      (raw as any).name;
    if (typeof v === 'string') return v.trim();
    return JSON.stringify(raw).slice(0, 80);
  }
  const s = String(raw).trim();
  if (!s) return '';
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s);
      const v =
        parsed?.individual_request_tag || parsed?.tag || parsed?.name;
      if (typeof v === 'string') return v.trim();
    } catch {
      /* keep raw */
    }
  }
  return s;
}
