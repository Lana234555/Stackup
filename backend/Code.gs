/**
 * STACKUP. — приймальня брифів (Google Apps Script)
 *
 * Що робить:
 *  - приймає брифи з brief.html: створює папку на вашому Google Drive,
 *    зберігає туди бриф (brief.html, brief.json) і всі файли клієнта;
 *  - веде таблицю «Stackup — Заявки» (Google Sheets);
 *  - надсилає вам лист про кожну нову заявку;
 *  - віддає дані кабінету admin.html (лише з вашим ключем).
 *
 * Налаштування — див. backend/README.md (один раз, ~5 хв).
 */

const ROOT_NAME = 'Stackup — Брифи';
const SHEET_NAME = 'Заявки';
const COLS = ['id', 'created', 'status', 'name', 'company', 'email', 'phone', 'mode', 'type', 'deadline', 'budget', 'files', 'folderId', 'notes', 'token', 'updated'];
const STATUSES = ['new', 'review', 'quoted', 'work', 'done', 'archive'];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/* ---------- одноразове налаштування: запустіть setup() у редакторі ---------- */
function setup() {
  const p = PropertiesService.getScriptProperties();
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
  let key = p.getProperty('ADMIN_KEY');
  if (!key) key = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  p.setProperties({ ROOT_FOLDER: folderId, SHEET_ID: ssId, ADMIN_KEY: key });
  if (!p.getProperty('NOTIFY_EMAIL')) p.setProperty('NOTIFY_EMAIL', Session.getEffectiveUser().getEmail());
  Logger.log('Готово. Ваш ключ для кабінету: ' + key);
  Logger.log('Папка: ' + DriveApp.getFolderById(folderId).getUrl());
  Logger.log('Таблиця: ' + SpreadsheetApp.openById(ssId).getUrl());
}

/* ---------- http ---------- */
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.website) return out({ ok: true }); // honeypot: боти заповнюють приховане поле
    switch (d.action) {
      case 'submit': return out(submit(d));
      case 'file': return out(addFile(d));
      case 'finish': return out(finish(d));
      case 'update': auth(d.key); return out(update(d));
      case 'stages': auth(d.key); return out(saveStages(d.stages));
      default: return out({ ok: false, error: 'unknown action' });
    }
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

function doGet(e) {
  try {
    const q = e.parameter || {};
    if (q.action === 'ping') return out({ ok: true, app: 'stackup-briefs' });
    auth(q.key);
    if (q.action === 'list') return out({ ok: true, items: list(), stages: getStages() });
    if (q.action === 'get') return out(get(q.id));
    return out({ ok: false, error: 'unknown action' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

/* ---------- приймання брифу ---------- */
function submit(d) {
  const c = d.client || {};
  if (!c.name || !c.email) throw new Error('name and email required');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const id = Utilities.formatDate(new Date(), 'Etc/GMT', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    const token = Utilities.getUuid();
    const label = [Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), c.company || c.name, id].join(' · ');
    const folder = root().createFolder(clean(label));
    const record = {
      id, created: new Date().toISOString(), mode: d.mode, lang: d.lang,
      client: c, summary: d.summary || {}, estimate: d.estimate || [], sections: d.sections || [], answers: d.answers || {}
    };
    folder.createFile('brief.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
    if (d.html) folder.createFile('brief.html', d.html, MimeType.HTML);
    const s = d.summary || {};
    const row = { id, created: record.created, status: 'new', name: c.name, company: c.company || '', email: c.email, phone: c.phone || '',
      mode: d.mode, type: s.type || '', deadline: s.deadline || '', budget: s.budget || '', files: d.fileCount || 0, folderId: folder.getId(), notes: '', token, updated: record.created };
    sheet().appendRow(COLS.map(k => row[k]));
    return { ok: true, id, token };
  } finally { lock.releaseLock(); }
}

function addFile(d) {
  const r = findRow(d.id);
  if (!r || r.obj.token !== d.token) throw new Error('bad id or token');
  const bytes = Utilities.base64Decode(d.data);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('file too large');
  const folder = DriveApp.getFolderById(r.obj.folderId);
  const sub = folder.getFoldersByName(clean(d.field || 'files'));
  const dir = sub.hasNext() ? sub.next() : folder.createFolder(clean(d.field || 'files'));
  const blob = Utilities.newBlob(bytes, d.type || 'application/octet-stream', clean(d.name || 'file'));
  const f = dir.createFile(blob);
  if (d.fieldLabel) f.setDescription(d.fieldLabel);
  return { ok: true, fileId: f.getId() };
}

function finish(d) {
  const r = findRow(d.id);
  if (!r || r.obj.token !== d.token) throw new Error('bad id or token');
  try {
    const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    const adminUrl = PropertiesService.getScriptProperties().getProperty('ADMIN_URL') || '';
    if (to) {
      const o = r.obj;
      MailApp.sendEmail({
        to, replyTo: o.email,
        subject: 'Нова заявка Stackup: ' + (o.company || o.name),
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">' +
          '<p style="font-size:22px;font-weight:bold;margin:0 0 12px">STACKUP. Нова заявка</p>' +
          '<p><b>' + esc(o.name) + '</b>' + (o.company ? ' · ' + esc(o.company) : '') + '<br>' + esc(o.email) + (o.phone ? ' · ' + esc(o.phone) : '') + '</p>' +
          '<p>' + (o.mode === 'has' ? 'Надіслав(ла) готове ТЗ' : 'Створив(ла) ТЗ у брифі') + (o.type ? ' · ' + esc(o.type) : '') + (o.deadline ? ' · ' + esc(o.deadline) : '') + (o.budget ? ' · ' + esc(o.budget) : '') + '</p>' +
          '<p>Файлів: ' + (d.fileCount != null ? d.fileCount : o.files) + '</p>' +
          (adminUrl ? '<p><a href="' + adminUrl + '#' + o.id + '" style="background:#ceff31;color:#181917;padding:10px 16px;text-decoration:none;font-weight:bold">Відкрити в кабінеті ↗</a></p>' : '') +
          '<p><a href="' + DriveApp.getFolderById(o.folderId).getUrl() + '">Папка на Google Drive</a></p></div>'
      });
    }
  } catch (e) { /* лист не критичний */ }
  return { ok: true };
}

/* ---------- кабінет ---------- */
function list() {
  const sh = sheet(), vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.filter(r => r[0]).map(r => { const o = {}; head.forEach((k, i) => { if (k !== 'token') o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; }).reverse();
}

function get(id) {
  const r = findRow(id);
  if (!r) throw new Error('not found');
  const folder = DriveApp.getFolderById(r.obj.folderId);
  let record = {};
  const js = folder.getFilesByName('brief.json');
  if (js.hasNext()) record = JSON.parse(js.next().getBlob().getDataAsString());
  const files = [];
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next(), it = sub.getFiles();
    while (it.hasNext()) { const f = it.next(); files.push({ field: sub.getName(), label: f.getDescription() || sub.getName(), name: f.getName(), size: f.getSize(), type: f.getMimeType(), url: f.getUrl(), id: f.getId() }); }
  }
  const row = Object.assign({}, r.obj); delete row.token;
  return { ok: true, row, record, files, folderUrl: folder.getUrl() };
}

function update(d) {
  const r = findRow(d.id);
  if (!r) throw new Error('not found');
  const sh = sheet();
  if (d.status != null) { if (validStatuses().indexOf(d.status) < 0) throw new Error('bad status'); sh.getRange(r.row, COLS.indexOf('status') + 1).setValue(d.status); }
  if (d.notes != null) sh.getRange(r.row, COLS.indexOf('notes') + 1).setValue(String(d.notes).slice(0, 20000));
  sh.getRange(r.row, COLS.indexOf('updated') + 1).setValue(new Date().toISOString());
  return { ok: true };
}

/* ---------- колонки воронки ---------- */
function getStages() {
  const raw = PropertiesService.getScriptProperties().getProperty('STAGES');
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function saveStages(stages) {
  if (!Array.isArray(stages) || !stages.length || stages.length > 30) throw new Error('bad stages');
  const clean = stages.map(s => ({ id: String(s.id).slice(0, 40), name: String(s.name).slice(0, 40), hint: String(s.hint || '').slice(0, 60), tone: String(s.tone || 'line').slice(0, 12) }))
    .filter(s => s.id && s.name && s.id !== 'archive');
  if (!clean.some(s => s.id === 'new')) throw new Error('stage "new" is required');
  PropertiesService.getScriptProperties().setProperty('STAGES', JSON.stringify(clean));
  return { ok: true };
}
function validStatuses() {
  const st = getStages();
  return (st ? st.map(s => s.id) : STATUSES).concat(['archive']);
}

/* ---------- helpers ---------- */
function auth(key) {
  const k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!k || key !== k) throw new Error('unauthorized');
}
function sheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('run setup() first');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}
function root() { return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER')); }
function findRow(id) {
  if (!id) return null;
  const sh = sheet(), vals = sh.getDataRange().getValues(), head = vals[0];
  for (let i = vals.length - 1; i > 0; i--) if (String(vals[i][0]) === String(id)) {
    const obj = {}; head.forEach((k, j) => obj[k] = vals[i][j] instanceof Date ? vals[i][j].toISOString() : vals[i][j]);
    return { row: i + 1, obj };
  }
  return null;
}
function clean(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
