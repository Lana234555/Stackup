// Minimal Google Apps Script runtime mock to run backend/Code.gs in Node.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

function create(codePath) {
  const clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;
  const props = {};
  const cacheStore = {};
  const mails = [];
  const logs = [];
  let idn = 0;
  const signed = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  const toBuf = v => Array.isArray(v) ? Buffer.from(v.map(b => b & 255)) : Buffer.from(String(v), 'utf8');

  // Drive
  const drive = {};
  function mkFolder(name) {
    const id = 'F' + (++idn);
    const f = { id, name, folders: [], files: [] };
    drive[id] = f;
    return folderApi(f);
  }
  function fileApi(x) { return { getId: () => x.id, getName: () => x.name, getSize: () => x.bytes.length, getMimeType: () => x.type, getUrl: () => 'https://drive.google.com/file/d/' + x.id, setDescription: d => { x.desc = d; }, getDescription: () => x.desc || '', getBlob: () => ({ getDataAsString: () => x.bytes.toString('utf8') }), moveTo() {} }; }
  function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
  function folderApi(f) {
    return {
      getId: () => f.id, getName: () => f.name, setTrashed: v => { f.trashed = v; }, getUrl: () => 'https://drive.google.com/drive/folders/' + f.id,
      createFolder: n => { const c = mkFolder(n); f.folders.push(c); return c; },
      getFoldersByName: n => iter(f.folders.filter(c => drive[c.getId()].name === n)),
      getFolders: () => iter(f.folders),
      createFile: (a, b, c) => {
        let x;
        if (typeof a === 'string') x = { id: 'D' + (++idn), name: a, bytes: Buffer.from(b), type: c };
        else x = { id: 'D' + (++idn), name: a.name, bytes: Buffer.from(a.bytes.map(v => v & 255)), type: a.type };
        f.files.push(x); return fileApi(x);
      },
      getFilesByName: n => iter(f.files.filter(x => x.name === n).map(fileApi)),
      getFiles: () => iter(f.files.map(fileApi))
    };
  }
  // Sheets: values stored as written; leading ' is a text marker (stripped on read like Sheets does)
  const sheets = {};
  function sheetApi(name) {
    const rows = sheets[name];
    return {
      setName() {}, setFrozenRows() {}, deleteRow: i => rows.splice(i - 1, 1),
      appendRow: r => rows.push(r.map(v => (typeof v === 'string' && v[0] === "'") ? { text: v.slice(1) } : v)),
      getDataRange: () => ({ getValues: () => rows.map(r => r.map(v => v && v.text != null ? v.text : (typeof v === 'string' && /^=/.test(v) ? '#FORMULA:' + v : v))) }),
      getRange: (r, c) => ({ setValue: v => { rows[r - 1][c - 1] = (typeof v === 'string' && v[0] === "'") ? { text: v.slice(1) } : v; }, setValues(v) { rows[r - 1] = v[0].slice(); return this; }, setFontWeight() { return this; } }),
      raw: rows
    };
  }
  const ss = { getId: () => 'SS1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SS1', getSheets: () => [sheetApi('Заявки')], getSheetByName: n => sheets[n] ? sheetApi(n) : null, insertSheet: n => { sheets[n] = []; return sheetApi(n); } };

  const ctx = {
    console,
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } },
    Math, JSON, String, Number, Array, Object, Error, parseInt, RegExp, Buffer,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, setProperties: o => Object.keys(o).forEach(k => props[k] = String(o[k])), deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cacheStore[k]; if (!e) return null; if (e.exp < now()) { delete cacheStore[k]; return null; } return e.v; },
      put: (k, v, ttl) => { cacheStore[k] = { v: String(v), exp: now() + Math.min(ttl || 600, 21600) * 1000 }; },
      remove: k => { delete cacheStore[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, v) => signed(crypto.createHash('sha256').update(toBuf(v)).digest()),
      computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
      base64Encode: v => toBuf(v).toString('base64'),
      base64EncodeWebSafe: v => toBuf(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: s => signed(Buffer.from(s, 'base64')),
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      formatDate: (d, tz, f) => { const x = new Date(d); const p = n => String(n).padStart(2, '0'); return f.replace('yyyy', x.getUTCFullYear()).replace('yy', String(x.getUTCFullYear()).slice(2)).replace('MM', p(x.getUTCMonth() + 1)).replace('dd', p(x.getUTCDate())).replace('HH', p(x.getUTCHours())).replace('mm', p(x.getUTCMinutes())).replace('ss', p(x.getUTCSeconds())); },
      newBlob: (bytes, type, name) => ({ bytes: typeof bytes === 'string' ? signed(Buffer.from(bytes)) : bytes, type, name, getBytes() { return this.bytes; } })
    },
    MailApp: { sendEmail: o => mails.push(o) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'lana@example.com' }), getScriptTimeZone: () => 'Etc/GMT' },
    DriveApp: { createFolder: n => mkFolder(n), getFolderById: id => folderApi(drive[id]), getFileById: () => ({ moveTo() {} }) },
    SpreadsheetApp: { create: () => { sheets['Заявки'] = []; return ss; }, openById: () => ss },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    MimeType: { PLAIN_TEXT: 'text/plain', HTML: 'text/html' },
    Logger: { log: m => logs.push(m) }
  };
  vm.createContext(ctx);
  [].concat(codePath).forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: require('path').basename(f) }));
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  const get = params => JSON.parse(ctx.doGet({ parameter: params }).t);
  return { ctx, props, cacheStore, mails, logs, sheets, drive, clock, post, get };
}
module.exports = { create };
