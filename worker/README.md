# Meta CAPI Worker (Cloudflare)

Server-side Purchase tracking za Meta reklame (+ opciono ruta porudžbine ka Apps Script, rešava CORS).

## Zašto
Meta Pixel na klijentu gubi ~20–40% konverzija (ad-blockeri, iOS/ITP). Conversions API šalje event
server-to-server → tačnija optimizacija i niža cena po porudžbini.

## Setup
1. Meta Events Manager → tvoj Pixel → **Settings → Conversions API → Generate access token**.
2. Zapamti **Pixel ID** i **token**.
3. Deploy:
   ```bash
   npm i -g wrangler
   wrangler login
   wrangler deploy worker/meta-capi-worker.js --name pella-capi
   ```
4. Postavi secrets:
   ```bash
   wrangler secret put PIXEL_ID
   wrangler secret put CAPI_TOKEN
   wrangler secret put APPS_SCRIPT_URL   # /exec URL iz backend/apps-script
   wrangler secret put SERVER_TOKEN      # bilo koji dugačak string, isti ide u Code.gs
   ```
5. Uzmi Worker URL (`https://pella-capi.<tvoj>.workers.dev`) i upiši ga u `../script.js` → `ORDER_ENDPOINT`.

## Kako teče event (COD)
| Kada | Event | Ko šalje |
|---|---|---|
| Submit forme | `Lead` | stranica → Worker (+ Pixel, isti `event_id`) |
| Kurir potvrdio isporuku | `Purchase` | Apps Script → Worker |

Kod pouzeća deo porudžbina nikad ne bude preuzet. Da se Purchase šalje na submitu, Meta bi
optimizovala ka ljudima koji poruče a ne plate. Zato pravi Purchase ide tek iz Sheet-a,
kad status pređe u „Isporučeno“.

## Šta Worker radi
- `Lead`: prosleđuje porudžbinu Apps Script-u (Sheet + Telegram) i **vraća grešku ako upis ne prođe**
  — stranica tada ne prikazuje potvrdu, nego ponudi telefon.
- `Purchase`: prihvata samo uz `X-Pella-Token` koji odgovara `SERVER_TOKEN` (da niko sa strane ne
  ubacuje lažne konverzije). Ne prosleđuje se Apps Script-u — odatle je i došao.
- PII (telefon, ime, grad, pošta) se heširaju SHA-256 pre slanja. `fbp`/`fbc` kolačići i IP se
  prosleđuju radi boljeg match-a.
- Ako Meta odbije event, porudžbina se **ne** ruši — tracking greška se samo loguje.

## Napomena
`event_id` je isti na Pixelu i na CAPI eventu → Meta ih dedupe-uje i ne broji dvaput.
