# Pella

Landing i prodajni funnel za Pella mikrofiber krpe. Statički sajt, plaćanje pouzećem, tržište: Srbija.

> Sve odluke o brendu, steku, ponudi i backendu su u **`CLAUDE.md`**. Pročitaj to prvo.

## Struktura
```
pella/
├── CLAUDE.md              # projektni brief + sve odluke (čita Claude Code)
├── index.html             # landing
├── styles.css             # stilovi (brand tokeni na vrhu, :root)
├── script.js              # before/after slajder, izbor paketa, submit forme (STUB)
├── favicon.svg
├── assets/
│   ├── logo.svg           # mark (kap vode)
│   ├── logo-lockup.svg    # mark + "Pella"
│   ├── prozor / sto / casa / tri-krpe .jpeg   # foto proizvoda
│   ├── demo.mp4           # video za hero i reklame (9:16)
│   └── demo-poster.jpg    # poster frame za video
├── backend/apps-script/   # prijem porudžbina → Google Sheet + Telegram
└── worker/                # Cloudflare Worker za Meta Conversions API
```

## Pokretanje lokalno
Statički sajt — samo posluži folder:
```bash
python3 -m http.server 8000
# otvori http://localhost:8000
```

## Deploy (besplatno, bez pretplate)
**Cloudflare Pages** (preporuka):
1. Push repo na GitHub.
2. Cloudflare → Pages → Connect repo. Build command: prazno. Output dir: `/` (root).
3. Dodaj custom .rs domen.

Alternativa: GitHub Pages (Settings → Pages → deploy from branch).

## Pre live-a (checklist)
- [ ] Slike konvertovati u `.webp` (brzina).
- [ ] Deploy Apps Script → ubaci URL u `script.js` (traži `TODO`).
- [ ] Meta Pixel ID + CAPI (`worker/`) postavljeni.
- [ ] Prave recenzije umesto placeholder-a.
- [ ] Firma/PIB/MB u footeru (`index.html`).
- [ ] Kontakt telefon/email tačni.
- [ ] Testirati formu end-to-end (porudžbina stiže u Sheet + Telegram).
```
```
