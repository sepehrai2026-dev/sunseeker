/* BARCADE API worker — CORS-friendly UPC lookup proxy.
   GET /lookup?upc=<digits> → { name, brand, qty, image, source } or { found: false } */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

async function lookupUpcItemDb(upc) {
  const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const item = data.items && data.items[0];
  if (!item || (!item.title && !item.brand)) return null;
  return {
    name: item.title || '',
    brand: item.brand || '',
    qty: '',
    image: (item.images && item.images[0]) || '',
    source: 'UPCitemdb',
  };
}

async function lookupOpenFacts(upc, host) {
  const resp = await fetch(`https://${host}/api/v2/product/${encodeURIComponent(upc)}.json?fields=product_name,brands,quantity,image_small_url`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  if (!p.product_name && !p.brands) return null;
  return {
    name: p.product_name || '',
    brand: p.brands || '',
    qty: p.quantity || '',
    image: p.image_small_url || '',
    source: host,
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname !== '/lookup') return json({ error: 'not found' }, 404);
    const upc = (url.searchParams.get('upc') || '').trim();
    if (!/^\d{6,14}$/.test(upc)) return json({ error: 'invalid upc' }, 400);

    // edge-cache successful lookups for a week
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.barcade/lookup/${upc}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let result = null;
    for (const fn of [
      () => lookupOpenFacts(upc, 'world.openfoodfacts.org'),
      () => lookupOpenFacts(upc, 'world.openproductsfacts.org'),
      () => lookupOpenFacts(upc, 'world.openbeautyfacts.org'),
      () => lookupUpcItemDb(upc),
    ]) {
      try {
        result = await fn();
        if (result) break;
      } catch (e) { /* next source */ }
    }

    const resp = json(result ? { found: true, ...result } : { found: false }, 200, {
      'Cache-Control': 'public, max-age=604800',
    });
    if (result) await cache.put(cacheKey, resp.clone());
    return resp;
  },
};
