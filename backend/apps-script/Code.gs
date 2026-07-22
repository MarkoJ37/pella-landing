/**
 * Pella — prijem porudžbina (Google Apps Script Web App)
 *
 * 1) doPost: prima porudžbinu sa landinga -> upisuje red u Sheet + Telegram poruka.
 * 2) Kad u koloni "Status" izabereš "Isporučeno", šalje Meti pravi Purchase event
 *    kroz Cloudflare Worker. Kod pouzeća se plaćanje dešava tek pri preuzimanju,
 *    pa se tek tu i broji konverzija.
 *
 * DEPLOY: vidi README.md u ovom folderu.
 */

// ---- KONFIG ----
const SHEET_ID = 'PASTE_SHEET_ID';           // ID Google Sheet-a (iz URL-a)
const SHEET_NAME = 'Porudzbine';
const TELEGRAM_TOKEN = 'PASTE_BOT_TOKEN';    // od @BotFather
const TELEGRAM_CHAT_ID = 'PASTE_CHAT_ID';    // tvoj chat/grupa id
const WORKER_URL = 'PASTE_WORKER_URL';       // https://pella-capi.<tvoj>.workers.dev
const SERVER_TOKEN = 'PASTE_SERVER_TOKEN';   // isti kao SERVER_TOKEN secret na Worker-u
// ----------------

const ZAGLAVLJE = ['Vreme', 'Paket', 'Iznos', 'Ime', 'Telefon', 'Grad', 'Pošta', 'Adresa', 'Status', 'EventID', 'Purchase poslat'];
const K = { VREME: 1, PAKET: 2, IZNOS: 3, IME: 4, TEL: 5, GRAD: 6, POSTA: 7, ADRESA: 8, STATUS: 9, EVENT_ID: 10, PURCHASE: 11 };
const STATUSI = ['Nova', 'Potvrđena', 'Poslata', 'Isporučeno', 'Odbijeno', 'Otkazano'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet();

    sheet.appendRow([
      new Date(),
      data.paket || '',
      Number(data.value) || 0,
      data.ime || '',
      data.tel || '',
      data.grad || '',
      data.posta || '',
      data.adresa || '',
      'Nova',
      data.event_id || '',
      ''
    ]);

    notifyTelegram(data);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(ZAGLAVLJE);
    sheet.setFrozenRows(1);
    sheet.getRange(2, K.STATUS, sheet.getMaxRows() - 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSI).build());
  }
  return sheet;
}

function notifyTelegram(d) {
  if (TELEGRAM_TOKEN.indexOf('PASTE') === 0) return; // preskoči dok nije konfigurisan
  const msg =
    '🧽 *Nova porudžbina — Pella*\n\n' +
    '*Paket:* ' + (d.paket || '-') + '\n' +
    '*Ime:* ' + (d.ime || '-') + '\n' +
    '*Telefon:* ' + (d.tel || '-') + '\n' +
    '*Grad:* ' + (d.grad || '-') + ' ' + (d.posta || '') + '\n' +
    '*Adresa:* ' + (d.adresa || '-');

  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: 'Markdown'
    }),
    muteHttpExceptions: true
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Purchase pri isporuci ----------

/**
 * Instalabilni onEdit trigger (postavi ga jednom kroz meni Pella → Instaliraj trigger).
 * Prost onEdit ne sme da zove UrlFetchApp, zato instalabilni.
 */
function onStatusEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getColumn() !== K.STATUS || e.range.getRow() < 2) return;
  if (String(e.value).trim() !== 'Isporučeno') return;
  posaljiPurchase(sheet, e.range.getRow());
}

function posaljiPurchase(sheet, red) {
  if (sheet.getRange(red, K.PURCHASE).getValue()) return; // već poslat — ne dupliraj
  if (WORKER_URL.indexOf('PASTE') === 0) return;

  const v = sheet.getRange(red, 1, 1, ZAGLAVLJE.length).getValues()[0];
  const payload = {
    event_name: 'Purchase',
    event_id: v[K.EVENT_ID - 1] ? 'purchase-' + v[K.EVENT_ID - 1] : 'purchase-red-' + red,
    value: Number(v[K.IZNOS - 1]) || 0,
    currency: 'RSD',
    paket: v[K.PAKET - 1],
    ime: v[K.IME - 1],
    tel: v[K.TEL - 1],
    grad: v[K.GRAD - 1],
    posta: v[K.POSTA - 1],
    action_source: 'phone_call' // porudžbina potvrđena pozivom, plaćena kuriru
  };

  const res = UrlFetchApp.fetch(WORKER_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Pella-Token': SERVER_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const ok = res.getResponseCode() === 200;
  sheet.getRange(red, K.PURCHASE).setValue(ok ? new Date() : 'GREŠKA: ' + res.getContentText().slice(0, 120));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Pella')
    .addItem('Pošalji Purchase za izabrani red', 'posaljiPurchaseZaIzabraniRed')
    .addItem('Instaliraj trigger za status', 'instalirajTrigger')
    .addToUi();
}

function posaljiPurchaseZaIzabraniRed() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const red = sheet.getActiveRange().getRow();
  if (sheet.getName() !== SHEET_NAME || red < 2) {
    SpreadsheetApp.getUi().alert('Izaberi red porudžbine u listu "' + SHEET_NAME + '".');
    return;
  }
  posaljiPurchase(sheet, red);
  SpreadsheetApp.getUi().alert('Poslato. Vidi kolonu "Purchase poslat".');
}

function instalirajTrigger() {
  const postojeci = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onStatusEdit');
  postojeci.forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onStatusEdit')
    .forSpreadsheet(SHEET_ID)
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert('Trigger postavljen. Status "Isporučeno" sada šalje Purchase Meti.');
}

// Test iz editora
function testPost() {
  doPost({ postData: { contents: JSON.stringify({
    paket: '2 seta — 1.999 rsd', value: 1999, ime: 'Test Test', tel: '0601234567',
    grad: 'Beograd', posta: '11000', adresa: 'Test 1', event_id: 'test-' + Date.now()
  }) } });
}
