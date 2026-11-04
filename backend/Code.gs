/**
 * STACKUP. — приймальня брифів і бекенд CRM (Google Apps Script)
 *
 * Що робить:
 *  - приймає брифи з brief.html: створює папку на вашому Google Drive,
 *    зберігає туди бриф (brief.html, brief.json) і всі файли клієнта;
 *  - веде таблицю «Stackup — Заявки» (Google Sheets);
 *  - надсилає вам лист про кожну нову заявку;
 *  - віддає дані кабінету admin.html лише після входу за вашим кодом.
 *
 * Безпека CRM:
 *  - код зберігається лише як солений хеш (HMAC-SHA256, 250 раундів), не текстом;
 *  - після правильного коду на вашу пошту приходить одноразовий код (2FA);
 *  - після 5 невдалих спроб вхід блокується, і кожне наступне блокування довше
 *    (15 хв → 30 хв → 1 год … до 24 год), вам приходить лист;
 *  - сесія діє 24 год від входу, «Вийти всюди» скасовує всі сесії;
 *  - довірені пристрої (30 днів) зберігаються лише як хеші, їх можна відкликати;
 *  - журнал входів — окремий аркуш «Журнал» у таблиці.
 *
 * Налаштування — див. backend/README.md (один раз, ~10 хв).
 */

const ROOT_NAME = 'Stackup — Брифи';
const SHEET_NAME = 'Заявки';
const LOG_SHEET = 'Журнал';
const COLS = ['id', 'created', 'status', 'name', 'company', 'email', 'phone', 'mode', 'type', 'deadline', 'budget', 'files', 'folderId', 'notes', 'token', 'updated'];
const STATUSES = ['new', 'review', 'quoted', 'work', 'done', 'archive'];

const SEC = {
  CODE_MIN: 6, CODE_MAX: 64,
  HASH_ROUNDS: 250,             // ~1 с в Apps Script; підбір онлайн зупиняє блокування
  MAX_FAILS: 5,                 // невдалих спроб до блокування
  LOCK_BASE_MIN: 15,            // перше блокування, хв; далі ×2
  LOCK_MAX_MIN: 24 * 60,
  OTP_TTL_S: 600,               // одноразовий код діє 10 хв
  OTP_TRIES: 5,
  SESSION_MAX_MS: 24 * 3600 * 1000, // сесія діє 24 год від входу
  SESSION_MAX: 10,              // одночасних сесій (старіші відключаються)
  TRUST_DAYS: 30, TRUST_MAX: 5,
  FAIL_DELAY_MS: 900,
  // публічний бриф
  SUBMITS_PER_HOUR: 30,
  UPLOAD_WINDOW_S: 3 * 3600,    // файли можна дозавантажити лише 3 год після надсилання
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  MAX_FILES: 80,
  MAX_TOTAL_BYTES: 300 * 1024 * 1024,
  MAX_JSON_CHARS: 40 * 1024 * 1024
};

/* =====================================================================
   ОДНОРАЗОВЕ НАЛАШТУВАННЯ
   1) Project Settings → Script properties → додайте NEW_CODE = ваш код
   2) Запустіть setup(). Код захешується, а NEW_CODE видалиться сам.
   Змінити код пізніше: так само додайте NEW_CODE і запустіть setup().
   ===================================================================== */
function setup() {
  const p = props();
  let folderId = p.getProperty('ROOT_FOLDER');
  if (!folderId) folderId = DriveApp.createFolder(ROOT_NAME).getId();
  let ssId = p.getProperty('SHEET_ID');
  if (!ssId) {
    const ss = SpreadsheetApp.create('Stackup — Заявки');
    const sh = ss.getSheets()[0];
    sh.setName(SHEET_NAME);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(folderId));
    ssId = ss.getId();
  }
  p.setProperties({ ROOT_FOLDER: folderId, SHEET_ID: ssId });
  if (!p.getProperty('NOTIFY_EMAIL')) p.setProperty('NOTIFY_EMAIL', Session.getEffectiveUser().getEmail());
  if (!p.getProperty('TWO_FACTOR')) p.setProperty('TWO_FACTOR', 'on');
  p.deleteProperty('ADMIN_KEY'); // старий ключ більше не діє

  const fresh = p.getProperty('NEW_CODE');
  if (fresh != null) {
    p.deleteProperty('NEW_CODE');
    const problem = codeProblem(fresh);
    if (problem) throw new Error('Код не прийнято: ' + problem + ' Додайте NEW_CODE ще раз і запустіть setup().');
    setCodeHash(fresh);
    revokeEverything();
    audit('code-set', 'setup');
    Logger.log('Код кабінету збережено (як хеш). NEW_CODE видалено. Усі старі сесії і пристрої скасовано.');
  } else if (!p.getProperty('CODE_HASH')) {
    Logger.log('Увага: код кабінету ще не задано. Додайте Script property NEW_CODE і запустіть setup() ще раз.');
  } else {
    Logger.log('Код кабінету вже задано. Щоб змінити — додайте NEW_CODE і запустіть setup().');
  }
  Logger.log('Пошта для заявок і кодів входу: ' + p.getProperty('NOTIFY_EMAIL'));
  Logger.log('Папка: ' + DriveApp.getFolderById(folderId).getUrl());
  Logger.log('Таблиця: ' + SpreadsheetApp.openById(ssId).getUrl());
}

/** Аварійне розблокування, якщо хтось підбирав код і вхід заблоковано. */
function unlockLogin() {
  props().setProperties({ FAILS: '0', LOCK_UNTIL: '0', LOCK_LEVEL: '0' });
  audit('unlock', 'manual');
  Logger.log('Вхід розблоковано.');
}

/** Вийти на всіх пристроях і забути всі довірені пристрої. */
function logoutEverywhere() {
  revokeEverything();
  audit('logout-all', 'manual');
  Logger.log('Усі сесії і довірені пристрої скасовано.');
}

/* ---------- http ---------- */
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '';
    if (raw.length > SEC.MAX_JSON_CHARS) throw new Error('payload too large');
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') throw new Error('bad request');
    if (d.website) return out({ ok: true }); // honeypot: боти заповнюють приховане поле
    switch (d.action) {
      // публічне: бриф клієнта
      case 'submit': return out(submit(d));
      case 'file': return out(addFile(d));
      case 'finish': return out(finish(d));
      // вхід
      case 'login': return out(login(d));
      case 'verify': return out(verify(d));
      // лише з сесією
      case 'session': requireSession(d); return out({ ok: true });
      case 'logout': return out(logout(d));
      case 'logoutAll': requireSession(d); revokeEverything(); audit('logout-all', ua(d)); return out({ ok: true });
      case 'list': requireSession(d); return out({ ok: true, items: list(), stages: getStages() });
      case 'get': requireSession(d); return out(get(d.id));
      case 'update': requireSession(d); return out(update(d));
      case 'stages': requireSession(d); return out(saveStages(d.stages));
      default: return out({ ok: false, error: 'unknown action' });
    }
  } catch (err) { return out({ ok: false, error: publicError(err) }); }
}

function doGet(e) {
  const q = e && e.parameter || {};
  if (q.action === 'ping') return out({ ok: true, app: 'stackup-briefs' });
  // дані кабінету через GET більше не віддаються: токени не мають потрапляти в адресу
  return out({ ok: false, error: 'unauthorized' });
}

/* =====================================================================
   ВХІД
   ===================================================================== */
function login(d) {
  return withLock(() => {
    checkLock();
    const p = props();
    if (!p.getProperty('CODE_HASH')) throw new Error('not configured');
    const code = typeof d.code === 'string' ? d.code : '';
    if (!code || code.length > SEC.CODE_MAX || !checkCode(code)) {
      failed('bad-code', d);
      throw new Error('bad code');
    }
    // код правильний
    if (p.getProperty('TWO_FACTOR') === 'off' || trustedDevice(d.device)) {
      resetFails();
      const s = newSession(d);
      audit('login', (p.getProperty('TWO_FACTOR') === 'off' ? '2FA вимкнено · ' : 'довірений пристрій · ') + ua(d));
      if (p.getProperty('TWO_FACTOR') !== 'off') notify('Вхід у CRM Stackup', 'Щойно виконано вхід у кабінет з довіреного пристрою.<br>' + esc(ua(d)) + '<br>' + esc(now()) + '<br><br>Якщо це були не ви — запустіть logoutEverywhere() і змініть код.');
      return { ok: true, token: s, ttl: SEC.SESSION_MAX_MS / 1000 };
    }
    const otp = randomDigits(6);
    const challenge = randomToken();
    cache().put('C:' + sha(challenge), JSON.stringify({ h: sha(otp + ':' + challenge), tries: 0, ua: ua(d) }), SEC.OTP_TTL_S);
    // якщо «Далі» натиснули кілька разів, підходить код з будь-якого листа за останні 10 хв
    saveOtps(pendingOtps().concat([{ h: sha('otp:' + otp), exp: Date.now() + SEC.OTP_TTL_S * 1000 }]));
    notify('Код входу в CRM Stackup: ' + otp,
      '<p style="font-size:15px">Ваш одноразовий код для входу в кабінет:</p>' +
      '<p style="font-size:34px;font-weight:bold;letter-spacing:6px;margin:8px 0">' + otp + '</p>' +
      '<p style="font-size:13px;color:#666">Діє 10 хвилин. Нікому його не повідомляйте.<br>Пристрій: ' + esc(ua(d)) + '<br>Якщо ви не входили — хтось знає ваш код. Змініть його (NEW_CODE + setup()).</p>');
    audit('code-ok-otp-sent', ua(d));
    return { ok: true, step: 'otp', challenge, to: maskEmail(p.getProperty('NOTIFY_EMAIL')) };
  });
}

function verify(d) {
  return withLock(() => {
    checkLock();
    const challenge = typeof d.challenge === 'string' ? d.challenge : '';
    const k = 'C:' + sha(challenge);
    const raw = challenge && cache().get(k);
    if (!raw) throw new Error('expired');
    const c = JSON.parse(raw);
    const otp = String(d.otp || '').replace(/\D/g, '');
    const fresh = otp.length === 6 && pendingOtps().some(x => safeEqual(x.h, sha('otp:' + otp)));
    if (!safeEqual(sha(otp + ':' + challenge), c.h) && !fresh) {
      c.tries++;
      if (c.tries >= SEC.OTP_TRIES) cache().remove(k); else cache().put(k, JSON.stringify(c), SEC.OTP_TTL_S);
      failed('bad-otp', d);
      throw new Error(c.tries >= SEC.OTP_TRIES ? 'expired' : 'bad otp');
    }
    cache().remove(k); cache().remove('OTPS');
    resetFails();
    const res = { ok: true, token: newSession(d), ttl: SEC.SESSION_MAX_MS / 1000 };
    if (d.trust) res.device = addTrusted(d);
    audit('login', '2FA ✓' + (d.trust ? ' · довірений пристрій 30 дн' : '') + ' · ' + ua(d));
    return res;
  });
}

function logout(d) {
  const t = typeof d.token === 'string' ? d.token : '';
  if (t) withLock(() => saveSessions(sessions().filter(x => x.h !== sha(t))));
  if (d.device) removeTrusted(d.device);
  audit('logout', ua(d));
  return { ok: true };
}

/* ---------- сесії ---------- */
// Сесії зберігаються як хеші у властивостях скрипта (кеш Google живе не довше 6 год).
function sessions() {
  try { const ep = epoch(); return JSON.parse(props().getProperty('SESSIONS') || '[]').filter(x => x.ep === ep && Date.now() - x.at < SEC.SESSION_MAX_MS); } catch (e) { return []; }
}
function saveSessions(list) { props().setProperty('SESSIONS', JSON.stringify(list.slice(-SEC.SESSION_MAX))); }
function newSession(d) {
  const t = randomToken();
  saveSessions(sessions().concat([{ h: sha(t), ep: epoch(), at: Date.now() }]));
  return t;
}
function requireSession(d) {
  const t = typeof d.token === 'string' ? d.token : '';
  if (!t || t.length < 40 || t.length > 100) throw new Error('unauthorized');
  const h = sha(t);
  if (!sessions().some(x => safeEqual(x.h, h))) throw new Error('unauthorized');
}
function epoch() { return props().getProperty('SESSION_EPOCH') || '0'; }
function revokeEverything() {
  props().setProperty('SESSION_EPOCH', String(Date.now()) + randomDigits(4));
  props().setProperty('TRUSTED', '[]');
  props().setProperty('SESSIONS', '[]');
}

/* ---------- довірені пристрої ---------- */
function trustedList() { try { return JSON.parse(props().getProperty('TRUSTED') || '[]').filter(x => x.exp > Date.now()); } catch (e) { return []; } }
function trustedDevice(dev) {
  if (typeof dev !== 'string' || dev.length < 40 || dev.length > 100) return false;
  const h = sha('dev:' + dev);
  return trustedList().some(x => safeEqual(x.h, h));
}
function addTrusted(d) {
  const dev = randomToken();
  const list = trustedList();
  list.push({ h: sha('dev:' + dev), exp: Date.now() + SEC.TRUST_DAYS * 864e5, ua: ua(d).slice(0, 120), at: now() });
  props().setProperty('TRUSTED', JSON.stringify(list.slice(-SEC.TRUST_MAX)));
  return dev;
}
function removeTrusted(dev) {
  if (typeof dev !== 'string') return;
  const h = sha('dev:' + dev);
  props().setProperty('TRUSTED', JSON.stringify(trustedList().filter(x => x.h !== h)));
}

/* ---------- блокування підбору ---------- */
function checkLock() {
  const until = +props().getProperty('LOCK_UNTIL') || 0;
  if (until > Date.now()) throw new Error('locked:' + until);
}
function failed(kind, d) {
  const p = props();
  const n = (+p.getProperty('FAILS') || 0) + 1;
  audit(kind, ua(d));
  if (n >= SEC.MAX_FAILS) {
    const level = (+p.getProperty('LOCK_LEVEL') || 0);
    const mins = Math.min(SEC.LOCK_BASE_MIN * Math.pow(2, level), SEC.LOCK_MAX_MIN);
    const until = Date.now() + mins * 60000;
    p.setProperties({ FAILS: '0', LOCK_UNTIL: String(until), LOCK_LEVEL: String(level + 1) });
    audit('locked', mins + ' хв');
    notify('CRM Stackup: вхід заблоковано на ' + mins + ' хв',
      'Було ' + SEC.MAX_FAILS + ' невдалих спроб входу в кабінет. Вхід заблоковано на ' + mins + ' хв.<br>Останній пристрій: ' + esc(ua(d)) +
      '<br><br>Якщо це не ви — змініть код (NEW_CODE + setup()). Розблокувати раніше: запустіть unlockLogin() у редакторі скрипта.');
  } else p.setProperty('FAILS', String(n));
  Utilities.sleep(SEC.FAIL_DELAY_MS);
}
function resetFails() { props().setProperties({ FAILS: '0', LOCK_LEVEL: '0' }); }

/* ---------- код: хеш і перевірка ---------- */
function codeProblem(code) {
  code = String(code);
  if (code.length < SEC.CODE_MIN) return 'щонайменше ' + SEC.CODE_MIN + ' символів.';
  if (code.length > SEC.CODE_MAX) return 'не довше ' + SEC.CODE_MAX + ' символів.';
  if (/^(.)\1+$/.test(code)) return 'не можна з однакових символів.';
  const digits = '01234567890', rev = '09876543210';
  if (/^\d+$/.test(code) && (digits.indexOf(code) >= 0 || rev.indexOf(code) >= 0)) return 'не можна йти підряд (123456…).';
  if (['password', 'qwerty', 'stackup', '123123', '112233', '121212', '696969', '111222'].some(w => code.toLowerCase().indexOf(w) >= 0)) return 'надто простий.';
  return '';
}
function setCodeHash(code) {
  const salt = randomToken();
  props().setProperties({ CODE_SALT: salt, CODE_HASH: stretch(code, salt, SEC.HASH_ROUNDS), CODE_ROUNDS: String(SEC.HASH_ROUNDS), FAILS: '0', LOCK_UNTIL: '0', LOCK_LEVEL: '0' });
}
function checkCode(code) {
  const p = props();
  const rounds = +p.getProperty('CODE_ROUNDS') || 0; // 0 = старий формат (2000 раундів, повільний)
  const salt = p.getProperty('CODE_SALT') || '';
  const okCode = safeEqual(rounds ? stretch(code, salt, rounds) : stretchLegacy(code, salt), p.getProperty('CODE_HASH') || '');
  if (okCode && rounds !== SEC.HASH_ROUNDS) setCodeHash(code); // тихо переводимо на швидкий формат
  return okCode;
}
/** HMAC-SHA256, ключ — байти (сіль + код), обчислені один раз. */
function stretch(code, salt, rounds) {
  const key = Utilities.newBlob(salt + code).getBytes();
  let h = Utilities.computeHmacSha256Signature(code, salt);
  for (let i = 1; i < rounds; i++) h = Utilities.computeHmacSha256Signature(h, key);
  return Utilities.base64Encode(h);
}
function stretchLegacy(code, salt) {
  let h = Utilities.computeHmacSha256Signature(code, salt);
  for (let i = 1; i < 2000; i++) h = Utilities.computeHmacSha256Signature(h, Utilities.newBlob(salt + code).getBytes());
  return Utilities.base64Encode(h);
}

/* =====================================================================
   ПРИЙМАННЯ БРИФУ (публічне)
   ===================================================================== */
function submit(d) {
  const c = d.client || {};
  const name = str(c.name, 200), email = str(c.email, 200);
  if (!name || !email) throw new Error('name and email required');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('bad email');
  rateLimit('submit', SEC.SUBMITS_PER_HOUR);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const id = Utilities.formatDate(new Date(), 'Etc/GMT', 'yyMMdd') + '-' + randomToken().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
    const token = randomToken();
    const client = { name, email, company: str(c.company, 200), phone: str(c.phone, 80) };
    const label = [Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), client.company || client.name, id].join(' · ');
    const folder = root().createFolder(clean(label));
    const record = {
      id, created: new Date().toISOString(), mode: d.mode === 'has' ? 'has' : 'none', lang: str(d.lang, 5),
      client: Object.assign({}, c, client), summary: d.summary || {}, estimate: Array.isArray(d.estimate) ? d.estimate : [], sections: Array.isArray(d.sections) ? d.sections : [], answers: d.answers || {}
    };
    folder.createFile('brief.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
    // HTML клієнта зберігається як текст, щоб його не можна було відкрити як сторінку з вашого Drive
    if (d.html) folder.createFile('brief.html.txt', String(d.html).slice(0, 5 * 1024 * 1024), MimeType.PLAIN_TEXT);
    const s = d.summary || {};
    const row = { id, created: record.created, status: 'new', name: client.name, company: client.company, email: client.email, phone: client.phone,
      mode: record.mode, type: str(s.type, 120), deadline: str(s.deadline, 120), budget: str(s.budget, 120), files: Math.max(0, Math.min(999, parseInt(d.fileCount, 10) || 0)),
      folderId: folder.getId(), notes: '', token: sha(token), updated: record.created };
    sheet().appendRow(COLS.map(k => cell(row[k])));
    cache().put('UP:' + id, JSON.stringify({ n: 0, bytes: 0 }), SEC.UPLOAD_WINDOW_S);
    return { ok: true, id, token };
  } finally { lock.releaseLock(); }
}

function addFile(d) {
  const r = ownRow(d);
  const k = 'UP:' + r.obj.id, raw = cache().get(k);
  if (!raw) throw new Error('upload window closed');
  const up = JSON.parse(raw);
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (bytes.length > SEC.MAX_FILE_BYTES) throw new Error('file too large');
  if (up.n + 1 > SEC.MAX_FILES || up.bytes + bytes.length > SEC.MAX_TOTAL_BYTES) throw new Error('too many files');
  up.n++; up.bytes += bytes.length;
  cache().put(k, JSON.stringify(up), SEC.UPLOAD_WINDOW_S);
  const folder = DriveApp.getFolderById(r.obj.folderId);
  const field = clean(str(d.field, 60) || 'files');
  const sub = folder.getFoldersByName(field);
  const dir = sub.hasNext() ? sub.next() : folder.createFolder(field);
  const blob = Utilities.newBlob(bytes, safeMime(d.type), clean(str(d.name, 120) || 'file'));
  const f = dir.createFile(blob);
  if (d.fieldLabel) f.setDescription(str(d.fieldLabel, 200));
  return { ok: true };
}

function finish(d) {
  const r = ownRow(d);
  const k = 'UP:' + r.obj.id;
  if (!cache().get(k)) return { ok: true }; // уже завершено
  cache().remove(k); // після finish токен клієнта більше нічого не відкриває
  try {
    const p = props();
    const to = p.getProperty('NOTIFY_EMAIL');
    const adminUrl = p.getProperty('ADMIN_URL') || '';
    if (to) {
      const o = r.obj;
      MailApp.sendEmail({
        to, replyTo: /^[^\s@<>,;]+@[^\s@<>,;]+$/.test(o.email) ? o.email : undefined,
        subject: 'Нова заявка Stackup: ' + plain(o.company || o.name).slice(0, 80),
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">' +
          '<p style="font-size:22px;font-weight:bold;margin:0 0 12px">STACKUP. Нова заявка</p>' +
          '<p><b>' + esc(o.name) + '</b>' + (o.company ? ' · ' + esc(o.company) : '') + '<br>' + esc(o.email) + (o.phone ? ' · ' + esc(o.phone) : '') + '</p>' +
          '<p>' + (o.mode === 'has' ? 'Надіслав(ла) готове ТЗ' : 'Створив(ла) ТЗ у брифі') + (o.type ? ' · ' + esc(o.type) : '') + (o.deadline ? ' · ' + esc(o.deadline) : '') + (o.budget ? ' · ' + esc(o.budget) : '') + '</p>' +
          '<p>Файлів: ' + esc(o.files) + '</p>' +
          (/^https:\/\//.test(adminUrl) ? '<p><a href="' + esc(adminUrl) + '#' + esc(o.id) + '" style="background:#ceff31;color:#181917;padding:10px 16px;text-decoration:none;font-weight:bold">Відкрити в кабінеті ↗</a></p>' : '') +
          '<p><a href="' + esc(DriveApp.getFolderById(o.folderId).getUrl()) + '">Папка на Google Drive</a></p></div>'
      });
    }
  } catch (e) { /* лист не критичний */ }
  return { ok: true };
}

function ownRow(d) {
  const r = findRow(str(d.id, 40));
  if (!r || typeof d.token !== 'string' || !safeEqual(String(r.obj.token), sha(d.token))) throw new Error('bad id or token');
  return r;
}

/* =====================================================================
   КАБІНЕТ (лише з сесією)
   ===================================================================== */
function list() {
  const sh = sheet(), vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.filter(r => r[0]).map(r => { const o = {}; head.forEach((k, i) => { if (k !== 'token' && k !== 'folderId') o[k] = r[i] instanceof Date ? r[i].toISOString() : uncell(r[i]); }); return o; }).reverse();
}

function get(id) {
  const r = findRow(str(id, 40));
  if (!r) throw new Error('not found');
  const folder = DriveApp.getFolderById(r.obj.folderId);
  let record = {};
  const js = folder.getFilesByName('brief.json');
  if (js.hasNext()) record = JSON.parse(js.next().getBlob().getDataAsString());
  const files = [];
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next(), it = sub.getFiles();
    while (it.hasNext()) { const f = it.next(); files.push({ field: sub.getName(), label: f.getDescription() || sub.getName(), name: f.getName(), size: f.getSize(), type: f.getMimeType(), url: f.getUrl() }); }
  }
  const row = {}; Object.keys(r.obj).forEach(k => { if (k !== 'token' && k !== 'folderId') row[k] = uncell(r.obj[k]); });
  return { ok: true, row, record, files, folderUrl: folder.getUrl() };
}

function update(d) {
  const r = findRow(str(d.id, 40));
  if (!r) throw new Error('not found');
  const sh = sheet();
  if (d.status != null) { if (validStatuses().indexOf(d.status) < 0) throw new Error('bad status'); sh.getRange(r.row, COLS.indexOf('status') + 1).setValue(d.status); }
  if (d.notes != null) sh.getRange(r.row, COLS.indexOf('notes') + 1).setValue(cell(String(d.notes).slice(0, 20000)));
  sh.getRange(r.row, COLS.indexOf('updated') + 1).setValue(new Date().toISOString());
  return { ok: true };
}

/* ---------- колонки воронки ---------- */
function getStages() {
  const raw = props().getProperty('STAGES');
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
const TONES = ['acid', 'blue', 'peach', 'mint', 'stone', 'lav', 'rose', 'sand', 'line'];
function saveStages(stages) {
  if (!Array.isArray(stages) || !stages.length || stages.length > 30) throw new Error('bad stages');
  const seen = {};
  const list = stages.map(s => ({
    id: String(s && s.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40),
    name: str(s && s.name, 40), hint: str(s && s.hint, 60),
    tone: TONES.indexOf(s && s.tone) >= 0 ? s.tone : 'line'
  })).filter(s => s.id && s.name && s.id !== 'archive' && !seen[s.id] && (seen[s.id] = true));
  if (!list.some(s => s.id === 'new')) throw new Error('stage "new" is required');
  props().setProperty('STAGES', JSON.stringify(list));
  return { ok: true };
}
function validStatuses() {
  const st = getStages();
  return (st ? st.map(s => s.id) : STATUSES).concat(['archive']);
}

/* =====================================================================
   ДОПОМІЖНЕ
   ===================================================================== */
function props() { return PropertiesService.getScriptProperties(); }
function cache() { return CacheService.getScriptCache(); }
function pendingOtps() { try { return JSON.parse(cache().get('OTPS') || '[]').filter(x => x.exp > Date.now()); } catch (e) { return []; } }
function saveOtps(list) { cache().put('OTPS', JSON.stringify(list.slice(-5)), SEC.OTP_TTL_S); }
function withLock(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function sheet() {
  const id = props().getProperty('SHEET_ID');
  if (!id) throw new Error('not configured');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}
function root() { return DriveApp.getFolderById(props().getProperty('ROOT_FOLDER')); }
function findRow(id) {
  if (!id) return null;
  const sh = sheet(), vals = sh.getDataRange().getValues(), head = vals[0];
  for (let i = vals.length - 1; i > 0; i--) if (String(vals[i][0]) === String(id)) {
    const obj = {}; head.forEach((k, j) => obj[k] = vals[i][j] instanceof Date ? vals[i][j].toISOString() : vals[i][j]);
    return { row: i + 1, obj };
  }
  return null;
}
function rateLimit(kind, perHour) {
  const k = 'RL:' + kind + ':' + Math.floor(Date.now() / 3600000);
  const n = (+cache().get(k) || 0) + 1;
  if (n > perHour) throw new Error('too many requests');
  cache().put(k, String(n), 3700);
}
function audit(event, detail) {
  try {
    const ss = SpreadsheetApp.openById(props().getProperty('SHEET_ID'));
    let sh = ss.getSheetByName(LOG_SHEET);
    if (!sh) { sh = ss.insertSheet(LOG_SHEET); sh.appendRow(['час', 'подія', 'деталі']); sh.setFrozenRows(1); }
    sh.appendRow([now(), event, cell(String(detail || '').slice(0, 300))]);
  } catch (e) { /* журнал не критичний */ }
}
function notify(subject, html) {
  try {
    const to = props().getProperty('NOTIFY_EMAIL');
    if (to) MailApp.sendEmail({ to, subject, htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">' + html + '</div>' });
  } catch (e) { /* без листа вхід не зупиняємо, крім 2FA — там код потрібен */ if (/Код входу/.test(subject)) throw new Error('mail failed'); }
}
function publicError(err) {
  const m = String(err && err.message || err);
  // назовні — лише короткі коди, без деталей реалізації
  const known = ['unauthorized', 'bad code', 'bad otp', 'expired', 'not configured', 'payload too large', 'bad request', 'name and email required', 'bad email',
    'too many requests', 'bad id or token', 'upload window closed', 'file too large', 'too many files', 'not found', 'bad status', 'bad stages', 'stage "new" is required', 'unknown action', 'mail failed'];
  if (/^locked:\d+$/.test(m)) return m;
  return known.indexOf(m) >= 0 ? m : 'server error';
}
function randomToken() {
  const seed = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed)).replace(/=+$/, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}
function randomDigits(n) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  let s = ''; for (let i = 0; s.length < n; i++) { const v = b[i % b.length] & 255; if (v < 250) s += v % 10; }
  return s;
}
function sha(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))); }
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return r === 0;
}
function ua(d) { return str(d && d.ua, 200) || 'невідомий пристрій'; }
function now() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function maskEmail(e) { e = String(e || ''); const [u, h] = e.split('@'); return h ? u.slice(0, 2) + '•••@' + h : ''; }
function str(v, max) { return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max); }
/** Захист таблиці від формул: текст, що починається з = + - @, зберігається як текст. */
function cell(v) { return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }
function uncell(v) { return v; }
function safeMime(t) { t = String(t || ''); return /^[a-z]+\/[a-z0-9.+-]{1,80}$/i.test(t) && !/html|javascript|xml/i.test(t) ? t : 'application/octet-stream'; }
function plain(s) { return String(s || '').replace(/[\r\n]+/g, ' '); }
function clean(s) { return String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
