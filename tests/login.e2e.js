// End-to-end: real admin.html in Chromium against Code.gs running on a mock Apps Script runtime.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { create } = require('./gas-mock');
const REPO = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const API = 8791, WEB = 8792;

const g = create(path.join(REPO, 'backend/Code.gs'));
g.props.NEW_CODE = '48271593'; g.ctx.setup();
const otp = () => (g.mails.filter(m => /Код входу/.test(m.subject)).pop().subject.match(/(\d{6})$/) || [])[1];

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__clock') { g.clock.offset += +u.searchParams.get('add'); return res.end('{}'); }
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (req.method === 'POST') return res.end(JSON.stringify(g.post(b)));
    res.end(JSON.stringify(g.get(Object.fromEntries(u.searchParams))));
  });
}).listen(API);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  if (p === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(`window.STACKUP={endpoint:'http://localhost:${API}/exec',email:'hello@stackup.dev'};`); }
  if (p === '/frame.html') { res.setHeader('Content-Type', 'text/html'); return res.end(`<h1>evil</h1><iframe id=f src="http://127.0.0.1:${WEB}/admin.html" width=800 height=600></iframe>`); }
  const f = path.join(REPO, p);
  if (!f.startsWith(REPO) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nf'); }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
  if (ext === '.html') body = String(body).replace('connect-src https://script.google.com', `connect-src http://localhost:${API} https://script.google.com`);
  res.end(body);
}).listen(WEB);

const results = []; let fails = 0;
async function t(name, fn) { try { await fn(); results.push('✓ ' + name); } catch (e) { fails++; results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const URL_ = `http://localhost:${WEB}/admin.html`;

(async () => {
  // seed a malicious brief (XSS attempts) through the public API
  const sub = g.post({ action: 'submit', mode: 'none', website: '', fileCount: '<img src=x onerror=alert(1)>',
    client: { name: '<img src=x onerror=alert("name")>', email: 'x@evil.co', company: '"><svg onload=alert(2)>', phone: '+380' },
    summary: { type: '<script>alert(3)</script>', budget: "'-alert(4)-'", deadline: '`${alert(5)}`' },
    estimate: [['<b onmouseover=alert(6)>', '<iframe src=javascript:alert(7)>']],
    sections: [{ title: '<img src=x onerror=alert(8)>', rows: [
      { label: 'Сайт', type: 'url', value: 'javascript:alert(9)' },
      { label: 'Посилання', type: 'links', value: [{ url: 'javascript:alert(10)', note: '<b>n</b>' }, { url: 'data:text/html,<script>alert(11)</script>', note: '' }, { url: 'https://ok.example/', note: 'good' }] },
      { label: 'Кольори', type: 'colors', value: ['red;background-image:url(https://evil.example/t.png)', '#c5ff27'] },
      { label: 'Текст', type: 'textarea', value: '<img src=x onerror=alert(12)>\nрядок' }] }] });
  g.post({ action: 'finish', id: sub.id, token: sub.token });
  g.post({ action: 'submit', mode: 'has', website: '', client: { name: 'Олена Коваль', email: 'olena@coffeelab.ua', company: 'Coffee Lab' }, summary: { type: 'Редизайн сайту', budget: '$3 000–7 000', deadline: '1–2 місяці' }, sections: [], fileCount: 0 });

  const browser = await chromium.launch();
  let acceptNext = false;
  const dialogs = [], cspErrors = [], external = [];
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const watch = page => {
    page.on('dialog', d => { if (acceptNext) { acceptNext = false; return d.accept(); } dialogs.push(d.message()); d.dismiss(); });
    page.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) cspErrors.push(m.text()); });
    page.on('request', r => { if (/evil\.example/.test(r.url())) external.push(r.url()); });
  };
  const page = await ctxA.newPage(); watch(page);

  await t('сторінка входу: просить код кабінету', async () => {
    await page.goto(URL_); await page.waitForSelector('#codeInput', { state: 'visible' });
    ok(await page.isHidden('#app'), 'app visible before login');
    await page.screenshot({ path: SHOTS + '/sec-login.png' });
  });
  await t('невірний код → «Невірний код.», кабінет закритий', async () => {
    await page.fill('#codeInput', '11112222'); await page.click('#codeBtn');
    await page.waitForFunction(() => document.querySelector('#loginError').textContent.length > 0);
    ok((await page.textContent('#loginError')).includes('Невірний код'), await page.textContent('#loginError'));
    ok(await page.isHidden('#app'));
  });
  await t('правильний код → поле для коду з листа (пошта замаскована)', async () => {
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn');
    await page.waitForSelector('#otpForm:not([hidden])');
    ok((await page.textContent('#otpTo')).includes('la•••@example.com'), await page.textContent('#otpTo'));
    ok((await page.inputValue('#codeInput')) === '', 'code left in input');
    await page.screenshot({ path: SHOTS + '/sec-otp.png' });
  });
  await t('невірний код із листа → помилка, кабінет закритий', async () => {
    const wrong = otp() === '000000' ? '111111' : '000000';
    await page.fill('#otpInput', wrong); await page.click('#otpBtn').catch(() => {});
    await page.waitForFunction(() => document.querySelector('#otpError').textContent.length > 0);
    ok((await page.textContent('#otpError')).includes('Невірний код із листа'));
    ok(await page.isHidden('#app'));
  });
  await t('правильний код із листа → відкривається воронка із заявками', async () => {
    await page.fill('#otpInput', otp());
    await page.waitForSelector('#app:not([hidden])'); await page.waitForSelector('.card');
    ok((await page.$$('.card')).length === 2, 'cards: ' + (await page.$$('.card')).length);
    await page.screenshot({ path: SHOTS + '/sec-board.png' });
  });
  await t('токен — лише в sessionStorage, нічого секретного в localStorage', async () => {
    const st = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: JSON.stringify(localStorage) }));
    ok(st.s.includes('stackup-crm-session'), 'no session'); ok(!/48271593/.test(st.l) && !/stackup-crm-session|stackup-admin-key/.test(st.l), st.l);
  });
  await t('XSS у заявці не виконується (картка, список, деталі)', async () => {
    await page.click(`.card[data-open="${sub.id}"]`); await page.waitForSelector('.detail h2');
    await page.waitForTimeout(400);
    ok(dialogs.length === 0, 'dialogs fired: ' + dialogs.join(','));
    const hrefs = await page.$$eval('#detail a, #board a', as => as.map(a => a.getAttribute('href') || ''));
    ok(!hrefs.some(h => /^\s*(javascript|data):/i.test(h)), 'dangerous href: ' + hrefs.join(' | '));
    ok(await page.$('#detail a[href="https://ok.example/"]'), 'safe link missing');
    ok(external.length === 0, 'CSS injection loaded ' + external.join(','));
    ok((await page.$$('#detail img, #detail svg, #detail iframe, #detail script')).length === 0, 'injected elements present');
    await page.screenshot({ path: SHOTS + '/sec-xss-detail.png' });
    await page.keyboard.press('Escape');
    await page.click('.seg [data-view="list"]'); await page.waitForTimeout(300);
    ok(dialogs.length === 0, 'dialogs in list: ' + dialogs.join(','));
  });
  await t('перезавантаження вкладки — сесія зберігається', async () => {
    await page.reload(); await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  });
  await t('інший браузер/вкладка без входу — бачить лише вхід', async () => {
    const ctxB = await browser.newContext(); const p2 = await ctxB.newPage(); watch(p2);
    await p2.goto(URL_); await p2.waitForSelector('#codeInput', { state: 'visible' }); ok(await p2.isHidden('#app'));
    await ctxB.close();
  });
  await t('крадений токен після виходу більше не діє', async () => {
    const stolen = await page.evaluate(() => sessionStorage.getItem('stackup-crm-session'));
    await page.click('#logoutBtn'); await page.waitForSelector('#login:not([hidden])');
    ok((await page.innerHTML('#board')).trim() === '', 'board not wiped');
    const r = g.post({ action: 'list', token: stolen }); ok(r.error === 'unauthorized', JSON.stringify(r).slice(0, 80));
    await page.reload(); await page.waitForSelector('#codeInput', { state: 'visible' }); ok(await page.isHidden('#app'));
  });
  await t('«Довіряти пристрою» → наступний вхід лише за кодом, без листа', async () => {
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn'); await page.waitForSelector('#otpForm:not([hidden])');
    await page.check('#trustInput'); await page.fill('#otpInput', otp()); await page.waitForSelector('#app:not([hidden])');
    await page.click('#logoutBtn'); await page.waitForSelector('#login:not([hidden])');
    const before = g.mails.filter(m => /Код входу/.test(m.subject)).length;
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn'); await page.waitForSelector('#app:not([hidden])');
    ok(g.mails.filter(m => /Код входу/.test(m.subject)).length === before, 'otp mail sent for trusted device');
  });
  await t('сесія спливає після 30 хв без дій → повернення на вхід', async () => {
    await fetch(`http://localhost:${API}/__clock?add=${31 * 60000}`);
    await page.click('#refreshBtn'); await page.waitForSelector('#login:not([hidden])', { timeout: 5000 });
    ok((await page.textContent('#loginError')).includes('Сесія завершилась'), await page.textContent('#loginError'));
  });
  await t('«Вийти на всіх пристроях» скасовує довіру до пристрою', async () => {
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn'); await page.waitForSelector('#app:not([hidden])');
    acceptNext = true;
    await page.click('#logoutAllBtn'); await page.waitForSelector('#login:not([hidden])');
    await page.waitForTimeout(300);
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn'); await page.waitForSelector('#otpForm:not([hidden])');
  });
  await t('5 невдалих спроб → повідомлення про блокування', async () => {
    await page.click('#otpBack');
    g.ctx.unlockLogin();
    for (let i = 0; i < 5; i++) { await page.fill('#codeInput', 'wrong' + i + 'xx'); await page.click('#codeBtn'); await page.waitForFunction(() => !document.querySelector('#codeBtn').disabled); }
    await page.fill('#codeInput', '48271593'); await page.click('#codeBtn'); await page.waitForFunction(() => /заблоковано/.test(document.querySelector('#loginError').textContent));
    ok(await page.isHidden('#app'));
    await page.screenshot({ path: SHOTS + '/sec-locked.png' });
    g.ctx.unlockLogin();
  });
  await t('CRM не відкривається всередині чужого сайту (iframe)', async () => {
    const p3 = await ctxA.newPage();
    await p3.goto(`http://localhost:${WEB}/frame.html`); await p3.waitForTimeout(800);
    const url = p3.url();
    if (/frame\.html/.test(url)) {
      const fr = p3.frames().find(f => /admin\.html/.test(f.url()));
      const st = fr ? await fr.evaluate(() => ({ app: !!document.querySelector('#app'), login: !!document.querySelector('#login'), text: document.body ? document.body.innerText.trim().length : 0 })) : { app: false, login: false, text: 0 };
      ok(!st.app && !st.login && st.text === 0, 'admin rendered inside iframe ' + JSON.stringify(st));
      await p3.screenshot({ path: SHOTS + '/sec-iframe.png' });
    }
    await p3.close();
  });
  await t('мобільний екран входу', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const pm = await m.newPage();
    await pm.goto(URL_); await pm.waitForSelector('#codeInput', { state: 'visible' }); await pm.screenshot({ path: SHOTS + '/sec-login-mobile.png' }); await m.close();
  });
  await t('бриф і CRM без порушень CSP (стилі, шрифти, скрипти)', async () => {
    const p4 = await ctxA.newPage(); watch(p4);
    await p4.goto(`http://localhost:${WEB}/brief.html?mode=none`); await p4.waitForTimeout(1200);
    await p4.screenshot({ path: SHOTS + '/sec-brief-csp.png' });
    const p5 = await ctxA.newPage(); watch(p5); await p5.goto(URL_ + '?demo'); await p5.waitForSelector('.card, tr.row'); await p5.waitForTimeout(500);
    ok(cspErrors.length === 0, cspErrors.slice(0, 3).join(' || '));
  });

  for (const r of results) console.log(r);
  console.log(`\n${results.length - fails} passed, ${fails} failed`);
  await browser.close(); process.exit(fails ? 1 : 0);
})();
