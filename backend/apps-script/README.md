# Prijem porudžbina (Google Apps Script)

Prima porudžbine sa landing forme → upisuje u Google Sheet + šalje Telegram poruku.

## Setup
1. Napravi Google Sheet. Iz URL-a kopiraj **ID** (`.../d/`**`OVAJ_DEO`**`/edit`) → u `Code.gs` → `SHEET_ID`.
2. Telegram (opciono ali preporučeno za instant ping):
   - U Telegramu piši `@BotFather` → `/newbot` → dobiješ **token** → `TELEGRAM_TOKEN`.
   - Pošalji poruku svom botu, pa otvori
     `https://api.telegram.org/bot<TOKEN>/getUpdates` → nađi `chat.id` → `TELEGRAM_CHAT_ID`.
3. [script.google.com](https://script.google.com) → novi projekat → nalepi `Code.gs` → sačuvaj.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Copy **Web app URL** (`.../exec`).
5. Taj URL ide u Worker kao secret `APPS_SCRIPT_URL` (ne direktno u `script.js` — vidi CORS niže).
6. Za Purchase pri isporuci popuni još i `WORKER_URL` i `SERVER_TOKEN` u `Code.gs`
   (`SERVER_TOKEN` mora biti isti string kao secret na Worker-u).

## Test
U editoru pokreni `testPost` — treba da se pojavi red u Sheet-u (i Telegram poruka ako je konfigurisan).

## Purchase kad kurir potvrdi isporuku
Kod pouzeća se konverzija broji tek pri preuzimanju, ne pri porudžbini.

1. Otvori Sheet → meni **Pella → Instaliraj trigger za status** (jednom; traži dozvolu).
2. U koloni **Status** izaberi `Isporučeno` za red koji je kurir naplatio.
3. Skripta šalje `Purchase` Meti kroz Worker i upisuje vreme u kolonu **Purchase poslat**.
   Red koji već ima upis se ne šalje ponovo.

Ručno slanje (npr. ako je trigger propustio red): označi red → meni **Pella → Pošalji Purchase za izabrani red**.

Kolone: `Vreme | Paket | Iznos | Ime | Telefon | Grad | Pošta | Adresa | Status | EventID | Purchase poslat`.
`EventID` dolazi sa stranice i vezuje Lead i Purchase za istu porudžbinu — ne brisati.

## Napomena o CORS
Apps Script Web App ne vraća CORS header-e pouzdano, a stranici je odgovor potreban da bi znala
da li je porudžbina stvarno upisana. Zato forma gađa **Cloudflare Worker**, a Worker prosleđuje ovamo.
