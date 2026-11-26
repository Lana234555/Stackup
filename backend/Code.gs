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
      // публічне: коротка заявка з форми на головній (ім'я, email, телефон)
      case 'lead': return out(lead(d));
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
      // контент і Instagram
      case 'content': requireSession(d); return out(contentState());
      case 'contentUpdate': requireSession(d); return out(contentUpdate(d));
      case 'publishNow': requireSession(d); return out(publishNowAction(d));
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
    try { telegram('🔒 <b>CRM: забагато невдалих спроб входу</b>\nВхід заблоковано на ' + mins + ' хв. Якщо це не ви, змініть код кабінету.'); } catch (e) {}
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

/* =====================================================================
   КОРОТКА ЗАЯВКА З ГОЛОВНОЇ (публічне): ім'я, email, телефон
   ===================================================================== */
function lead(d) {
  const name = str(d.name, 200), email = str(d.email, 200), phone = str(d.phone, 80);
  if (!name || !email || !phone) throw new Error('name, email and phone required');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('bad email');
  rateLimit('lead', SEC.SUBMITS_PER_HOUR);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let id;
  try {
    id = Utilities.formatDate(new Date(), 'Etc/GMT', 'yyMMdd') + '-' + randomToken().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
    const now = new Date().toISOString();
    const row = { id, created: now, status: 'new', name, company: '', email, phone, mode: 'lead', type: 'Заявка з сайту', deadline: '', budget: '', files: 0,
      folderId: '', notes: '', token: '', updated: now };
    sheet().appendRow(COLS.map(k => cell(row[k])));
  } finally { lock.releaseLock(); }
  const p = props(), adminUrl = p.getProperty('ADMIN_URL') || '', link = /^https:\/\//.test(adminUrl) ? adminUrl + '#' + id : '';
  try {
    telegram('🔥 <b>Нова заявка з сайту</b>\n\n👤 ' + esc(name) + '\n✉️ ' + esc(email) + '\n📞 ' + esc(phone) +
      '\n\n<i>stackup.studio · форма «Let’s build it»</i>', link);
  } catch (e) { /* сповіщення не критичне */ }
  try {
    const to = p.getProperty('NOTIFY_EMAIL');
    if (to) MailApp.sendEmail({ to, replyTo: email, subject: 'Нова заявка з сайту: ' + plain(name).slice(0, 80),
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6"><p style="font-size:22px;font-weight:bold;margin:0 0 12px">STACKUP. Нова заявка з сайту</p>' +
        '<p><b>' + esc(name) + '</b><br>' + esc(email) + '<br>' + esc(phone) + '</p>' +
        (link ? '<p><a href="' + esc(link) + '" style="background:#ceff31;color:#181917;padding:10px 16px;text-decoration:none;font-weight:bold">Відкрити в кабінеті ↗</a></p>' : '') + '</div>' });
  } catch (e) { /* лист не критичний */ }
  return { ok: true, id };
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
  try {
    const o = r.obj, adminUrl = props().getProperty('ADMIN_URL') || '';
    telegram('🟢 <b>Нова заявка</b>\n' + esc(o.name) + (o.company ? ' · ' + esc(o.company) : '') +
      '\n' + esc(o.email) + (o.phone ? ' · ' + esc(o.phone) : '') +
      '\n' + (o.mode === 'has' ? 'Готове ТЗ' : 'ТЗ з брифу') + (o.type ? ' · ' + esc(o.type) : '') + (o.budget ? ' · ' + esc(o.budget) : '') + (o.deadline ? ' · ' + esc(o.deadline) : ''),
      /^https:\/\//.test(adminUrl) ? adminUrl + '#' + o.id : '');
  } catch (e) { /* сповіщення не критичне */ }
  return { ok: true };
}

/* ---------- сповіщення в Telegram (миттєві push на телефон) ----------
   1) У Telegram напишіть @BotFather → /newbot → отримаєте токен бота.
   2) Властивості скрипта: TG_TOKEN = цей токен.
   3) Напишіть своєму боту будь-що (наприклад /start).
   4) Запустіть connectTelegram() у редакторі — бот надішле «Підключено». */
function connectTelegram() {
  const p = props(), raw = p.getProperty('TG_TOKEN');
  if (!raw) throw new Error('Спершу додайте властивість TG_TOKEN (токен від @BotFather).');
  const token = String(raw).replace(/^\s*["']?|["']?\s*$/g, '').replace(/\s+/g, '');
  if (token !== raw) p.setProperty('TG_TOKEN', token); // прибрали пробіли/лапки
  if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error('TG_TOKEN має вигляд 1234567890:AA… Скопіюйте його з @BotFather повністю.');
  const api = m => JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + m, { muteHttpExceptions: true }).getContentText());
  const me = api('getMe');
  if (!me.ok) throw new Error('Telegram не прийняв токен (' + (me.description || 'невідома помилка') + '). Скопіюйте токен з @BotFather ще раз.');
  const bot = '@' + me.result.username;
  Logger.log('Токен належить боту ' + bot);
  const wh = api('getWebhookInfo');
  if (wh.ok && wh.result && wh.result.url) { api('deleteWebhook'); Logger.log('Вимкнено старий webhook бота.'); }
  const res = api('getUpdates');
  if (!res.ok) throw new Error('Telegram: ' + (res.description || 'getUpdates не спрацював') + '. Запустіть connectTelegram() ще раз.');
  const msgs = (res.result || []).map(u => u.message || u.edited_message).filter(m => m && m.chat && m.chat.type === 'private');
  if (!msgs.length) throw new Error('Токен від бота ' + bot + ', але він ще не отримав повідомлень. Відкрийте саме ' + bot + ' у Telegram, напишіть /start і запустіть connectTelegram() знову.');
  const chat = msgs[msgs.length - 1].chat;
  p.setProperty('TG_CHAT', String(chat.id));
  telegram('✅ Підключено. Сюди приходитимуть нові заявки зі stackup.studio.');
  Logger.log('Telegram підключено: ' + bot + ' → ' + (chat.username || chat.first_name || chat.id));
}
function telegram(html, url) {
  const p = props(), token = p.getProperty('TG_TOKEN'), chat = p.getProperty('TG_CHAT');
  if (!token || !chat) return false;
  const body = { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (url) body.reply_markup = { inline_keyboard: [[{ text: 'Відкрити в CRM ↗', url }]] };
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  return true;
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
  if (!r.obj.folderId) { // коротка заявка з сайту: без папки і файлів
    const row0 = {}; Object.keys(r.obj).forEach(k => { if (k !== 'token' && k !== 'folderId') row0[k] = uncell(r.obj[k]); });
    return { ok: true, row: row0, record: { client: { name: row0.name, email: row0.email, phone: row0.phone } }, files: [], folderUrl: '' };
  }
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
    'too many requests', 'bad id or token', 'upload window closed', 'file too large', 'too many files', 'not found', 'bad status', 'bad stages', 'stage "new" is required', 'unknown action', 'mail failed',
    'bad item', 'bad op', 'bad date', 'locked item', 'instagram not connected'];
  if (/^locked:\d+$/.test(m)) return m;
  if (/^IG: /.test(m)) return m.slice(0, 220);
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

/* =====================================================================
   КОНТЕНТ І INSTAGRAM
   Claude готує пости, каруселі, сторіс і рілс і кладе їх на сайт у /content/
   (manifest.json + картинки). У кабінеті ви затверджуєте або повертаєте на
   правки, а цей скрипт публікує затверджене в Instagram у вказаний час.
   Стан кожної публікації — аркуш «Контент» у таблиці.

   Один раз:
     1) Запустіть setupContent() — створить аркуш і планувальник (кожні 10 хв).
     2) Коли буде токен Instagram: властивість IG_TOKEN = токен,
        запустіть connectInstagram(). Токен оновлюється сам (раз на тиждень).
   ===================================================================== */
const CONTENT_SHEET = 'Контент';
const CCOLS = ['id', 'status', 'at', 'caption', 'comment', 'container', 'children', 'igId', 'permalink', 'publishedAt', 'error', 'tries', 'updated'];
const C_OPS = ['approve', 'changes', 'review', 'skip'];
const IG_API = 'https://graph.instagram.com/v23.0';
const SITE_URL = 'https://stackup.studio';
const PUBLISH_TRIES = 3;

function setupContent() {
  contentSheet();
  ensureContentTriggers();
  Logger.log('Контент підключено: аркуш «' + CONTENT_SHEET + '» і планувальник кожні 10 хв. Instagram: ' + (igConnected() ? '@' + props().getProperty('IG_USERNAME') : 'ще не підключено (див. connectInstagram)'));
}

function ensureContentTriggers() {
  const want = { publishDue: 'min', refreshInstagramToken: 'day' };
  ScriptApp.getProjectTriggers().forEach(t => { if (want[t.getHandlerFunction()]) { ScriptApp.deleteTrigger(t); } });
  ScriptApp.newTrigger('publishDue').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('refreshInstagramToken').timeBased().everyDays(1).atHour(4).create();
}

/** Підключити Instagram: властивість IG_TOKEN = токен із Meta (Instagram API з входом через Instagram). */
function connectInstagram() {
  const p = props(), raw = p.getProperty('IG_TOKEN');
  if (!raw) throw new Error('Спершу додайте властивість IG_TOKEN (токен із кабінету розробника Meta).');
  const tokenValue = String(raw).replace(/^\s*["']?|["']?\s*$/g, '').replace(/\s+/g, '');
  if (tokenValue !== raw) p.setProperty('IG_TOKEN', tokenValue);
  const me = ig('get', '/me', { fields: 'user_id,username,account_type' });
  if (!me.user_id && !me.id) throw new Error('Instagram не повернув акаунт. Перевірте токен.');
  p.setProperties({ IG_USER_ID: String(me.user_id || me.id), IG_USERNAME: String(me.username || ''), IG_TOKEN_AT: String(Date.now()) });
  if (!p.getProperty('IG_TOKEN_EXP')) p.setProperty('IG_TOKEN_EXP', String(Date.now() + 60 * 864e5));
  contentSheet();
  ensureContentTriggers();
  try { refreshInstagramToken(true); } catch (e) { /* свіжий токен ще не можна оновити, спробуємо завтра */ }
  telegram('✅ Instagram підключено: @' + esc(me.username || '') + '. Затверджені пости публікуватимуться самі.');
  Logger.log('Instagram підключено: @' + me.username + ' (' + (me.account_type || 'professional') + ').');
}

/** Довгий токен Instagram діє 60 днів. Оновлюємо раз на тиждень (тригер щодня о 4:00). */
function refreshInstagramToken(force) {
  const p = props();
  if (!p.getProperty('IG_TOKEN')) return;
  const at = +p.getProperty('IG_TOKEN_AT') || 0;
  if (force !== true && Date.now() - at < 7 * 864e5) return;
  try {
    const r = JSON.parse(UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(p.getProperty('IG_TOKEN')), { muteHttpExceptions: true }).getContentText());
    if (!r.access_token) throw new Error(r.error && r.error.message || 'no token');
    p.setProperties({ IG_TOKEN: r.access_token, IG_TOKEN_AT: String(Date.now()), IG_TOKEN_EXP: String(Date.now() + (+r.expires_in || 60 * 86400) * 1000) });
  } catch (e) {
    if (force === true) throw e;
    const exp = +p.getProperty('IG_TOKEN_EXP') || 0;
    if (exp && exp - Date.now() < 10 * 864e5) telegram('⚠️ Не вдалося оновити токен Instagram (' + esc(String(e.message).slice(0, 120)) + '). Він діє до ' + esc(new Date(exp).toISOString().slice(0, 10)) + '. Згенеруйте новий у Meta і запустіть connectInstagram().');
  }
}

function igConnected() { const p = props(); return !!(p.getProperty('IG_TOKEN') && p.getProperty('IG_USER_ID')); }
function igInfo() {
  const p = props();
  return { connected: igConnected(), username: p.getProperty('IG_USERNAME') || '', tokenExp: +p.getProperty('IG_TOKEN_EXP') || 0,
    scheduler: !!p.getProperty('CONTENT_TICK'), lastTick: +p.getProperty('CONTENT_TICK') || 0 };
}

/** Запит до Instagram API. Токен ніколи не виходить за межі скрипта. */
function ig(method, path, params) {
  const p = props(), tokenValue = p.getProperty('IG_TOKEN');
  if (!tokenValue) throw new Error('instagram not connected');
  const q = Object.assign({}, params || {}, { access_token: tokenValue });
  const enc = o => Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
  const res = method === 'get'
    ? UrlFetchApp.fetch(IG_API + path + '?' + enc(q), { muteHttpExceptions: true })
    : UrlFetchApp.fetch(IG_API + path, { method: 'post', payload: q, muteHttpExceptions: true });
  let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw new Error('IG: bad response'); }
  if (j.error) throw new Error('IG: ' + String(j.error.error_user_msg || j.error.message || 'error').slice(0, 200));
  return j;
}

/* ---------- маніфест (що підготував Claude) ---------- */
function contentBase() { return (props().getProperty('CONTENT_URL') || SITE_URL + '/content/').replace(/\/?$/, '/'); }
function manifest(fresh) {
  const c = cache();
  if (!fresh) { const hit = c.get('MANIFEST'); if (hit) return JSON.parse(hit); }
  const res = UrlFetchApp.fetch(contentBase() + 'manifest.json?t=' + Date.now(), { muteHttpExceptions: true });
  const j = JSON.parse(res.getContentText());
  const items = (j.items || []).filter(x => x && /^[a-z0-9-]{1,80}$/.test(x.id));
  const s = JSON.stringify({ items });
  if (s.length < 90000) c.put('MANIFEST', s, 300);
  return { items };
}
function mediaUrl(path) {
  path = String(path || '');
  if (!/^[a-z0-9][a-z0-9\/._-]{0,200}$/i.test(path) || path.indexOf('..') >= 0) throw new Error('bad media path');
  return contentBase() + path;
}

/* ---------- аркуш стану ---------- */
function contentSheet() {
  const ss = SpreadsheetApp.openById(props().getProperty('SHEET_ID'));
  let sh = ss.getSheetByName(CONTENT_SHEET);
  if (!sh) { sh = ss.insertSheet(CONTENT_SHEET); sh.appendRow(CCOLS); sh.setFrozenRows(1); }
  return sh;
}
function contentRows() {
  const vals = contentSheet().getDataRange().getValues(), head = vals[0] || CCOLS, map = {};
  for (let i = 1; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    const o = {}; head.forEach((k, j) => o[k] = vals[i][j] instanceof Date ? vals[i][j].toISOString() : vals[i][j]);
    map[String(o.id)] = { row: i + 1, obj: o };
  }
  return map;
}
function saveContent(r, patch) {
  const sh = contentSheet();
  const o = Object.assign({}, r ? r.obj : {}, patch, { updated: new Date().toISOString() });
  const values = CCOLS.map(k => cell(o[k] == null ? '' : o[k]));
  if (r) sh.getRange(r.row, 1, 1, CCOLS.length).setValues([values]);
  else sh.appendRow(values);
  return o;
}
function publicState(o) {
  const x = {}; ['status', 'at', 'caption', 'comment', 'igId', 'permalink', 'publishedAt', 'error', 'updated'].forEach(k => { x[k] = o[k] == null ? '' : String(o[k]); });
  return x;
}

/* ---------- кабінет ---------- */
function contentState() {
  const rows = contentRows(), state = {};
  Object.keys(rows).forEach(id => { state[id] = publicState(rows[id].obj); });
  return { ok: true, state, ig: igInfo() };
}

function contentUpdate(d) {
  const id = str(d.id, 80);
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('bad item');
  if (C_OPS.indexOf(d.op) < 0) throw new Error('bad op');
  return withLock(() => {
    const r = contentRows()[id];
    if (r && ['published', 'publishing'].indexOf(String(r.obj.status)) >= 0) throw new Error('locked item');
    const patch = { id };
    if (d.caption != null) patch.caption = str(d.caption, 2200);
    if (d.op === 'approve') {
      const t = new Date(String(d.at || ''));
      if (isNaN(t) || t.getFullYear() < 2024 || t.getFullYear() > 2100) throw new Error('bad date');
      Object.assign(patch, { status: 'scheduled', at: t.toISOString(), comment: '', error: '', tries: 0 });
    } else if (d.op === 'changes') {
      const c = str(d.comment, 2000);
      if (!c) throw new Error('bad request');
      Object.assign(patch, { status: 'changes', comment: c });
    } else if (d.op === 'review') {
      Object.assign(patch, { status: 'review', error: '' });
    } else {
      Object.assign(patch, { status: 'skipped' });
    }
    return { ok: true, id, state: publicState(saveContent(r, patch)) };
  });
}

function publishNowAction(d) {
  const id = str(d.id, 80);
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('bad item');
  if (!igConnected()) throw new Error('instagram not connected');
  contentUpdate({ id, op: 'approve', at: new Date().toISOString(), caption: d.caption });
  const m = manifest(true), item = m.items.filter(x => x.id === id)[0];
  const lock = LockService.getScriptLock(); lock.waitLock(30000); // не разом із планувальником
  try { advanceContent(contentRows()[id], item, true); } finally { lock.releaseLock(); }
  return { ok: true, id, state: publicState(contentRows()[id].obj) };
}

/* ---------- планувальник (тригер кожні 10 хв) ---------- */
function publishDue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    props().setProperty('CONTENT_TICK', String(Date.now()));
    let m;
    try { m = manifest(true); } catch (e) { return; }
    announceNewContent(m);
    if (!igConnected()) return;
    const rows = contentRows(), nowMs = Date.now();
    const due = Object.keys(rows).map(k => rows[k]).filter(r => {
      const st = String(r.obj.status);
      return st === 'publishing' || (st === 'scheduled' && new Date(r.obj.at).getTime() <= nowMs);
    }).sort((a, b) => new Date(a.obj.at) - new Date(b.obj.at)).slice(0, 3);
    due.forEach(r => advanceContent(r, m.items.filter(x => x.id === r.obj.id)[0], false));
  } finally { lock.releaseLock(); }
}

/** Повідомити в Telegram, коли Claude додав нові публікації на затвердження. */
function announceNewContent(m) {
  const p = props();
  let known; try { known = JSON.parse(p.getProperty('CONTENT_KNOWN') || 'null'); } catch (e) { known = null; }
  const ids = m.items.map(x => x.id);
  if (known) {
    const fresh = m.items.filter(x => known.indexOf(x.id) < 0);
    if (fresh.length) {
      const adminUrl = p.getProperty('ADMIN_URL') || '';
      telegram('🆕 <b>Нове на затвердження: ' + fresh.length + '</b>\n' + fresh.slice(0, 8).map(x => '• ' + esc(String(x.title || x.id).slice(0, 80))).join('\n'),
        /^https:\/\//.test(adminUrl) ? adminUrl + '?s=content' : '');
    }
  }
  p.setProperty('CONTENT_KNOWN', JSON.stringify(ids.slice(-400)));
}

/** Крок публікації. Картинки зазвичай виходять за один запуск, відео (рілс) — за кілька. */
function advanceContent(r, item, interactive) {
  r = contentRows()[r.obj.id] || r; // свіжий стан: публікацію могли вже завершити
  const o = r.obj;
  if (['scheduled', 'publishing'].indexOf(String(o.status)) < 0) return;
  try {
    if (!item) throw new Error('публікації немає в manifest.json');
    if (String(o.status) === 'scheduled') startPublish(r, item);
    const cur = contentRows()[o.id];
    if (String(cur.obj.status) === 'publishing') finishPublish(cur, item, interactive);
  } catch (e) {
    const tries = (+o.tries || 0) + 1, msg = String(e && e.message || e).slice(0, 300);
    const cur = contentRows()[o.id];
    const final = tries >= PUBLISH_TRIES || /немає в manifest|bad media/.test(msg);
    saveContent(cur, { status: final ? 'failed' : 'scheduled', error: msg, tries, container: final ? '' : cur.obj.container });
    if (final) {
      const adminUrl = props().getProperty('ADMIN_URL') || '';
      telegram('❌ <b>Не вдалося опублікувати</b>: ' + esc(item ? item.title : o.id) + '\n' + esc(msg), /^https:\/\//.test(adminUrl) ? adminUrl + '?s=content' : '');
    }
    if (interactive) throw e;
  }
}

function captionOf(o, item) { return String(o.caption || item.caption || '').slice(0, 2200); }

function startPublish(r, item) {
  const o = r.obj, uid = props().getProperty('IG_USER_ID'), media = (item.media || []).map(mediaUrl);
  let container = '', children = '';
  if (item.kind === 'stories') {
    // кожен кадр — окрема сторіс; children = скільки вже опубліковано
    return saveContent(r, { status: 'publishing', container: '', children: String(+o.children || 0) });
  }
  if (item.kind === 'reel') {
    container = ig('post', '/' + uid + '/media', { media_type: 'REELS', video_url: mediaUrl(item.video), caption: captionOf(o, item), share_to_feed: 'true' }).id;
  } else if (item.kind === 'carousel' && media.length > 1) {
    const ids = media.slice(0, 10).map(u => ig('post', '/' + uid + '/media', { image_url: u, is_carousel_item: 'true' }).id);
    waitContainers(ids, 6);
    children = ids.join(',');
    container = ig('post', '/' + uid + '/media', { media_type: 'CAROUSEL', children, caption: captionOf(o, item) }).id;
  } else {
    container = ig('post', '/' + uid + '/media', { image_url: media[0], caption: captionOf(o, item) }).id;
  }
  saveContent(r, { status: 'publishing', container, children, error: '' });
}

function waitContainers(ids, rounds) {
  for (let i = 0; i < rounds; i++) {
    const st = ids.map(id => String(ig('get', '/' + id, { fields: 'status_code' }).status_code || ''));
    if (st.some(s => s === 'ERROR' || s === 'EXPIRED')) throw new Error('IG: Instagram не прийняв файл');
    if (st.every(s => s === 'FINISHED' || s === 'PUBLISHED')) return true;
    Utilities.sleep(4000);
  }
  return false;
}

function finishPublish(r, item, interactive) {
  const o = r.obj, uid = props().getProperty('IG_USER_ID');
  if (item.kind === 'stories') {
    const media = (item.media || []).map(mediaUrl);
    let done = +o.children || 0, last = o.igId;
    for (; done < media.length; done++) {
      const c = ig('post', '/' + uid + '/media', { media_type: 'STORIES', image_url: media[done] }).id;
      waitContainers([c], 6);
      last = ig('post', '/' + uid + '/media_publish', { creation_id: c }).id;
      saveContent(contentRows()[o.id], { children: String(done + 1), igId: last });
    }
    return published(contentRows()[o.id], item, last);
  }
  const ready = waitContainers([o.container], item.kind === 'reel' ? (interactive ? 10 : 3) : 6);
  if (!ready) {
    if (Date.now() - new Date(o.updated).getTime() > 20 * 3600 * 1000) throw new Error('IG: відео обробляється занадто довго');
    return; // наступний запуск продовжить
  }
  const id = ig('post', '/' + uid + '/media_publish', { creation_id: o.container }).id;
  published(contentRows()[o.id], item, id);
}

function published(r, item, mediaId) {
  let link = '';
  try { link = String(ig('get', '/' + mediaId, { fields: 'permalink' }).permalink || ''); } catch (e) { /* посилання не критичне */ }
  saveContent(r, { status: 'published', igId: String(mediaId || ''), permalink: link, publishedAt: new Date().toISOString(), error: '', container: '' });
  telegram('📣 <b>Опубліковано в Instagram</b>: ' + esc(item.title || item.id) + (item.kind === 'stories' && item.highlight ? '\nДодайте в хайлайт «' + esc(item.highlight) + '».' : ''), /^https:\/\//.test(link) ? link : '');
}
