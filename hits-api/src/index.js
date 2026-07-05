/* microsite-hits — privacy-friendly pageview counter for the microsite fleet.
   Beacon: POST /hit {h: host, p: path, r: referrer}  (fire-and-forget, 204)
   Stats:  GET /stats?host=blockmine.io&days=30
           GET /stats  (fleet summary, last 7 days)
   Storage: KV daily counters — key `d|<host>|<YYYY-MM-DD>` → count,
   plus `r|<host>|<YYYY-MM-DD>` → JSON {referrerDomain: count} (top sources). */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function refDomain(r) {
  try { return r ? new URL(r).hostname : 'direct'; } catch { return 'direct'; }
}

function isBot(ua) {
  return /bot|crawl|spider|slurp|bingpreview|lighthouse|headless/i.test(ua || '');
}

async function bump(env, key) {
  const cur = parseInt(await env.HITS.get(key), 10) || 0;
  await env.HITS.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  return cur + 1;
}

async function bumpRef(env, key, domain) {
  let obj = {};
  try { obj = JSON.parse(await env.HITS.get(key)) || {}; } catch { }
  obj[domain] = (obj[domain] || 0) + 1;
  await env.HITS.put(key, JSON.stringify(obj), { expirationTtl: 60 * 60 * 24 * 400 });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === '/hit' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { }
      const host = String(body.h || '').toLowerCase().slice(0, 100);
      if (!host || !/^[a-z0-9.-]+$/.test(host) || isBot(request.headers.get('User-Agent'))) {
        return new Response(null, { status: 204, headers: CORS });
      }
      const d = today();
      ctx.waitUntil(Promise.all([
        bump(env, `d|${host}|${d}`),
        bumpRef(env, `r|${host}|${d}`, refDomain(body.r)),
      ]));
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/stats') {
      const host = (url.searchParams.get('host') || '').toLowerCase();
      const days = Math.min(90, parseInt(url.searchParams.get('days'), 10) || 7);
      const dates = [];
      for (let i = 0; i < days; i++) {
        dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
      }
      if (host) {
        const counts = {};
        let total = 0;
        for (const d of dates) {
          const v = parseInt(await env.HITS.get(`d|${host}|${d}`), 10) || 0;
          if (v) counts[d] = v;
          total += v;
        }
        let referrers = {};
        try { referrers = JSON.parse(await env.HITS.get(`r|${host}|${today()}`)) || {}; } catch { }
        return new Response(JSON.stringify({ host, days, total, byDay: counts, todayReferrers: referrers }), {
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      // fleet summary: list today's + this week's keys
      const summary = {};
      for (const d of dates) {
        const list = await env.HITS.list({ prefix: `d|`, limit: 1000 });
        for (const k of list.keys) {
          const [, h, kd] = k.name.split('|');
          if (!dates.includes(kd)) continue;
          const v = parseInt(await env.HITS.get(k.name), 10) || 0;
          summary[h] = (summary[h] || 0) + v;
        }
        break; // single list call covers all keys (prefix scan)
      }
      return new Response(JSON.stringify({ days, byHost: summary }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify({ service: 'microsite-hits', usage: 'POST /hit {h,p,r} · GET /stats?host=&days=' }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};
