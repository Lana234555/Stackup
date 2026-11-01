/* STACKUP. — кабінет заявок. Дані: Google Apps Script (config.js → endpoint). */
(() => {
'use strict';
const EP = (window.STACKUP || {}).endpoint || '';
const qp = new URLSearchParams(location.search);
const DEMO = !EP || qp.has('demo');
const KEY_STORE = 'stackup-admin-key';

const STATUS = [
  ['new', 'Нові', 'acid'],
  ['review', 'Оцінюю', 'blue'],
  ['quoted', 'КП надіслано', 'peach'],
  ['work', 'В роботі', 'mint'],
  ['done', 'Завершено', 'stone'],
  ['archive', 'Архів', 'line']
];
const stLabel = s => (STATUS.find(x => x[0] === s) || [s, s])[1];
const stTone = s => (STATUS.find(x => x[0] === s) || [s, s, 'line'])[2];

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); };
const ago = iso => { const m = (Date.now() - new Date(iso)) / 60000; if (m < 60) return Math.max(1, Math.round(m)) + ' хв тому'; if (m < 1440) return Math.round(m / 60) + ' год тому'; return Math.round(m / 1440) + ' дн тому'; };
const size = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const ext = n => { const m = String(n).match(/\.([a-z0-9]+)$/i); return m ? m[1].toUpperCase().slice(0, 4) : 'FILE'; };

let key = '';
try { key = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
let items = [], filter = 'active', query = '', current = null, cache = {};

/* ---------- api ---------- */
async function apiGet(params) {
  if (DEMO) return demoGet(params);
  const u = new URL(EP); Object.entries({ ...params, key }).forEach(([k, v]) => u.searchParams.set(k, v));
  const j = await (await fetch(u)).json();
  if (!j.ok) throw new Error(j.error);
  return j;
}
async function apiPost(body) {
  if (DEMO) return demoPost(body);
  const j = await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key }) })).json();
  if (!j.ok) throw new Error(j.error);
  return j;
}

/* ---------- auth ---------- */
function showLogin(err) {
  $('#login').hidden = false; $('#inbox').hidden = true;
  $('#refreshBtn').hidden = $('#logoutBtn').hidden = true;
  $('#loginError').textContent = err || '';
}
async function enter() {
  try {
    const j = await apiGet({ action: 'list' });
    try { if (!DEMO) localStorage.setItem(KEY_STORE, key); } catch (e) {}
    items = j.items || [];
    $('#login').hidden = true; $('#inbox').hidden = false;
    $('#refreshBtn').hidden = false; $('#logoutBtn').hidden = DEMO;
    $('#demoTag').hidden = !DEMO;
    renderList();
    const id = location.hash.slice(1);
    if (id && items.some(x => x.id === id)) open(id);
    else if (window.innerWidth > 900 && visibleItems()[0]) open(visibleItems()[0].id, true);
    else renderEmpty();
  } catch (e) {
    showLogin(/unauthorized/.test(e.message) ? 'Невірний ключ.' : 'Не вдалося з’єднатися: ' + e.message);
  }
}

/* ---------- list ---------- */
function visibleItems() {
  const q = query.trim().toLowerCase();
  return items.filter(x => {
    if (filter === 'active' && (x.status === 'archive' || x.status === 'done')) return false;
    if (filter !== 'active' && filter !== 'all' && x.status !== filter) return false;
    if (q && ![x.name, x.company, x.email, x.phone, x.id].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderList() {
  const count = s => items.filter(x => x.status === s).length;
  $('#stats').innerHTML = [['new', 'Нових'], ['review', 'Оцінюю'], ['work', 'В роботі']].map(([s, l]) =>
    `<button type="button" class="stat ${stTone(s)}" data-f="${s}"><b>${count(s)}</b><span class="mono">${l.toUpperCase()}</span></button>`).join('');
  const fl = [['active', 'Активні'], ...STATUS.map(s => [s[0], s[1]]), ['all', 'Усі']];
  $('#filters').innerHTML = fl.map(([v, l]) => `<button type="button" role="tab" aria-selected="${v === filter}" data-f="${v}">${esc(l)}${v !== 'active' && v !== 'all' ? ` <sup>${count(v)}</sup>` : ''}</button>`).join('');
  const vis = visibleItems();
  $('#items').innerHTML = vis.length ? vis.map(x => `<li><button type="button" class="item${current === x.id ? ' cur' : ''}${x.status === 'new' ? ' unread' : ''}" data-id="${esc(x.id)}">
      <span class="item-top mono"><span class="pill ${stTone(x.status)}">${esc(stLabel(x.status)).toUpperCase()}</span><span>${esc(ago(x.created))}</span></span>
      <strong>${esc(x.company || x.name)}</strong>
      <span class="item-sub">${esc(x.company ? x.name : x.email)}</span>
      <span class="item-meta mono"><span>${x.mode === 'has' ? 'ТЗ ✓' : 'БРИФ'}</span>${x.type ? `<span>${esc(x.type)}</span>` : ''}${x.deadline ? `<span>${esc(x.deadline)}</span>` : ''}${x.files ? `<span>📎 ${x.files}</span>` : ''}</span>
    </button></li>`).join('') : `<li class="none mono">НІЧОГО НЕ ЗНАЙДЕНО</li>`;
}

/* ---------- detail ---------- */
function renderEmpty() {
  $('#detail').innerHTML = `<div class="empty"><p class="eyebrow"><i></i> INBOX</p><h2>${items.length ? 'Оберіть заявку' : 'Поки тихо.'}<br><span class="serif">${items.length ? 'зі списку.' : 'Перша заявка вже близько.'}</span></h2>
    <p class="lead">Посилання для клієнтів:<br><code>${esc(location.origin)}/brief.html?mode=has</code> — є ТЗ<br><code>${esc(location.origin)}/brief.html?mode=none</code> — створити ТЗ</p></div>`;
  document.body.classList.remove('show-detail');
}

async function open(id, quiet) {
  current = id; renderList();
  if (!quiet) history.replaceState(null, '', '#' + id);
  document.body.classList.add('show-detail');
  const row = items.find(x => x.id === id);
  $('#detail').innerHTML = `<div class="loading mono">ЗАВАНТАЖУЄМО ${esc(row ? row.company || row.name : '')}…</div>`;
  try {
    const d = cache[id] || (cache[id] = await apiGet({ action: 'get', id }));
    if (current === id) renderDetail(d);
  } catch (e) { $('#detail').innerHTML = `<p class="step-error">Не вдалося відкрити: ${esc(e.message)}</p>`; }
}

function valueHTML(r) {
  const v = r.value;
  if (r.type === 'links') return `<ul>${v.map(x => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : ''}${x.note ? ` — ${esc(x.note)}` : ''}</li>`).join('')}</ul>`;
  if (r.type === 'colors') return `<span class="d-colors">${v.map(c => `<span><i style="background:${esc(c)}"></i>${esc(String(c).toUpperCase())}</span>`).join('')}</span>`;
  if (r.type === 'url') return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
  return esc(Array.isArray(v) ? v.join(', ') : v).replace(/\n/g, '<br>');
}

function contactLinks(c) {
  const out = [];
  if (c.email) out.push(`<a class="button primary" href="mailto:${esc(c.email)}"><b>Написати</b> <span>↗</span></a>`);
  const ph = String(c.phone || '').trim();
  if (/^@?[a-z0-9_]{4,}$/i.test(ph) && !/^\d+$/.test(ph.replace('@', ''))) out.push(`<a class="button ghost" href="https://t.me/${esc(ph.replace('@', ''))}" target="_blank" rel="noopener"><b>Telegram</b> <span>↗</span></a>`);
  else if (ph) out.push(`<a class="button ghost" href="tel:${esc(ph.replace(/[^\d+]/g, ''))}"><b>${esc(ph)}</b> <span>↗</span></a>`);
  return out.join('');
}

function renderDetail(d) {
  const row = d.row, rec = d.record || {}, c = rec.client || row;
  const groups = {};
  (d.files || []).forEach(f => (groups[f.label] = groups[f.label] || []).push(f));
  const spec = (d.files || []).filter(f => f.field === 'specFiles');
  $('#detail').innerHTML = `
    <button type="button" class="link mono back-list" id="backList">← ДО СПИСКУ</button>
    <div class="d-bar mono"><span>№ ${esc(row.id)}</span><span>${esc(fmtDate(row.created))}</span></div>
    <h2>${esc(c.company || c.name)}<br><span class="serif">${esc(c.company ? c.name : (row.mode === 'has' ? 'надіслав(ла) ТЗ' : 'створив(ла) ТЗ'))}</span></h2>
    <p class="contact-line">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
    <div class="status-row" role="group" aria-label="Статус">${STATUS.map(([v, l, t]) => `<button type="button" class="st ${t}" data-st="${v}" aria-pressed="${row.status === v}">${esc(l)}</button>`).join('')}</div>
    <div class="act-row">${contactLinks(c)}${d.folderUrl ? `<a class="button ghost" href="${esc(d.folderUrl)}" target="_blank" rel="noopener"><b>Папка на Drive</b> <span>↗</span></a>` : ''}</div>

    ${spec.length ? `<div class="spec-box"><span class="mono">ТЗ КЛІЄНТА</span>${spec.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener"><span class="mono">${esc(ext(f.name))}</span><b>${esc(f.name)}</b><em>${size(f.size)}</em><i>↗</i></a>`).join('')}</div>` : ''}

    ${rec.estimate && rec.estimate.length ? `<section class="d-sec d-est"><h3><span class="mono">✱</span>Для оцінки</h3><div class="est">${rec.estimate.map(([k, v]) => `<div><span class="mono">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` : ''}

    <section class="d-sec notes"><h3><span class="mono">✎</span>Мої нотатки</h3>
      <textarea id="notes" rows="4" placeholder="Оцінка, години, ціна, питання до клієнта…">${esc(row.notes || '')}</textarea>
      <div class="notes-bar"><button type="button" class="link mono" id="saveNotes">ЗБЕРЕГТИ НОТАТКИ</button><span class="mono" id="notesState"></span></div>
    </section>

    ${(rec.sections || []).map((s, i) => `<section class="d-sec"><h3><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}</h3>
      <dl>${s.rows.map(r => `<dt>${esc(r.label)}</dt><dd>${valueHTML(r)}</dd>`).join('')}</dl></section>`).join('')}

    <section class="d-sec"><h3><span class="mono">📎</span>Файли · ${(d.files || []).length}</h3>
      ${Object.keys(groups).length ? Object.entries(groups).map(([label, list]) => `<p class="f-group mono">${esc(label).toUpperCase()}</p><ul class="file-list">${list.map(f => `<li><span class="mono">${esc(ext(f.name))}</span><b><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a></b><em>${size(f.size)}</em></li>`).join('')}</ul>`).join('') : '<p class="lead">Файлів немає.</p>'}
    </section>`;
  $('#detail').scrollTop = 0;
  if (window.innerWidth <= 900) window.scrollTo({ top: 0 });
}

async function setStatus(st) {
  const row = items.find(x => x.id === current); if (!row || row.status === st) return;
  const prev = row.status; row.status = st;
  if (cache[current]) cache[current].row.status = st;
  document.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.st === st)));
  renderList();
  try { await apiPost({ action: 'update', id: current, status: st }); }
  catch (e) { row.status = prev; renderList(); alert('Не вдалося змінити статус: ' + e.message); }
}

async function saveNotes() {
  const v = $('#notes').value, s = $('#notesState');
  s.textContent = 'ЗБЕРІГАЄМО…';
  try {
    await apiPost({ action: 'update', id: current, notes: v });
    const row = items.find(x => x.id === current); row.notes = v; if (cache[current]) cache[current].row.notes = v;
    s.textContent = '✓ ЗБЕРЕЖЕНО';
  } catch (e) { s.textContent = 'ПОМИЛКА: ' + e.message; }
}

/* ---------- events ---------- */
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); key = $('#keyInput').value.trim(); enter(); });
$('#logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(KEY_STORE); } catch (e) {} key = ''; items = []; cache = {}; showLogin(); });
$('#refreshBtn').addEventListener('click', () => { cache = {}; enter(); });
$('#search').addEventListener('input', e => { query = e.target.value; renderList(); });
document.addEventListener('click', e => {
  const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; renderList(); return; }
  const it = e.target.closest('[data-id]'); if (it) { open(it.dataset.id); return; }
  const st = e.target.closest('[data-st]'); if (st) { setStatus(st.dataset.st); return; }
  if (e.target.closest('#saveNotes')) { saveNotes(); return; }
  if (e.target.closest('#backList')) { current = null; history.replaceState(null, '', location.pathname + location.search); renderList(); renderEmpty(); }
});
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 's' && document.activeElement && document.activeElement.id === 'notes') { e.preventDefault(); saveNotes(); } });

/* ---------- demo data (shown until the backend is connected) ---------- */
function demoData() {
  const h = n => new Date(Date.now() - n * 3600000).toISOString();
  return [
    { id: '261101-A7F2', created: h(1.5), status: 'new', name: 'Олена Коваль', company: 'Coffee Lab', email: 'olena@coffeelab.ua', phone: '@olena_coffee', mode: 'none', type: 'Редизайн сайту', deadline: '1–2 місяці', budget: '$3 000–7 000', files: 4, notes: '',
      record: { estimate: [['Сторінок / екранів', '6'], ['Функцій', '4'], ['Тексти', 'Частково'], ['Мов', 'UA, EN'], ['Дизайн-основа', 'Є лише логотип'], ['Терміни', '1–2 місяці · відкриття другої точки 1 березня'], ['Бюджет', '$3 000–7 000']],
        sections: [
          { title: 'Про компанію і аудиторію', rows: [{ label: 'Чим займається компанія?', type: 'textarea', value: 'Кав’ярня і обсмажка specialty-кави в Києві, 6 років на ринку. Продаємо зерно в роздріб і для HoReCa.' }, { label: 'Хто ваші клієнти?', type: 'textarea', value: '25–40 років, айтівці та креативи поруч з офісами; кав’ярні, яким потрібне стабільне зерно.' }, { label: 'Конкуренти', type: 'links', value: [{ url: 'https://example.com/roasters', note: 'гарний каталог, але повільний сайт' }] }] },
          { title: 'Мета і тип проєкту', rows: [{ label: 'Що потрібно?', type: 'radio', value: 'Редизайн сайту' }, { label: 'Поточний сайт', type: 'url', value: 'https://coffeelab.example' }, { label: 'Головна мета сайту', type: 'chips', value: 'Продажі онлайн, Заявки' }, { label: 'Яку одну дію має зробити відвідувач?', type: 'text', value: 'Замовити зерно з доставкою' }] },
          { title: 'Структура і функціонал', rows: [{ label: 'Сторінки / блоки', type: 'pages', value: 'Головна, Про нас, Каталог / товари, Відгуки, FAQ, Контакти' }, { label: 'Функції', type: 'chips', value: 'Оплата онлайн, Кошик / замовлення, Кілька мов, Адмінка, щоб редагувати самим' }] },
          { title: 'Дизайн і стиль', rows: [{ label: 'Фірмовий стиль', type: 'radio', value: 'Є лише логотип' }, { label: 'Фірмові кольори', type: 'radio', value: 'Так' }, { label: 'Оберіть кольори', type: 'colors', value: ['#2b1d14', '#f2e6d0', '#c5ff27'] }, { label: 'Що ближче? Оберіть 1–2', type: 'styles', value: 'Редакційний (Як журнал: серифи, колонки, історії.); Дружній (Теплі кольори, заокруглення, ілюстрації.)' }, { label: 'Сайти, які подобаються', type: 'links', value: [{ url: 'https://example.com/ref', note: 'великі фото і спокійна типографіка' }] }] },
          { title: 'Терміни, бюджет, підтримка', rows: [{ label: 'Коли потрібен запуск?', type: 'radio', value: '1–2 місяці' }, { label: 'Орієнтовний бюджет', type: 'radio', value: '$3 000–7 000' }, { label: 'Підтримка після запуску', type: 'radio', value: 'Потрібна' }] }
        ] },
      fileList: [['fontFiles', 'Файли шрифтів або скріншот', 'Brand-Serif.otf', 84000], ['brandFiles', 'Брендбук, логотип (SVG, AI, PDF, PNG)', 'logo.svg', 12000], ['materialsFiles', 'Файли з матеріалами', 'photos-shop.zip', 18400000], ['likeShots', 'Скріншоти прикладів', 'ref-1.png', 640000]] },
    { id: '261031-K2D9', created: h(20), status: 'review', name: 'Андрій Мельник', company: 'Nexa Logistics', email: 'a.melnyk@nexa.example', phone: '+380 67 123 45 67', mode: 'has', type: 'Власне ТЗ', deadline: 'До 1 місяця', budget: 'Потрібна оцінка', files: 2, notes: '~60 год дизайн + 80 год розробка. Уточнити інтеграцію з CRM.',
      record: { estimate: [['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', 'До 1 місяця'], ['Бюджет', 'Потрібна оцінка']],
        sections: [{ title: 'Технічне завдання клієнта', rows: [{ label: 'Наскільки ТЗ фінальне?', type: 'radio', value: 'Чернетка, можна доповнювати' }, { label: 'Що важливо, але не увійшло в ТЗ?', type: 'textarea', value: 'Потрібен калькулятор вартості доставки та англійська версія.' }] }] },
      fileList: [['specFiles', 'Файл ТЗ', 'TZ_Nexa_website_v3.pdf', 1250000], ['brandFiles', 'Брендбук, логотип (SVG, AI, PDF, PNG)', 'Nexa-brandbook.pdf', 5400000]] },
    { id: '261028-M4QX', created: h(96), status: 'quoted', name: 'Марія Лис', company: '', email: 'maria.lys@example.com', phone: '', mode: 'none', type: 'Лендинг', deadline: 'Якнайшвидше', budget: 'до $1 000', files: 0, notes: 'КП: $900, 2 тижні.',
      record: { estimate: [['Сторінок / екранів', '1'], ['Функцій', '2'], ['Тексти', 'Потрібен копірайтинг'], ['Дизайн-основа', 'Довіряю вам'], ['Терміни', 'Якнайшвидше'], ['Бюджет', 'до $1 000']], sections: [{ title: 'Про компанію і аудиторію', rows: [{ label: 'Чим займається компанія?', type: 'textarea', value: 'Психологиня, онлайн-консультації та курс для батьків.' }] }] }, fileList: [] },
    { id: '261015-P8LA', created: h(400), status: 'work', name: 'Ігор Бондар', company: 'Lume Studio', email: 'hello@lume.example', phone: '@igor_lume', mode: 'none', type: 'Корпоративний сайт', deadline: '2–3 місяці', budget: '$7 000+', files: 6, notes: 'Дизайн погоджено 28.10.', record: { estimate: [], sections: [] }, fileList: [] }
  ];
}
let demo = null;
function demoGet(p) {
  demo = demo || demoData();
  if (p.action === 'list') return Promise.resolve({ ok: true, items: demo.map(({ record, fileList, ...r }) => r) });
  const x = demo.find(d => d.id === p.id);
  const { record, fileList, ...row } = x;
  return new Promise(ok => setTimeout(() => ok({ ok: true, row, record: { client: row, ...record }, folderUrl: 'https://drive.google.com/',
    files: fileList.map(([field, label, name, sz]) => ({ field, label, name, size: sz, url: 'https://drive.google.com/' })) }), 200));
}
function demoPost(b) { const x = demo.find(d => d.id === b.id); if (b.status) x.status = b.status; if (b.notes != null) x.notes = b.notes; return Promise.resolve({ ok: true }); }

/* ---------- init ---------- */
if (DEMO || key) enter(); else showLogin();
})();
