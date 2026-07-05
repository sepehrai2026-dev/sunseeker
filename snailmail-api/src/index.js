/* SNAILMAIL API worker — Stripe Checkout + Lob postcard fulfillment.
   Key-gated: runs in "not configured" mode until secrets are set.

   Endpoints:
     GET  /status         → { configured: bool }
     POST /checkout       → { url } (Stripe Checkout redirect) or 503 when not configured
     POST /stripe-webhook → verifies Stripe signature, creates Lob postcard on
                            checkout.session.completed

   Secrets (wrangler secret put ...):
     STRIPE_SECRET_KEY     — sk_live_... / sk_test_...
     STRIPE_WEBHOOK_SECRET — whsec_... (from the Stripe webhook endpoint config)
     LOB_API_KEY           — live_... / test_... Lob secret key
*/

const SITE_URL = 'https://snailmailme.com';
const PRICE_CENTS = 399; // $3.99 per postcard
const MESSAGE_MAX = 350;

const ALLOWED_ORIGINS = new Set([
  'https://snailmailme.com',
  'https://www.snailmailme.com',
  'https://snailmailme-com.pages.dev',
]);

// Must stay in sync with the designs in microsites/sites/snailmailme.com/tool.js
const DESIGNS = {
  Sunset:  { bg: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)', color: '#ffffff', title: 'Greetings!' },
  Ocean:   { bg: 'linear-gradient(135deg, #06b6d4, #3b82f6, #1d4ed8)', color: '#ffffff', title: 'Greetings!' },
  Forest:  { bg: 'linear-gradient(135deg, #16a34a, #15803d, #14532d)', color: '#ffffff', title: 'Greetings!' },
  Minimal: { bg: '#fafaf9', color: '#1c1917', title: 'A letter for you' },
  Night:   { bg: 'linear-gradient(135deg, #1e1b4b, #312e81, #4338ca)', color: '#e0e7ff', title: 'Greetings!' },
  Warm:    { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)', color: '#451a03', title: 'Greetings!' },
};

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP','AA','AE','AP',
]);

/* ---------- helpers ---------- */

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function isConfigured(env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.LOB_API_KEY);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- validation ---------- */

function validateOrder(body) {
  const errors = [];
  const b = body && typeof body === 'object' ? body : {};
  const to = b.to && typeof b.to === 'object' ? b.to : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const design = str(b.design);
  if (!DESIGNS[design]) errors.push('design must be one of: ' + Object.keys(DESIGNS).join(', '));

  const name = str(to.name);
  if (!name || name.length > 64) errors.push('to.name is required (max 64 chars)');

  const line1 = str(to.line1);
  if (!line1 || line1.length > 64) errors.push('to.line1 is required (max 64 chars)');

  const line2 = str(to.line2);
  if (line2.length > 64) errors.push('to.line2 max 64 chars');

  const city = str(to.city);
  if (!city || city.length > 64) errors.push('to.city is required (max 64 chars)');

  const state = str(to.state).toUpperCase();
  if (!US_STATES.has(state)) errors.push('to.state must be a 2-letter US state code (US addresses only for now)');

  const zip = str(to.zip);
  if (!/^\d{5}(-\d{4})?$/.test(zip)) errors.push('to.zip must be a valid US ZIP (12345 or 12345-6789)');

  const message = str(b.message);
  if (!message) errors.push('message is required');
  if (message.length > MESSAGE_MAX) errors.push(`message max ${MESSAGE_MAX} chars`);

  const from = str(b.from);
  if (from.length > 64) errors.push('from max 64 chars');

  if (errors.length) return { ok: false, errors };
  return { ok: true, order: { design, to: { name, line1, line2, city, state, zip }, message, from } };
}

/* ---------- Stripe ---------- */

// Stripe metadata values are capped at 500 chars per key; keep chunks well under.
const MSG_CHUNK = 250;

function orderToMetadata(order) {
  const md = {
    design: order.design,
    to_name: order.to.name,
    to_line1: order.to.line1,
    to_line2: order.to.line2,
    to_city: order.to.city,
    to_state: order.to.state,
    to_zip: order.to.zip,
    from_name: order.from,
    msg_0: order.message.slice(0, MSG_CHUNK),
    msg_1: order.message.slice(MSG_CHUNK, MSG_CHUNK * 2),
  };
  for (const k of Object.keys(md)) if (!md[k]) delete md[k];
  return md;
}

function metadataToOrder(md) {
  if (!md || !md.to_name || !md.to_line1) return null;
  return {
    design: md.design || 'Sunset',
    to: {
      name: md.to_name,
      line1: md.to_line1,
      line2: md.to_line2 || '',
      city: md.to_city || '',
      state: md.to_state || '',
      zip: md.to_zip || '',
    },
    message: (md.msg_0 || '') + (md.msg_1 || ''),
    from: md.from_name || '',
  };
}

async function createCheckoutSession(env, order) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', SITE_URL + '/?success=1');
  params.set('cancel_url', SITE_URL + '/?canceled=1');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(PRICE_CENTS));
  params.set('line_items[0][price_data][product_data][name]', 'Custom Postcard');
  params.set('line_items[0][price_data][product_data][description]',
    `"${order.design}" postcard mailed to ${order.to.name}`);
  const md = orderToMetadata(order);
  for (const [k, v] of Object.entries(md)) params.set(`metadata[${k}]`, v);

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error('stripe checkout error', JSON.stringify(data && data.error));
    throw new Error((data && data.error && data.error.message) || 'Stripe error');
  }
  return data;
}

/* ---------- Stripe webhook signature (WebCrypto HMAC-SHA256) ---------- */

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes of clock skew

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  let timestamp = null;
  const v1Signatures = [];
  for (const part of sigHeader.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => (s || '').trim());
    if (k === 't') timestamp = v;
    else if (k === 'v1' && v) v1Signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || v1Signatures.length === 0) return false;

  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (skew > SIGNATURE_TOLERANCE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return v1Signatures.some((sig) => timingSafeEqualHex(sig, expected));
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Lob ---------- */

// Lob renders HTML at 300dpi; a 4x6 postcard artboard (with bleed) is 6.25in x 4.25in.
function postcardFrontHtml(designName) {
  const d = DESIGNS[designName] || DESIGNS.Sunset;
  return `<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:6.25in;height:4.25in}
.card{width:100%;height:100%;background:${d.bg};color:${d.color};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Helvetica,Arial,sans-serif;text-align:center}
h1{font-size:0.52in;font-weight:700;letter-spacing:0.01em}
p{margin-top:0.18in;font-size:0.15in;text-transform:uppercase;letter-spacing:0.14em;opacity:0.85}
</style></head><body><div class="card"><h1>${escapeHtml(d.title)}</h1><p>snailmailme.com</p></div></body></html>`;
}

// Back: message stays in the left column; Lob prints the address block and
// postage on the right side, which must remain clear.
function postcardBackHtml(order) {
  const fromLine = order.from
    ? `<div class="from">&mdash; ${escapeHtml(order.from)}</div>`
    : '';
  return `<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:6.25in;height:4.25in;background:#ffffff}
.msg{position:absolute;top:0.45in;left:0.45in;width:2.75in;height:3.35in;font-family:Georgia,'Times New Roman',serif;font-size:0.145in;line-height:1.55;color:#1c1917;overflow:hidden;white-space:pre-wrap;word-wrap:break-word}
.from{margin-top:0.18in;color:#57534e;font-style:italic}
</style></head><body><div class="msg">${escapeHtml(order.message)}${fromLine}</div></body></html>`;
}

async function createLobPostcard(env, order, sessionId) {
  const params = new URLSearchParams();
  params.set('description', `snailmailme.com postcard (${sessionId})`.slice(0, 255));
  params.set('to[name]', order.to.name);
  params.set('to[address_line1]', order.to.line1);
  if (order.to.line2) params.set('to[address_line2]', order.to.line2);
  params.set('to[address_city]', order.to.city);
  params.set('to[address_state]', order.to.state);
  params.set('to[address_zip]', order.to.zip);
  params.set('to[address_country]', 'US');
  params.set('front', postcardFrontHtml(order.design));
  params.set('back', postcardBackHtml(order));
  params.set('size', '4x6');
  params.set('use_type', 'operational');
  params.set('metadata[stripe_session]', sessionId.slice(0, 500));

  const resp = await fetch('https://api.lob.com/v1/postcards', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(env.LOB_API_KEY + ':'),
      'Content-Type': 'application/x-www-form-urlencoded',
      // Lob dedupes POSTs with the same idempotency key for 24h — a Stripe
      // webhook retry won't mail a second postcard.
      'Idempotency-Key': sessionId,
    },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error('lob postcard error', JSON.stringify(data && data.error));
    throw new Error((data && data.error && data.error.message) || 'Lob error');
  }
  return data;
}

/* ---------- handlers ---------- */

async function handleCheckout(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400, request);
  }

  const v = validateOrder(body);
  if (!v.ok) return json({ error: 'Invalid order', details: v.errors }, 400, request);

  if (!isConfigured(env)) {
    return json({
      configured: false,
      error: 'Ordering is not yet available. Payment and mailing accounts are still being set up.',
    }, 503, request);
  }

  try {
    const session = await createCheckoutSession(env, v.order);
    return json({ url: session.url }, 200, request);
  } catch (e) {
    return json({ error: 'Could not start checkout: ' + e.message }, 502, request);
  }
}

async function handleWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  if (!sig) return json({ error: 'Missing Stripe-Signature header' }, 400, request);

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'Webhook not configured' }, 503, request);
  }

  const valid = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 400, request);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return json({ error: 'Invalid JSON' }, 400, request);
  }

  if (event.type !== 'checkout.session.completed') {
    return json({ received: true, ignored: event.type }, 200, request);
  }

  const session = event.data && event.data.object;
  const order = session && metadataToOrder(session.metadata);
  if (!order) {
    // Not one of our postcard sessions — acknowledge so Stripe stops retrying.
    return json({ received: true, ignored: 'no postcard metadata' }, 200, request);
  }
  if (session.payment_status && session.payment_status !== 'paid') {
    return json({ received: true, ignored: 'not paid yet' }, 200, request);
  }

  try {
    const postcard = await createLobPostcard(env, order, session.id);
    return json({ received: true, postcard_id: postcard.id }, 200, request);
  } catch (e) {
    // Non-2xx makes Stripe retry the webhook; Lob idempotency key prevents dupes.
    return json({ error: 'Fulfillment failed: ' + e.message }, 500, request);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    if (url.pathname === '/status' && request.method === 'GET') {
      return json({ configured: isConfigured(env) }, 200, request);
    }
    if (url.pathname === '/checkout' && request.method === 'POST') {
      return handleCheckout(request, env);
    }
    if (url.pathname === '/stripe-webhook' && request.method === 'POST') {
      return handleWebhook(request, env, ctx);
    }

    return json({ error: 'Not found' }, 404, request);
  },
};
