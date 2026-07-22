/**
 * Pella — Cloudflare Worker za Meta Conversions API (server-side tracking).
 *
 * Dva tipa poziva:
 *  1) Lead   — sa landing forme, pri submitu porudžbine. Worker ujedno prosleđuje
 *              porudžbinu Apps Script-u (Sheet + Telegram) i time rešava CORS.
 *  2) Purchase — iz Apps Script-a, tek kad kurir potvrdi isporuku (COD).
 *              Zahteva SERVER_TOKEN da ga niko sa strane ne može poslati.
 *
 * Zašto tako: kod pouzeća deo porudžbina nikad ne bude plaćen. Ako se Purchase
 * šalje na submit, Meta optimizuje ka ljudima koji poruče a ne preuzmu.
 *
 * Secrets (Workers → Settings → Variables):
 *   PIXEL_ID, CAPI_TOKEN, APPS_SCRIPT_URL (opciono), SERVER_TOKEN (opciono ali preporučeno)
 * Deploy: `npx wrangler deploy` (vidi README.md).
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Pella-Token',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'nevalidan JSON' }, 400, cors);
    }

    const eventName = body.event_name || 'Lead';

    // Purchase sme samo server-to-server (Apps Script), ne sa stranice.
    if (eventName === 'Purchase' && env.SERVER_TOKEN) {
      const token = request.headers.get('X-Pella-Token');
      if (token !== env.SERVER_TOKEN) {
        return json({ ok: false, error: 'nedozvoljen Purchase' }, 403, cors);
      }
    }

    // 1) Porudžbina -> Apps Script (Sheet + Telegram). Samo za Lead — Purchase
    //    dolazi IZ Sheet-a, pa bi ga ovde upisali drugi put.
    let stored = null;
    if (env.APPS_SCRIPT_URL && eventName === 'Lead') {
      try {
        const r = await fetch(env.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        stored = r.ok;
      } catch {
        stored = false;
      }
      // Porudžbina koja nije upisana je izgubljena porudžbina — javi stranici.
      if (stored === false) {
        return json({ ok: false, error: 'upis porudžbine nije uspeo' }, 502, cors);
      }
    }

    // 2) Meta Conversions API
    if (!env.PIXEL_ID || !env.CAPI_TOKEN) {
      return json({ ok: true, stored, meta: 'preskočeno — nedostaju PIXEL_ID/CAPI_TOKEN' }, 200, cors);
    }

    const user_data = {
      client_user_agent: body.client_user_agent || request.headers.get('user-agent') || '',
      client_ip_address: request.headers.get('cf-connecting-ip') || undefined,
      country: [await sha256('rs')],
    };
    if (body.tel) user_data.ph = [await sha256(normalizePhone(body.tel))];
    if (body.ime) {
      const [ime, ...ostatak] = String(body.ime).trim().split(/\s+/);
      user_data.fn = [await sha256(norm(ime))];
      if (ostatak.length) user_data.ln = [await sha256(norm(ostatak.join(' ')))];
    }
    if (body.grad) user_data.ct = [await sha256(norm(body.grad).replace(/\s/g, ''))];
    if (body.posta) user_data.zp = [await sha256(String(body.posta).replace(/\D/g, ''))];
    if (body.fbp) user_data.fbp = body.fbp;
    if (body.fbc) user_data.fbc = body.fbc;

    const payload = {
      data: [{
        event_name: eventName,
        event_time: Number(body.event_time) || Math.floor(Date.now() / 1000),
        // isti event_id kao na Pixelu -> Meta dedupe
        event_id: body.event_id || undefined,
        action_source: body.action_source || 'website',
        event_source_url: body.source_url || undefined,
        user_data,
        custom_data: {
          currency: body.currency || 'RSD',
          value: Number(body.value) || 0,
          content_name: body.paket || undefined,
        },
      }],
    };

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${env.PIXEL_ID}/events?access_token=${env.CAPI_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (!res.ok) {
      const detalj = await res.text().catch(() => '');
      console.log('Meta CAPI greška:', res.status, detalj);
      // Porudžbina je upisana — ne rušimo je zbog trackinga.
      return json({ ok: stored !== false, stored, meta: false }, 200, cors);
    }

    return json({ ok: true, stored, meta: true }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function norm(s) {
  return String(s || '').trim().toLowerCase();
}
function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '381' + d.slice(1); // Srbija
  if (!d.startsWith('381')) d = '381' + d;
  return d;
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
