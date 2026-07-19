/* eslint-disable */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const base = (process.env.LITELLM_BASE_URL || process.env.LITELLM_URL || '').replace(/\/$/, '');
  const master = process.env.LITELLM_API_KEY || process.env.LITELLM_MASTER_KEY || '';
  if (!base || !master) {
    console.log('NO_CONFIG');
    process.exit(1);
  }
  const { knex } = require('../src/config/database');
  const key = await knex('api_keys').whereNotNull('litellm_key_id').orderBy('created_at', 'desc').first();
  if (!key) {
    console.log('NO_KEY');
    await knex.destroy();
    process.exit(1);
  }
  console.log(
    'sample',
    JSON.stringify({
      id: key.id,
      alias: key.litellm_key_id,
      user: key.litellm_user_id,
      prefix: key.key_prefix,
    }),
  );
  const h = { Authorization: 'Bearer ' + master, 'Content-Type': 'application/json' };
  const alias = key.litellm_key_id;
  const userId = key.litellm_user_id;

  async function tryFetch(label, url) {
    try {
      const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 200);
      }
      let sample;
      if (Array.isArray(body)) {
        sample = { len: body.length, firstKeys: body[0] ? Object.keys(body[0]) : [] };
      } else if (body && body.info) {
        sample = { top: Object.keys(body), infoKeys: Object.keys(body.info || {}) };
      } else if (body && body.results) {
        sample = {
          top: Object.keys(body),
          result0: body.results[0] ? Object.keys(body.results[0]) : [],
          metrics: body.results[0]?.metrics ? Object.keys(body.results[0].metrics) : [],
          breakdown: body.results[0]?.breakdown ? Object.keys(body.results[0].breakdown) : [],
        };
      } else if (body && body.keys) {
        sample = { top: Object.keys(body), key0: body.keys[0] ? Object.keys(body.keys[0]) : [] };
      } else if (body && typeof body === 'object' && body.error) {
        sample = { error: body.error };
      } else {
        sample = { top: body && typeof body === 'object' ? Object.keys(body) : [], preview: JSON.stringify(body).slice(0, 400) };
      }
      console.log(label, r.status, JSON.stringify(sample));
    } catch (e) {
      console.log(label, 'ERR', e.message);
    }
  }

  await tryFetch('key_info_alias', base + '/key/info?key_alias=' + encodeURIComponent(alias));
  await tryFetch('user_info', base + '/user/info?user_id=' + encodeURIComponent(userId));
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);
  const fmt = (d) => d.toISOString().slice(0, 10);
  await tryFetch(
    'user_daily',
    base +
      '/user/daily/activity?start_date=' +
      fmt(start) +
      '&end_date=' +
      fmt(end) +
      '&user_id=' +
      encodeURIComponent(userId),
  );
  await tryFetch(
    'spend_logs_alias',
    base + '/spend/logs?key_alias=' + encodeURIComponent(alias) + '&summarize=false',
  );
  await tryFetch('global_spend_logs', base + '/global/spend/logs?key_alias=' + encodeURIComponent(alias));
  await tryFetch('spend_logs_v2', base + '/spend/logs/v2?key_alias=' + encodeURIComponent(alias) + '&page=1&page_size=5');
  await knex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
