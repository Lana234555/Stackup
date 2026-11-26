/* STACKUP. — система керування: огляд, контент Instagram, матеріали, налаштування.
   Заявки живуть в admin.js; тут усе інше. Контент готує Claude у /content/manifest.json,
   стан (затверджено, час, правки, опубліковано) зберігає Apps Script. */
(() => {
'use strict';
const C = window.StackupCRM;
if (!C) return;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const BASE = 'content/';
const path = p => /^[a-z0-9][a-z0-9\/._-]{0,200}$/i.test(String(p || '')) && !String(p).includes('..') ? BASE + p : '';
const link = p => /^\/[a-z0-9\/._?=&-]*$/i.test(String(p || '')) ? p : '';
const safeHttp = u => /^https:\/\/(www\.)?instagram\.com\//.test(String(u || '')) ? u : '';
const DAY = 864e5;
const fmt = (iso, o) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('uk-UA', o); };
const when = iso => fmt(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayName = iso => fmt(iso, { weekday: 'short', day: 'numeric', month: 'long' });
const localInput = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const KIND = { carousel: 'Карусель', post: 'Пост', stories: 'Сторіс', reel: 'Рілс' };
const STATUS = {
  review: ['На затвердженні', 'peach'], changes: ['Правки', 'rose'], scheduled: ['Заплановано', 'blue'],
  publishing: ['Публікується', 'lav'], published: ['Опубліковано', 'mint'], failed: ['Помилка', 'err'], skipped: ['Пропущено', 'line']
};
const SECS = ['home', 'leads', 'content', 'tasks', 'mail', 'strategy', 'library', 'settings'];
const TITLES = { home: 'Огляд', leads: 'Заявки', content: 'Контент', tasks: 'Задачі', mail: 'Розсилки', strategy: 'Стратегія', library: 'Матеріали', settings: 'Налаштування' };
const CTABS = [['review', 'На затвердженні'], ['changes', 'Правки'], ['scheduled', 'Заплановано'], ['published', 'Опубліковано'], ['all', 'Усе'], ['plan', 'Календар'], ['grid', 'Сітка профілю']];

let sec = SECS.includes(new URLSearchParams(location.search).get('s')) ? new URLSearchParams(location.search).get('s') : store.get('stackup-hub-sec', 'home');
let ctab = store.get('stackup-hub-ctab', 'review');
let manifest = { items: [] }, library = null, state = {}, ig = { connected: false }, ai = { connected: false }, loaded = false, busy = false, open = null, slide = 0, month = null, pollT = null, ed = null;
let tasks = [], tasksLoaded = false, insights = null, cal = null;

/* ---------- дані ---------- */
async function fetchJson(u) { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }
const demoState = () => store.get('stackup-demo-content', {});
async function loadContent() {
  const [m, s] = await Promise.all([
    fetchJson(BASE + 'manifest.json').catch(() => ({ items: [] })),
    C.demo ? Promise.resolve({ ok: true, state: demoState(), ig: { connected: false, demo: true } }) : C.call({ action: 'content' }).catch(e => { if (e.message === 'unauthorized') throw e; return null; })
  ]);
  manifest = { items: (m.items || []).filter(x => x && /^[a-z0-9-]{1,80}$/.test(x.id)) };
  if (s) { state = s.state || {}; ig = s.ig || { connected: false }; ai = s.ai || { connected: false }; loaded = true; }
  else loaded = loaded || false;
  await Promise.all([loadTasks(), loadStatic()]);
}
async function loadTasks() {
  if (C.demo) { tasks = store.get('stackup-demo-tasks', null) || demoTasks(); tasksLoaded = true; return; }
  try { tasks = (await C.call({ action: 'tasks' })).items || []; tasksLoaded = true; } catch (e) { if (e.message === 'unauthorized') throw e; }
}
async function loadStatic() {
  const [a, b] = await Promise.all([fetchJson(BASE + 'insights.json').catch(() => null), fetchJson(BASE + 'calendar.json').catch(() => null)]);
  if (a) insights = a; if (b) cal = b;
}
async function act(id, op, extra) {
  if (busy) return; busy = true;
  try {
    let st;
    if (C.demo) {
      const all = demoState(), cur = all[id] || {};
      st = { ...cur, status: { approve: 'scheduled', changes: 'changes', review: 'review', skip: 'skipped', now: 'scheduled' }[op], updated: new Date().toISOString() };
      if (op === 'edit') st.status = cur.status || 'review';
      if (extra.at) st.at = extra.at; if (extra.caption != null) st.caption = extra.caption; if (extra.comment != null) st.comment = extra.comment;
      if (extra.title != null) st.title = extra.title; if (extra.slides != null) st.slides = extra.slides;
      if (op === 'approve') st.comment = '';
      all[id] = st; store.set('stackup-demo-content', all);
      if (op === 'now') { C.toast('<span class="mono">ДЕМО</span> <b>У демо-режимі публікації в Instagram немає.</b>'); }
    } else if (op === 'now') {
      st = (await C.call({ action: 'publishNow', id, caption: extra.caption, title: extra.title, slides: extra.slides })).state;
    } else {
      st = (await C.call({ action: 'contentUpdate', id, op, ...extra })).state;
    }
    state[id] = st;
    const msg = { edit: 'Зміни збережено', approve: 'Заплановано на ' + when(st.at), changes: 'Повернуто на правки', review: 'Повернуто на затвердження', skip: 'Пропущено', now: st.status === 'published' ? 'Опубліковано в Instagram' : 'Публікується, відео ще обробляється' }[op];
    C.toast('<span class="mono">ГОТОВО</span> <b>' + esc(msg) + '</b>');
    renderAll();
  } catch (e) {
    const m = e.message || '';
    C.toast('<span class="mono">ПОМИЛКА</span> <b>' + esc(m === 'instagram not connected' ? 'Instagram ще не підключено (див. Налаштування).' : m === 'bad date' ? 'Перевірте дату і час.' : m === 'locked item' ? 'Вже опубліковано або публікується.' : /^IG: /.test(m) ? 'Instagram: ' + m.slice(4) : 'Не вдалося зберегти. Спробуйте ще раз.') + '</b>', 6000);
  } finally { busy = false; }
}

/* стан + маніфест разом */
const range = n => [...Array(n).keys()];
function slideOrder(n, slides) {
  if (!slides) return range(n);
  const seen = {}, a = String(slides).split(',').map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n && !seen[i] && (seen[i] = 1));
  return a.length ? a : range(n);
}
function items() {
  return manifest.items.map(x => {
    const s = state[x.id] || {};
    const status = s.status || 'review';
    const at = s.at || '';
    const bm = x.media || [], bt = x.thumbs || bm, ord = slideOrder(bm.length, s.slides);
    return { ...x, st: s, status, at, baseTitle: x.title || '', title: s.title || x.title || '', baseMedia: bm, baseThumbs: bt, order: ord,
      media: ord.map(i => bm[i]), thumbs: ord.map(i => bt[i] || bm[i]),
      baseCaption: x.caption || '', caption: s.caption || x.caption || '', time: at || x.proposedAt || '' };
  });
}
const byStatus = st => items().filter(x => x.status === st);
const feed = x => x.kind !== 'stories';

/* ---------- розділи ---------- */
function setSec(s, tab) {
  if (!SECS.includes(s)) s = 'home';
  sec = s; store.set('stackup-hub-sec', s);
  if (tab) { ctab = tab; store.set('stackup-hub-ctab', tab); }
  const q = new URLSearchParams(location.search); if (q.has('s')) { q.delete('s'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  renderAll(); window.scrollTo(0, 0);
}
function applySec() {
  $('#app').dataset.sec = sec;
  $$('.sec').forEach(el => { el.hidden = el.dataset.section !== sec; });
  $$('[data-sec]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec && (!b.dataset.ctab || b.dataset.ctab === ctab || (b.dataset.ctab === 'review' && !['plan', 'grid'].includes(ctab))))));
  const r = byStatus('review').length, ch = byStatus('changes').length;
  $('#cntReview').textContent = r || ''; $('#tabReview').textContent = r || '';
  const nNew = C.leads().filter(C.isUnread).length; $('#tabNew').textContent = nNew || '';
  const hot = hotTasks().length; $('#cntTasks').textContent = hot || ''; $('#tabTasks').textContent = hot || '';
  document.title = TITLES[sec] + ' — Stackup';
  $('#grpLeads').textContent = nNew || ''; $('#grpContent').textContent = r || ''; $('#grpWork').textContent = hot || '';
  sideGroups();
  void ch;
}
function renderAll() {
  applySec();
  if (sec === 'home') renderHome();
  if (sec === 'content') renderContent();
  if (sec === 'tasks') renderTasks();
  if (sec === 'mail') renderMail();
  if (sec === 'strategy') renderStrategy();
  if (sec === 'library') renderLibrary();
  if (sec === 'settings') renderSettings();
  if (open) renderViewer();
}
const head = (title, sub, tools = '') => `<header class="hub-top"><div class="top-title"><h1>${title}</h1>${sub ? `<span class="mono">${sub}</span>` : ''}</div><div class="hub-tools">${tools}</div></header>`;

/* ---------- огляд ---------- */
function thumbOf(x) { return path((x.thumbs || [])[0] || (x.media || [])[0]); }
function chip(st) { const [l, t] = STATUS[st] || STATUS.review; return `<span class="pill ${t}">${esc(l)}</span>`; }
function tile(x, big) {
  const n = x.kind === 'reel' ? '▶' : (x.media || []).length > 1 ? '❐ ' + x.media.length : '';
  return `<button type="button" class="ctile${big ? ' big' : ''} k-${esc(x.kind)}" data-item="${esc(x.id)}">
    <span class="ctile-img"><img src="${esc(thumbOf(x))}" alt="" loading="lazy">${n ? `<i>${n}</i>` : ''}</span>
    <span class="ctile-meta"><span class="mono">${esc(KIND[x.kind] || x.kind)}${x.time ? ' · ' + esc(when(x.time)) : ''}</span><b>${esc(x.title)}</b>${chip(x.status)}</span>
  </button>`;
}
function igBanner() {
  if (ig.connected) return '';
  return `<button type="button" class="banner" data-sec="settings"><span class="mono">INSTAGRAM</span><b>${C.demo ? 'Демо-режим: дані не зберігаються на сервері.' : 'Instagram ще не підключено. Затверджене стане в план, а публікуватись почне після підключення.'}</b><span>Налаштування ↗</span></button>`;
}
function renderHome() {
  const L = C.leads(), it = items(), now = Date.now();
  const unread = L.filter(C.isUnread), work = L.filter(x => !['new', 'done', 'archive'].includes(x.status));
  const review = it.filter(x => x.status === 'review'), changes = it.filter(x => x.status === 'changes');
  const next = it.filter(x => ['scheduled', 'publishing'].includes(x.status)).sort((a, b) => new Date(a.at) - new Date(b.at));
  const week = next.filter(x => new Date(x.at) - now < 7 * DAY).length;
  const pub = it.filter(x => x.status === 'published').length;
  const h = new Date().getHours(), hello = h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Доброго дня' : 'Доброго вечора';
  const kp = (l, n, t, sec2, tab) => `<button type="button" class="kpi ${t}" data-sec="${sec2}"${tab ? ` data-ctab="${tab}"` : ''}><span class="mono">${l}</span><b>${n}</b></button>`;
  $('#secHome').innerHTML = head(esc(hello) + '<span class="serif">, Лано.</span>', esc(fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase())) +
    igBanner() +
    `<div class="kpis hub-kpis">${kp('НОВІ ЗАЯВКИ', unread.length, unread.length ? 'acid' : '', 'leads')}${kp('ЗАЯВКИ В РОБОТІ', work.length, '', 'leads')}${kp('НА ЗАТВЕРДЖЕННІ', review.length, review.length ? 'acid' : '', 'content', 'review')}${kp('ПУБЛІКАЦІЙ ЗА 7 ДНІВ', week, '', 'content', 'plan')}${kp('ТЕРМІНОВІ ЗАДАЧІ', hotTasks().length, hotTasks().length ? 'acid' : '', 'tasks')}</div>
    <div class="home-grid">
      <section class="panel wide"><div class="panel-h"><h2>Чекає на тебе</h2><button type="button" class="link mono" data-sec="content" data-ctab="review">УСІ ${review.length} →</button></div>
        ${review.length ? `<div class="strip-row">${review.slice(0, 8).map(x => tile(x)).join('')}</div>` : '<p class="empty">Усе затверджено. Нові пости з’являться тут, щойно я їх підготую.</p>'}
        ${changes.length ? `<p class="mono note-line">НА ПРАВКАХ У МЕНЕ: ${changes.length} · <button type="button" class="link mono" data-sec="content" data-ctab="changes">ПЕРЕГЛЯНУТИ</button></p>` : ''}</section>
      <section class="panel"><div class="panel-h"><h2>Найближчі публікації</h2><button type="button" class="link mono" data-sec="content" data-ctab="plan">КАЛЕНДАР →</button></div>
        ${next.length ? `<ul class="agenda">${next.slice(0, 6).map(x => `<li><button type="button" data-item="${esc(x.id)}"><img src="${esc(thumbOf(x))}" alt="" loading="lazy"><span><span class="mono">${esc(dayName(x.at).toUpperCase())} · ${esc(fmt(x.at, { hour: '2-digit', minute: '2-digit' }))}</span><b>${esc(x.title)}</b></span>${chip(x.status)}</button></li>`).join('')}</ul>` : '<p class="empty">Нічого не заплановано. Затвердь пост, і він з’явиться тут.</p>'}</section>
      <section class="panel"><div class="panel-h"><h2>Останні заявки</h2><button type="button" class="link mono" data-sec="leads">ВОРОНКА →</button></div>
        ${L.length ? `<ul class="agenda leads">${L.filter(x => x.status !== 'archive').slice(0, 6).map(x => `<li><button type="button" data-lead="${esc(x.id)}"><span class="ava ${C.isUnread(x) ? 'acid' : 'line'}">${esc(String(x.company || x.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><span class="mono">${esc(when(x.created).toUpperCase())}${C.isUnread(x) ? ' · <em class="new-tag">НОВА</em>' : ''}</span><b>${esc(x.company || x.name)}</b><small>${esc(x.type || '')}</small></span></button></li>`).join('')}</ul>` : '<p class="empty">Заявок поки немає.</p>'}</section>
      <div class="home-three">${homeTasks()}${homeDates()}${homeTrend()}</div>
    </div>`;
}

/* ---------- контент ---------- */
function renderContent() {
  const it = items();
  const count = t => t === 'all' ? it.length : it.filter(x => x.status === t).length;
  const tabs = CTABS.map(([k, l]) => `<button type="button" role="tab" data-ctab-only="${k}" aria-selected="${ctab === k}">${l}${['plan', 'grid'].includes(k) ? '' : ` <sup>${count(k)}</sup>`}</button>`).join('');
  const tools = ctab === 'changes' && count('changes') ? '<button type="button" class="button ghost sm" id="copyChanges"><b>Скопіювати правки для Claude</b><span>⧉</span></button>' : '';
  let body;
  if (ctab === 'plan') body = calendar(it);
  else if (ctab === 'grid') body = grid(it);
  else {
    const list = (ctab === 'all' ? it : it.filter(x => x.status === ctab)).sort((a, b) => (new Date(a.time || 8e15)) - (new Date(b.time || 8e15)));
    const empty = { review: 'Усе затверджено. Коли я підготую нове, воно з’явиться тут, а в Telegram прийде сповіщення.', changes: 'Немає публікацій на правках.', scheduled: 'Нічого не заплановано.', published: 'Ще нічого не опубліковано.', all: 'Контенту поки немає.' }[ctab] || '';
    body = list.length ? `<div class="cgrid">${list.map(x => card(x)).join('')}</div>` : `<p class="empty big">${empty}</p>`;
  }
  $('#secContent').innerHTML = head('Instagram', ig.connected ? '@' + esc(ig.username).toUpperCase() + ' · АВТОПУБЛІКАЦІЯ УВІМКНЕНА' : 'АВТОПУБЛІКАЦІЮ НЕ ПІДКЛЮЧЕНО', tools) + igBanner() +
    `<div class="ctabs" role="tablist">${tabs}</div>${body}`;
}
function card(x) {
  const thumbs = (x.thumbs || x.media || []).slice(0, x.kind === 'stories' ? 4 : 3);
  return `<article class="ccard s-${esc(x.status)}" data-item="${esc(x.id)}" tabindex="0">
    <div class="ccard-media k-${esc(x.kind)}">${thumbs.map(t => `<img src="${esc(path(t))}" alt="" loading="lazy">`).join('')}${x.kind === 'reel' ? '<i class="play">▶</i>' : ''}</div>
    <div class="ccard-body">
      <div class="ccard-top"><span class="mono">${esc(KIND[x.kind] || '')}${(x.media || []).length > 1 ? ' · ' + x.media.length : ''}${x.highlight ? ' · ХАЙЛАЙТ ' + esc(x.highlight.toUpperCase()) : ''}</span>${chip(x.status)}</div>
      <h3>${esc(x.title)}</h3>
      <p class="ccard-when mono">${x.status === 'published' ? 'ОПУБЛІКОВАНО ' + esc(when(x.st.publishedAt).toUpperCase()) : x.at ? 'ВИЙДЕ ' + esc(when(x.at).toUpperCase()) : x.proposedAt ? 'ПРОПОНУЮ ' + esc(when(x.proposedAt).toUpperCase()) : 'БЕЗ ДАТИ'}</p>
      ${x.status === 'changes' && x.st.comment ? `<p class="ccard-comment">«${esc(x.st.comment)}»</p>` : x.status === 'failed' ? `<p class="ccard-comment err">${esc(x.st.error)}</p>` : `<p class="ccard-note">${esc(x.note || '')}</p>`}
    </div>
  </article>`;
}
function calendar(it) {
  const now = new Date();
  if (!month) { const first = it.filter(x => x.time).map(x => new Date(x.time)).filter(d => d >= new Date(now.getFullYear(), now.getMonth(), 1)).sort((a, b) => a - b)[0]; const b = first && first.getMonth() !== now.getMonth() && !it.some(x => x.at && new Date(x.at).getMonth() === now.getMonth()) ? first : now; month = new Date(b.getFullYear(), b.getMonth(), 1); }
  const y = month.getFullYear(), m = month.getMonth(), start = new Date(y, m, 1), shift = (start.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const key = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  const map = {};
  it.filter(x => x.time && x.status !== 'skipped').forEach(x => { const d = new Date(x.status === 'published' && x.st.publishedAt ? x.st.publishedAt : x.time); (map[key(d)] = map[key(d)] || []).push(x); });
  Object.values(map).forEach(l => l.sort((a, b) => new Date(a.time) - new Date(b.time)));
  let cells = '';
  for (let i = 0; i < shift; i++) cells += '<div class="cal-d pad"></div>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m, d), list = map[key(dt)] || [], today = key(dt) === key(now);
    cells += `<div class="cal-d${today ? ' today' : ''}${list.length ? ' has' : ''}${dt < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? ' past' : ''}"><span class="cal-n">${d}<em>${esc(fmt(dt, { weekday: 'short' }))}</em></span>${list.map(x => `<button type="button" class="cal-i s-${esc(x.status)}" data-item="${esc(x.id)}" title="${esc(x.title)}"><img src="${esc(thumbOf(x))}" alt="" loading="lazy"><span><span class="mono">${esc(fmt(x.time, { hour: '2-digit', minute: '2-digit' }))} · ${esc(KIND[x.kind] || '')}</span>${esc(x.title)}</span></button>`).join('')}</div>`;
  }
  const noDate = it.filter(x => !x.time && !['skipped', 'published'].includes(x.status));
  return `<div class="cal-bar"><button type="button" class="icon-btn" data-month="-1" aria-label="Попередній місяць">‹</button><h2>${esc(fmt(month, { month: 'long', year: 'numeric' }))}</h2><button type="button" class="icon-btn" data-month="1" aria-label="Наступний місяць">›</button>
    <span class="cal-legend mono"><i class="pill blue"></i>ЗАПЛАНОВАНО <i class="pill peach"></i>ПРОПОЗИЦІЯ, ЧЕКАЄ НА ТЕБЕ <i class="pill mint"></i>ОПУБЛІКОВАНО</span></div>
    <div class="cal"><div class="cal-h mono">ПН</div><div class="cal-h mono">ВТ</div><div class="cal-h mono">СР</div><div class="cal-h mono">ЧТ</div><div class="cal-h mono">ПТ</div><div class="cal-h mono">СБ</div><div class="cal-h mono">НД</div>${cells}</div>
    ${noDate.length ? `<h3 class="sub-h">Без дати</h3><div class="strip-row">${noDate.map(x => tile(x)).join('')}</div>` : ''}`;
}
function grid(it) {
  const order = x => new Date(x.status === 'published' ? x.st.publishedAt : x.time || 0).getTime() || 0;
  const list = it.filter(x => feed(x) && x.time && !['skipped', 'failed'].includes(x.status)).sort((a, b) => order(b) - order(a));
  const avatar = 'content/library/highlights/t-avatar.jpg';
  return `<div class="ig-phone">
    <div class="ig-prof"><img src="${avatar}" alt=""><div><b>${esc(ig.username || 'stackup.studio')}</b><span>Веб-студія · Київ<br>Сайти, які справді працюють ✦</span></div></div>
    <p class="mono ig-hint">ТАК БУДЕ ВИГЛЯДАТИ ПРОФІЛЬ. НАПІВПРОЗОРІ ЩЕ ЧЕКАЮТЬ НА ЗАТВЕРДЖЕННЯ.</p>
    <div class="ig-grid">${list.map(x => `<button type="button" class="ig-cell s-${esc(x.status)}" data-item="${esc(x.id)}"><img src="${esc(thumbOf(x))}" alt="${esc(x.title)}" loading="lazy">${x.kind === 'reel' ? '<i>▶</i>' : (x.media || []).length > 1 ? '<i>❐</i>' : ''}${x.pin ? '<s>📌</s>' : ''}</button>`).join('') || '<p class="empty">Поки порожньо.</p>'}</div>
  </div>`;
}

/* ---------- перегляд публікації ---------- */
function startEdit(x) { const n = x.baseMedia.length; ed = { id: x.id, order: x.order.concat(range(n).filter(i => !x.order.includes(i))), off: {} }; range(n).forEach(i => { if (!x.order.includes(i)) ed.off[i] = 1; }); }
function openItem(id) { open = id; slide = 0; ed = null; renderViewer(); $('#viewer').hidden = false; document.documentElement.classList.add('noscroll'); requestAnimationFrame(() => $('#viewer').classList.add('in')); }
function closeItem() { open = null; $('#viewer').classList.remove('in'); document.documentElement.classList.remove('noscroll'); setTimeout(() => { if (!open) { $('#viewer').hidden = true; $('#viewer').innerHTML = ''; } }, 220); }
function renderViewer() {
  const x = items().find(i => i.id === open); if (!x) return closeItem();
  if (!ed || ed.id !== x.id) startEdit(x);
  const locked = ['published', 'publishing'].includes(x.status);
  const canOrder = !locked && x.kind !== 'reel' && x.baseMedia.length > 1;
  const ordIdx = canOrder ? ed.order : x.order;
  const media = ordIdx.map(i => x.baseMedia[i]), thumbsAll = ordIdx.map(i => x.baseThumbs[i] || x.baseMedia[i]), n = media.length;
  slide = Math.max(0, Math.min(slide, n - 1));
  const off = canOrder && ed.off[ordIdx[slide]];
  const stage = x.kind === 'reel' && x.video
    ? `<video src="${esc(path(x.video))}" poster="${esc(path(media[0]))}" controls playsinline preload="metadata"></video>`
    : `<img src="${esc(path(media[slide]))}" alt="${esc(x.title)}, ${slide + 1} з ${n}"${off ? ' class="off"' : ''}>${off ? '<span class="v-off mono">ЦЕЙ КАДР НЕ ПУБЛІКУЄТЬСЯ</span>' : ''}`;
  const draftTitle = $('#vTitle') && $('#vTitle').dataset.id === x.id ? $('#vTitle').value : x.title;
  const draftCap = $('#vCaption') && $('#vCaption').dataset.id === x.id ? $('#vCaption').value : x.caption;
  const draftAt = $('#vAt') && $('#vAt').dataset.id === x.id ? $('#vAt').value : localInput(x.at || x.proposedAt || new Date(Date.now() + DAY).toISOString());
  const all = items(), i = all.findIndex(a => a.id === x.id);
  $('#viewer').innerHTML = `<div class="v-in" role="dialog" aria-modal="true" aria-label="${esc(x.title)}">
    <div class="v-stage k-${esc(x.kind)}">
      <div class="v-frame">${stage}
        ${n > 1 && x.kind !== 'reel' ? `<button type="button" class="v-arrow l" data-slide="-1" aria-label="Назад"${slide ? '' : ' disabled'}>‹</button><button type="button" class="v-arrow r" data-slide="1" aria-label="Далі"${slide < n - 1 ? '' : ' disabled'}>›</button>` : ''}
      </div>
      ${n > 1 && x.kind !== 'reel' ? `<div class="v-dots">${media.map((_, k) => `<button type="button" data-goto="${k}" aria-label="Кадр ${k + 1}"${k === slide ? ' aria-current="true"' : ''}></button>`).join('')}</div>
      <div class="v-thumbs${canOrder ? ' edit' : ''}">${thumbsAll.map((t, k) => `<span class="v-th${canOrder && ed.off[ordIdx[k]] ? ' off' : ''}"><button type="button" data-goto="${k}"${k === slide ? ' aria-current="true"' : ''}><img src="${esc(path(t))}" alt="" loading="lazy"><em class="mono">${k + 1}</em></button>${canOrder ? `<span class="v-th-acts"><button type="button" data-move="${k}" data-dir="-1" aria-label="Перемістити кадр ${k + 1} лівіше"${k ? '' : ' disabled'}>‹</button><button type="button" data-hide="${k}" aria-label="${ed.off[ordIdx[k]] ? 'Повернути' : 'Приховати'} кадр ${k + 1}">${ed.off[ordIdx[k]] ? '＋' : '−'}</button><button type="button" data-move="${k}" data-dir="1" aria-label="Перемістити кадр ${k + 1} правіше"${k < n - 1 ? '' : ' disabled'}>›</button></span>` : ''}</span>`).join('')}</div>
      ${canOrder ? '<p class="mono v-hint center">‹ › ЗМІНИТИ ПОРЯДОК · − ПРИХОВАТИ КАДР</p>' : ''}` : ''}
    </div>
    <div class="v-side">
      <div class="v-nav"><span class="mono">${i + 1} / ${all.length}</span><div class="pager"><button type="button" data-step="-1" aria-label="Попередня"${i > 0 ? '' : ' disabled'}>←</button><button type="button" data-step="1" aria-label="Наступна"${i < all.length - 1 ? '' : ' disabled'}>→</button></div><button type="button" class="icon-btn" id="vClose" aria-label="Закрити">×</button></div>
      <div class="v-head"><span class="mono">${esc(KIND[x.kind] || '')}${n > 1 ? ' · ' + n + ' КАДРІВ' : ''}${x.series ? ' · ' + esc(x.series.toUpperCase()) : ''}</span>${chip(x.status)}</div>
      ${locked ? `<h2>${esc(x.title)}</h2>` : `<label class="v-label mono" for="vTitle">НАЗВА (ДЛЯ ТЕБЕ, В INSTAGRAM НЕ ПОТРАПЛЯЄ)</label><input type="text" id="vTitle" class="v-title" data-id="${esc(x.id)}" maxlength="120" value="${esc(draftTitle)}">`}
      ${x.note ? `<p class="v-note"><span class="mono">ВІД CLAUDE</span>${esc(x.note)}</p>` : ''}
      ${x.status === 'changes' && x.st.comment ? `<p class="v-note rose"><span class="mono">ТВОЇ ПРАВКИ</span>${esc(x.st.comment)}</p>` : ''}
      ${x.status === 'failed' ? `<p class="v-note err"><span class="mono">ПОМИЛКА ПУБЛІКАЦІЇ</span>${esc(x.st.error)}</p>` : ''}
      ${x.status === 'published' ? `<p class="v-note mint"><span class="mono">ОПУБЛІКОВАНО ${esc(when(x.st.publishedAt).toUpperCase())}</span>${safeHttp(x.st.permalink) ? `<a href="${esc(x.st.permalink)}" target="_blank" rel="noopener noreferrer">Відкрити в Instagram ↗</a>` : 'Готово.'}${x.highlight ? ` Додай ці сторіс у хайлайт «${esc(x.highlight)}» у застосунку Instagram.` : ''}</p>` : ''}
      ${x.kind !== 'stories' ? `<label class="v-label mono" for="vCaption">ПІДПИС <em id="capLen">${draftCap.length} / 2200</em></label>
      <textarea id="vCaption" data-id="${esc(x.id)}" rows="9" maxlength="2200"${locked ? ' readonly' : ''}>${esc(draftCap)}</textarea>
      <button type="button" class="link mono" id="copyCap">КОПІЮВАТИ ПІДПИС</button>` : `<p class="v-label mono">СТОРІС ВИЙДУТЬ ПО ЧЕРЗІ, КАДР ЗА КАДРОМ</p>`}
      ${locked ? '' : `<label class="v-label mono" for="vAt">ДАТА І ЧАС ПУБЛІКАЦІЇ ${x.proposedAt && !x.at ? '<em>ПРОПОНУЮ ' + esc(when(x.proposedAt).toUpperCase()) + '</em>' : ''}</label>
      <input type="datetime-local" id="vAt" data-id="${esc(x.id)}" value="${esc(draftAt)}">
      <div class="v-acts">
        <button type="button" class="button primary" data-op="approve"><b>${x.status === 'scheduled' ? 'Зберегти зміни' : x.status === 'failed' ? 'Спробувати знову' : 'Затвердити і запланувати'}</b><span>✓</span></button>
        <button type="button" class="button ghost" data-op="now"><b>Опублікувати зараз</b><span>↗︎</span></button>
        ${x.status !== 'scheduled' ? '<button type="button" class="button ghost" data-op="edit"><b>Зберегти правки без затвердження</b><span>✎</span></button>' : ''}
      </div>
      <details class="v-changes"${x.status === 'changes' ? ' open' : ''}><summary class="mono">ПОВЕРНУТИ НА ПРАВКИ</summary>
        <textarea id="vComment" rows="3" maxlength="2000" placeholder="Що змінити? Наприклад: темніший фон на 2 слайді, коротший підпис"></textarea>
        <button type="button" class="button ghost sm" data-op="changes"><b>Надіслати правки</b><span>→</span></button></details>
      <div class="v-more">${x.status === 'scheduled' ? '<button type="button" class="link mono" data-op="review">ЗНЯТИ З ПЛАНУ</button>' : ''}${x.status !== 'skipped' ? '<button type="button" class="link mono" data-op="skip">НЕ ПУБЛІКУВАТИ</button>' : '<button type="button" class="link mono" data-op="review">ПОВЕРНУТИ НА ЗАТВЕРДЖЕННЯ</button>'}</div>`}
      ${x.pin ? '<p class="mono v-hint">📌 ПІСЛЯ ПУБЛІКАЦІЇ ЗАКРІПИ ЦЕЙ ПОСТ У ПРОФІЛІ (INSTAGRAM НЕ ДАЄ ЗРОБИТИ ЦЕ АВТОМАТИЧНО)</p>' : ''}
    </div>
  </div>`;
}
function viewerAct(op) {
  const x = items().find(i => i.id === open); if (!x) return;
  const cap = $('#vCaption') ? $('#vCaption').value : undefined;
  const capOut = cap == null ? undefined : cap.trim() === x.baseCaption.trim() ? '' : cap; // '' = підпис від Claude
  const tv = $('#vTitle') ? $('#vTitle').value.trim() : undefined;
  const titleOut = tv == null ? undefined : !tv || tv === x.baseTitle ? '' : tv;
  let slidesOut;
  if (ed && ed.id === x.id && x.kind !== 'reel' && x.baseMedia.length > 1) {
    const inc = ed.order.filter(i => !ed.off[i]);
    if (!inc.length) return C.toast('<b>Залиш хоча б один кадр.</b>');
    slidesOut = inc.join(',') === range(x.baseMedia.length).join(',') ? '' : inc.join(',');
  }
  const edits = { caption: capOut, title: titleOut, slides: slidesOut };
  if (op === 'approve') {
    const v = $('#vAt').value, d = new Date(v);
    if (!v || isNaN(d)) return C.toast('<b>Вкажіть дату і час.</b>');
    if (d < Date.now() - 5 * 60000 && !confirm('Цей час уже минув. Опублікувати при найближчій перевірці (до 10 хв)?')) return;
    return act(x.id, 'approve', { at: d.toISOString(), ...edits });
  }
  if (op === 'edit') return act(x.id, 'edit', edits);
  if (op === 'now') { if (!confirm('Опублікувати «' + x.title + '» в Instagram зараз?')) return; return act(x.id, 'now', edits); }
  if (op === 'changes') { const c = $('#vComment').value.trim(); if (!c) { $('#vComment').focus(); return; } return act(x.id, 'changes', { comment: c, ...edits }); }
  if (op === 'skip' && !confirm('Не публікувати «' + x.title + '»? Її можна буде повернути.')) return;
  act(x.id, op, {});
}
function copyChanges() {
  const list = byStatus('changes');
  const txt = 'Правки до контенту Stackup (' + new Date().toLocaleDateString('uk-UA') + '):\n\n' + list.map(x => '• ' + x.title + ' [' + x.id + ']\n  ' + x.st.comment).join('\n\n');
  navigator.clipboard && navigator.clipboard.writeText(txt).then(() => C.toast('<span class="mono">СКОПІЙОВАНО</span> <b>Встав це в чат зі мною, і я все виправлю.</b>', 5000));
}

/* ---------- матеріали ---------- */
async function renderLibrary() {
  const el = $('#secLibrary');
  if (!library) {
    el.innerHTML = head('Матеріали', 'ЗАВАНТАЖУЄМО…');
    try { library = await fetchJson(BASE + 'library.json'); } catch (e) { el.innerHTML = head('Матеріали', '') + '<p class="empty big">Не вдалося завантажити матеріали.</p>'; return; }
    if (sec !== 'library') return;
  }
  const g = library.groups || [];
  el.innerHTML = head('Матеріали', 'УСЕ, ЩО МИ СТВОРИЛИ ДЛЯ STACKUP') +
    `<nav class="lib-nav">${g.map(x => `<a href="#lib-${esc(x.id)}" data-libjump="${esc(x.id)}">${esc(x.title)} <sup>${x.items.length}</sup></a>`).join('')}</nav>` +
    g.map(x => `<section class="lib-g" id="lib-${esc(x.id)}"><div class="panel-h"><h2>${esc(x.title)}</h2><span class="mono">${x.items.length}</span></div>${x.note ? `<p class="lib-note">${esc(x.note)}</p>` : ''}
      <div class="lib-grid g-${esc(x.id)}">${x.items.map((f, k) => f.type === 'link'
        ? `<a class="lib-link" href="${esc(link(f.link))}" target="_blank" rel="noopener"><b>${esc(f.name)}</b><span class="mono">${esc(location.origin + link(f.link))}</span><button type="button" class="link mono" data-copylink="${esc(link(f.link))}">КОПІЮВАТИ</button></a>`
        : f.type === 'pdf'
          ? `<a class="lib-item pdf" href="${esc(path(f.file))}" target="_blank" rel="noopener"><span class="lib-img"><img src="${esc(path(f.thumb))}" alt="" loading="lazy"></span><b>${esc(f.name)}</b><span class="mono">PDF · ВІДКРИТИ</span></a>`
          : `<button type="button" class="lib-item" data-lib="${esc(x.id)}" data-k="${k}"><span class="lib-img${['png'].includes(f.type) ? ' check' : ''}"><img src="${esc(path(f.thumb || f.file))}" alt="" loading="lazy"></span><b>${esc(f.name)}</b></button>`).join('')}</div></section>`).join('');
}
function openLib(gid, k) {
  const g = (library.groups || []).find(x => x.id === gid); if (!g) return;
  const f = g.items[k]; if (!f) return;
  $('#viewer').innerHTML = `<div class="v-in lib-v" role="dialog" aria-modal="true" aria-label="${esc(f.name)}">
    <div class="v-stage"><div class="v-frame${f.type === 'png' ? ' check' : ''}"><img src="${esc(path(f.file))}" alt="${esc(f.name)}">
    <button type="button" class="v-arrow l" data-libgo="${k - 1}" data-libg="${esc(gid)}"${k > 0 ? '' : ' disabled'} aria-label="Назад">‹</button><button type="button" class="v-arrow r" data-libgo="${k + 1}" data-libg="${esc(gid)}"${k < g.items.length - 1 ? '' : ' disabled'} aria-label="Далі">›</button></div></div>
    <div class="v-side"><div class="v-nav"><span class="mono">${k + 1} / ${g.items.length}</span><span></span><button type="button" class="icon-btn" id="vClose" aria-label="Закрити">×</button></div>
    <span class="mono">${esc(g.title.toUpperCase())}</span><h2>${esc(f.name)}</h2>
    <div class="v-acts"><a class="button primary" href="${esc(path(f.file))}" download="${esc(f.name)}"><b>Завантажити</b><span>↓</span></a><a class="button ghost" href="${esc(path(f.file))}" target="_blank" rel="noopener"><b>Відкрити окремо</b><span>↗︎</span></a></div></div></div>`;
  open = null; $('#viewer').hidden = false; document.documentElement.classList.add('noscroll'); requestAnimationFrame(() => $('#viewer').classList.add('in'));
}

/* ---------- налаштування ---------- */
function renderSettings() {
  const exp = ig.tokenExp ? new Date(ig.tokenExp) : null;
  $('#secSettings').innerHTML = head('Налаштування', '') + `<nav class="more-nav">${[['strategy', '◎', 'Стратегія', 'Тренди, ринок, навчання'], ['mail', '✉', 'Розсилки', 'Листи клієнтам'], ['library', '❒', 'Матеріали', 'Бренд, логотипи, фото']].map(([k, i, l, d]) => `<button type="button" data-sec="${k}"><span>${i}</span><b>${l}</b><small>${d}</small></button>`).join('')}</nav><div class="set-grid">
    <section class="panel"><div class="panel-h"><h2>Claude в адмінці</h2>${ai.connected ? '<span class="pill mint">ПІДКЛЮЧЕНО</span>' : C.demo ? '<span class="pill line">ДЕМО</span>' : '<span class="pill peach">ПОТРІБЕН КЛЮЧ</span>'}</div>
      <p class="lib-note">Аналіз заявок, чернетки відповідей і нагадувань. Claude нічого не надсилає сам: чернетка з’являється в полі листа, а надсилаєш ти після підтвердження.</p>
      ${ai.connected ? '' : `<ol class="steps"><li>Зайди на console.anthropic.com, увійди і поповни баланс (вистачить $5–10 на місяці).</li><li>API keys → Create key, скопіюй ключ (починається з sk-ant-).</li><li>Google Apps Script → Project Settings → Script properties: <code>ANTHROPIC_KEY</code> = ключ.</li><li>Онови сторінку. Ключ не потрапляє в адмінку і в браузер.</li></ol>`}</section>
    <section class="panel"><div class="panel-h"><h2>Пошта і нагадування</h2></div>
      <p class="lib-note">Листи клієнтам ідуть з твоєї Gmail лише після кнопки «Підтверджую, надіслати». Кожен лист записується в аркуш «Листування».</p>
      <p class="lib-note">Щоранку о 9:00 у Telegram приходить дайджест: що сьогодні виходить, що чекає затвердження, задачі, нові заявки, свята тижня. У понеділок нагадування про розбір стратегії.</p></section>
    <section class="panel"><div class="panel-h"><h2>Instagram</h2>${ig.connected ? '<span class="pill mint">ПІДКЛЮЧЕНО</span>' : '<span class="pill peach">НЕ ПІДКЛЮЧЕНО</span>'}</div>
      ${ig.connected ? `<dl class="kv"><dt>Акаунт</dt><dd>@${esc(ig.username)}</dd><dt>Ключ доступу</dt><dd>оновлюється сам${exp ? ', зараз діє до ' + esc(fmt(exp, { day: 'numeric', month: 'long' })) : ''}</dd><dt>Планувальник</dt><dd>${ig.lastTick ? 'остання перевірка ' + esc(when(new Date(ig.lastTick))) : 'ще не запускався'}</dd></dl>
      <p class="lib-note">Затверджені пости, каруселі, сторіс і рілс публікуються самі в указаний час (перевірка кожні 10 хвилин). Про кожну публікацію приходить повідомлення в Telegram.</p>`
      : `<p class="lib-note">Щоб пости публікувалися самі, потрібен ключ доступу від Meta. Це роблять один раз, приблизно 10 хвилин. Я надішлю покрокову інструкцію в чат.</p>
      <ol class="steps"><li>Instagram Stackup має бути професійним акаунтом (Бізнес або Автор).</li><li>На developers.facebook.com створюємо застосунок з продуктом «Instagram» і отримуємо ключ.</li><li>У Google Apps Script додаємо властивість <code>IG_TOKEN</code> і запускаємо <code>connectInstagram</code>.</li></ol>
      <p class="lib-note">${ig.scheduler ? 'Планувальник уже працює: остання перевірка ' + esc(when(new Date(ig.lastTick))) + '.' : 'Ще потрібно один раз запустити <code>setupContent</code> у Google Apps Script.'}</p>`}
    </section>
    <section class="panel"><div class="panel-h"><h2>Посилання для клієнтів</h2></div>
      <button type="button" class="lib-link" data-copylink="/brief.html?mode=has"><b>Клієнт має ТЗ</b><span class="mono">КОПІЮВАТИ ПОСИЛАННЯ</span></button>
      <button type="button" class="lib-link" data-copylink="/brief.html?mode=none"><b>Створити ТЗ з нами</b><span class="mono">КОПІЮВАТИ ПОСИЛАННЯ</span></button></section>
    <section class="panel"><div class="panel-h"><h2>Як працює контент</h2></div>
      <ol class="steps"><li>Я готую пости, каруселі, сторіс і рілс та пропоную дату.</li><li>Вони з’являються в «На затвердженні», а в Telegram приходить сповіщення.</li><li>Ти затверджуєш (можна змінити підпис і час) або повертаєш на правки з коментарем.</li><li>Затверджене публікується саме. Правки копіюєш кнопкою і надсилаєш мені в чат.</li></ol></section>
    <section class="panel"><div class="panel-h"><h2>Акаунт</h2></div>
      <div class="set-acts"><button type="button" class="button ghost" data-proxy="bellBtn"><b>Сповіщення на цьому пристрої</b><span>🔔</span></button>
      <button type="button" class="button ghost" data-proxy="logoutBtn"><b>Вийти</b><span>→</span></button>
      <button type="button" class="button ghost" data-proxy="logoutAllBtn"><b>Вийти на всіх пристроях</b><span>⏻</span></button></div></section>
  </div>`;
}

/* ---------- задачі ---------- */
const PRIO = { urgent: ['Терміново', 'err'], high: ['Високий', 'peach'], normal: ['Звичайний', 'blue'], low: ['Низький', 'line'] };
const today = () => localInput(new Date().toISOString()).slice(0, 10);
const openTasks = () => tasks.filter(t => t.status !== 'done');
const hotTasks = () => openTasks().filter(t => t.priority === 'urgent' || (t.due && t.due <= today()));
const prioRank = t => Object.keys(PRIO).indexOf(t.priority);
const sortTasks = l => l.slice().sort((a, b) => prioRank(a) - prioRank(b) || (a.due || '9') .localeCompare(b.due || '9') || String(a.created).localeCompare(String(b.created)));
let tfilter = store.get('stackup-hub-tfilter', 'open'), tedit = null, taskBusy = false;
function demoTasks() {
  const d = n => localInput(new Date(Date.now() + n * DAY).toISOString()).slice(0, 10), c = new Date().toISOString();
  return [
    { id: 'tdemo01', title: 'Відповісти Coffee Lab на бриф', priority: 'urgent', status: 'open', due: d(0), lead: '261101-A7F2', note: 'Уточнити, чи потрібен онлайн-магазин.', created: c },
    { id: 'tdemo02', title: 'Затвердити перші 3 каруселі для Instagram', priority: 'high', status: 'open', due: d(1), lead: '', note: '', created: c },
    { id: 'tdemo03', title: 'Надіслати КП Savchuk Dental', priority: 'high', status: 'open', due: d(2), lead: '261029-W2HC', note: '', created: c },
    { id: 'tdemo04', title: 'Урок 1: хто мій клієнт', priority: 'normal', status: 'open', due: d(3), lead: '', note: 'Розділ «Стратегія» → Навчання', created: c },
    { id: 'tdemo05', title: 'Оновити кейс Reelly на сайті', priority: 'low', status: 'open', due: '', lead: '', note: '', created: c }
  ];
}
async function saveTask(t) {
  if (taskBusy) return; taskBusy = true;
  try {
    let item;
    if (C.demo) { item = { ...t, id: t.id || 'tdemo' + Date.now().toString(36), created: t.created || new Date().toISOString(), updated: new Date().toISOString() }; }
    else item = (await C.call({ action: 'taskSave', ...t })).item;
    const i = tasks.findIndex(x => x.id === item.id);
    if (i >= 0) tasks[i] = item; else tasks.push(item);
    if (C.demo) store.set('stackup-demo-tasks', tasks);
    renderAll(); return item;
  } catch (e) { C.toast('<span class="mono">ПОМИЛКА</span> <b>Не вдалося зберегти задачу.</b>', 5000); }
  finally { taskBusy = false; }
}
async function deleteTask(id) {
  try {
    if (!C.demo) await C.call({ action: 'taskDelete', id });
    tasks = tasks.filter(x => x.id !== id); if (C.demo) store.set('stackup-demo-tasks', tasks);
    if (tedit === id) tedit = null; renderAll();
  } catch (e) { C.toast('<span class="mono">ПОМИЛКА</span> <b>Не вдалося видалити.</b>'); }
}
const leadName = id => { const l = C.leads().find(x => x.id === id); return l ? l.company || l.name : ''; };
function dueChip(t) {
  if (!t.due) return '';
  const late = t.status !== 'done' && t.due < today(), now = t.due === today();
  return `<span class="due mono${late ? ' late' : now ? ' now' : ''}">${late ? 'ПРОСТРОЧЕНО · ' : now ? 'СЬОГОДНІ · ' : ''}${esc(fmt(t.due + 'T12:00:00', { day: 'numeric', month: 'short' }).toUpperCase())}</span>`;
}
function taskRow(t, compact) {
  const [pl, pt] = PRIO[t.priority] || PRIO.normal;
  return `<li class="task p-${esc(t.priority)}${t.status === 'done' ? ' done' : ''}">
    <button type="button" class="tk-check" data-tdone="${esc(t.id)}" aria-label="${t.status === 'done' ? 'Повернути в роботу' : 'Позначити виконаною'}" aria-pressed="${t.status === 'done'}">${t.status === 'done' ? '✓' : ''}</button>
    <div class="tk-body"><b>${esc(t.title)}</b>
      <span class="tk-meta"><span class="pill ${pt}">${esc(pl)}</span>${dueChip(t)}${t.lead && leadName(t.lead) ? `<button type="button" class="link mono" data-lead="${esc(t.lead)}">↗ ${esc(leadName(t.lead).toUpperCase())}</button>` : ''}</span>
      ${!compact && t.note ? `<small>${esc(t.note)}</small>` : ''}</div>
    ${compact ? '' : `<div class="tk-acts"><button type="button" class="link mono" data-tedit="${esc(t.id)}">ЗМІНИТИ</button><button type="button" class="link mono" data-tdel="${esc(t.id)}">ВИДАЛИТИ</button></div>`}
  </li>`;
}
function taskForm() {
  const t = tasks.find(x => x.id === tedit) || { priority: 'normal' };
  const L = C.leads().filter(x => x.status !== 'archive');
  return `<form class="panel tk-form" id="taskForm"><div class="panel-h"><h2>${tedit ? 'Змінити задачу' : 'Нова задача'}</h2>${tedit ? '<button type="button" class="link mono" id="tCancel">СКАСУВАТИ</button>' : ''}</div>
    <input type="text" id="tTitle" maxlength="200" placeholder="Що зробити? Наприклад: надіслати КП Coffee Lab" value="${esc(t.title || '')}" required>
    <div class="tk-prio" role="radiogroup" aria-label="Пріоритет">${Object.entries(PRIO).map(([k, [l, tone]]) => `<label class="pr-${tone}"><input type="radio" name="tPrio" value="${k}"${(t.priority || 'normal') === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <div class="tk-row"><label class="v-label mono">ТЕРМІН<input type="date" id="tDue" value="${esc(t.due || '')}"></label>
      <label class="v-label mono">ЗАЯВКА<select id="tLead"><option value="">Без заявки</option>${L.map(l => `<option value="${esc(l.id)}"${t.lead === l.id ? ' selected' : ''}>${esc(l.company || l.name)}</option>`).join('')}</select></label></div>
    <textarea id="tNote" rows="2" maxlength="2000" placeholder="Нотатка (не обов’язково)">${esc(t.note || '')}</textarea>
    <button type="submit" class="button primary"><b>${tedit ? 'Зберегти' : 'Додати задачу'}</b><span>＋</span></button></form>`;
}
function renderTasks() {
  const all = sortTasks(tasks), open = all.filter(t => t.status !== 'done');
  const list = { open, today: open.filter(t => t.priority === 'urgent' || (t.due && t.due <= today())), done: all.filter(t => t.status === 'done').reverse(), all }[tfilter] || open;
  const F = [['open', 'Відкриті', open.length], ['today', 'На сьогодні', hotTasks().length], ['done', 'Виконані', all.length - open.length], ['all', 'Усі', all.length]];
  const groups = tfilter === 'done' || tfilter === 'all' ? [['', list]] : Object.keys(PRIO).map(k => [k, list.filter(t => t.priority === k)]).filter(g => g[1].length);
  $('#secTasks').innerHTML = head('Задачі', `${open.length} ВІДКРИТИХ · ${hotTasks().length} НА СЬОГОДНІ`) +
    `<div class="tk-wrap"><div><div class="ctabs" role="tablist">${F.map(([k, l, n]) => `<button type="button" role="tab" data-tfilter="${k}" aria-selected="${tfilter === k}">${l} <sup>${n}</sup></button>`).join('')}</div>
    ${!tasksLoaded && !C.demo ? '<p class="empty big">Задачі ще не підключено. Запусти <code>setupContent</code> у Google Apps Script після оновлення коду.</p>' :
      list.length ? groups.map(([k, l]) => `${k ? `<h3 class="sub-h tk-h"><i class="pill ${PRIO[k][1]}"></i>${PRIO[k][0]} · ${l.length}</h3>` : ''}<ul class="tasks">${l.map(t => taskRow(t)).join('')}</ul>`).join('')
      : `<p class="empty big">${tfilter === 'done' ? 'Виконаних поки немає.' : 'Усе зроблено. Додай нову задачу праворуч.'}</p>`}</div>
    ${taskForm()}</div>`;
}

/* ---------- розсилки ---------- */
const TEMPLATES = [
  { id: 'ny', name: 'Привітання з Новим роком', subject: 'З Новим роком від Stackup ✦', body: 'Вітаю, {{name}}!\n\nДякую, що цього року були з нами. Бажаю, щоб у новому році ваш бізнес ріс, а сайт приводив клієнтів, поки ви відпочиваєте.\n\nЯкщо плануєте оновлення сайту чи новий проєкт у 2027, напишіть, підготую ідеї безкоштовно.\n\nЛана, Stackup\nstackup.studio' },
  { id: 'follow', name: 'Нагадування після КП', subject: 'Щодо проєкту {{company}}', body: 'Вітаю, {{name}}!\n\nНагадую про пропозицію для {{company}}. Якщо є питання чи хочеться щось змінити в обсязі або бюджеті, давайте обговоримо, підлаштуємось.\n\nЛана, Stackup' },
  { id: 'case', name: 'Новий кейс у портфоліо', subject: 'Новий проєкт Stackup', body: 'Вітаю, {{name}}!\n\nМи щойно запустили новий проєкт і хочу поділитися: stackup.studio\n\nЯкщо вам теж потрібен сайт, який продає, буду рада допомогти.\n\nЛана, Stackup' },
  { id: 'blank', name: 'Порожній лист', subject: '', body: 'Вітаю, {{name}}!\n\n\n\nЛана, Stackup' }
];
let mailMeta = null, mailPick = null, mailStage = 'all', mailConfirm = false, mailBusy = false;
const mailDraft = store.get('stackup-mail-draft', { subject: TEMPLATES[0].subject, body: TEMPLATES[0].body });
const validEmail = e => /^[^\s@<>"'(),;:\\]+@[^\s@<>"'(),;:\\]+\.[a-z]{2,}$/i.test(String(e || '').trim());
const optout = () => (mailMeta && mailMeta.optout) || store.get('stackup-demo-optout', []);
const fillTpl = (s, l) => String(s).replace(/\{\{\s*name\s*\}\}/g, String(l.name || '').split(/\s+/)[0] || 'вітаю').replace(/\{\{\s*company\s*\}\}/g, l.company || l.name || '');
async function loadMailMeta() {
  if (C.demo) { mailMeta = { optout: store.get('stackup-demo-optout', []), quota: 100, log: store.get('stackup-demo-maillog', []) }; return; }
  try { mailMeta = await C.call({ action: 'mailMeta' }); } catch (e) { mailMeta = { optout: [], quota: null, log: [], error: e.message }; }
}
function renderMail() {
  const el = $('#secMail');
  if (!mailMeta) { el.innerHTML = head('Розсилки', 'ЗАВАНТАЖУЄМО…'); loadMailMeta().then(() => { if (sec === 'mail') renderMail(); }); return; }
  const off = optout().map(x => x.toLowerCase());
  const L = C.leads().filter(l => validEmail(l.email));
  const stages = C.stages();
  const shown = L.filter(l => mailStage === 'all' ? l.status !== 'archive' : l.status === mailStage);
  if (!mailPick) mailPick = {};
  const picked = L.filter(l => mailPick[l.id] && !off.includes(String(l.email).toLowerCase()));
  const first = picked[0] || shown[0] || { name: 'Олена', company: 'Coffee Lab' };
  const sel = mailDraft; previewFor = first;
  el.innerHTML = head('Розсилки', 'ЛИСТИ ЙДУТЬ З ТВОЄЇ ПОШТИ · ЛИШЕ ПІСЛЯ ПІДТВЕРДЖЕННЯ') + `<div class="ml-wrap">
    <section class="panel ml-compose"><div class="panel-h"><h2>Лист</h2><select id="mTpl" aria-label="Шаблон"><option value="">Шаблони…</option>${TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      <label class="v-label mono" for="mSubject">ТЕМА</label><input type="text" id="mSubject" maxlength="200" value="${esc(sel.subject)}">
      <label class="v-label mono" for="mBody">ТЕКСТ <em>{{name}} — ІМʼЯ · {{company}} — КОМПАНІЯ</em></label><textarea id="mBody" rows="11" maxlength="20000">${esc(sel.body)}</textarea>
      <p class="v-label mono">ТАК ПОБАЧИТЬ ${esc(String(first.name || '').toUpperCase())}</p>
      <div class="ml-preview" id="mPreview"><b>${esc(fillTpl(sel.subject, first))}</b><p>${esc(fillTpl(sel.body, first)).replace(/\n/g, '<br>')}</p><small>—<br>Якщо не хочете отримувати такі листи, дайте відповідь «відписатися», і ми більше не напишемо.</small></div>
      ${mailConfirm ? `<div class="confirm-box"><p><b>Надіслати ${picked.length} ${picked.length === 1 ? 'лист' : picked.length < 5 ? 'листи' : 'листів'}?</b> Кожен отримає окремий лист зі своїм іменем. Скасувати після надсилання не можна.</p><p class="mono">${picked.slice(0, 12).map(l => esc(l.company || l.name)).join(' · ')}${picked.length > 12 ? ' …' : ''}</p>
        <div class="v-acts"><button type="button" class="button primary" id="mSendYes"${mailBusy ? ' disabled' : ''}><b>${mailBusy ? 'Надсилаю…' : 'Підтверджую, надіслати'}</b><span>✓</span></button><button type="button" class="button ghost" id="mSendNo"><b>Скасувати</b><span>×</span></button></div></div>`
      : `<button type="button" class="button primary" id="mSend"${picked.length ? '' : ' disabled'}><b>${picked.length ? 'Надіслати ' + picked.length + ' отримувачам…' : 'Обери отримувачів'}</b><span>→</span></button>`}
      ${mailMeta.quota != null ? `<p class="mono v-hint">ЛІМІТ GOOGLE НА СЬОГОДНІ: ${esc(mailMeta.quota)} ЛИСТІВ</p>` : ''}
    </section>
    <section class="panel ml-to"><div class="panel-h"><h2>Кому</h2><span class="mono">${picked.length} ОБРАНО</span></div>
      <div class="chips"><button type="button" data-mstage="all" aria-pressed="${mailStage === 'all'}">Усі активні</button>${stages.map(s => `<button type="button" data-mstage="${esc(s.id)}" aria-pressed="${mailStage === s.id}">${esc(s.name)}</button>`).join('')}<button type="button" data-mstage="archive" aria-pressed="${mailStage === 'archive'}">Архів</button></div>
      <div class="ml-bulk"><button type="button" class="link mono" id="mAll">ОБРАТИ ВСІХ ТУТ</button><button type="button" class="link mono" id="mNone">ЗНЯТИ ВСЕ</button></div>
      <ul class="ml-list">${shown.map(l => { const no = off.includes(String(l.email).toLowerCase()); return `<li class="${no ? 'off' : ''}"><label><input type="checkbox" data-mpick="${esc(l.id)}"${mailPick[l.id] && !no ? ' checked' : ''}${no ? ' disabled' : ''}><span><b>${esc(l.company || l.name)}</b><small>${esc(l.email)}</small></span></label><button type="button" class="link mono" data-optout="${esc(l.email)}" data-on="${no ? '0' : '1'}">${no ? 'ПОВЕРНУТИ' : 'ВІДПИСАТИ'}</button></li>`; }).join('') || '<li class="empty">Тут немає клієнтів з email.</li>'}</ul>
    </section>
    ${(mailMeta.log || []).length ? `<section class="panel ml-log"><div class="panel-h"><h2>Надіслані</h2></div><ul>${mailMeta.log.slice(0, 20).map(r => `<li><span class="mono">${esc(String(r.time).slice(0, 16))} · ${esc(String(r.kind).toUpperCase())}</span><b>${esc(r.subject)}</b><small>${esc(leadName(r.lead) || r.lead)} · ${esc(r.status)}</small></li>`).join('')}</ul></section>` : ''}
  </div>`;
}
let previewFor = null;
function mailPreview() {
  const el = $('#mPreview'); if (!el) return;
  const l = previewFor || { name: 'Олена', company: 'Coffee Lab' };
  el.querySelector('b').textContent = fillTpl(mailDraft.subject, l);
  el.querySelector('p').innerHTML = esc(fillTpl(mailDraft.body, l)).replace(/\n/g, '<br>');
}
async function sendMailing() {
  const off = optout().map(x => x.toLowerCase());
  const ids = C.leads().filter(l => mailPick[l.id] && validEmail(l.email) && !off.includes(String(l.email).toLowerCase())).map(l => l.id);
  const subject = mailDraft.subject.trim(), body = mailDraft.body.trim();
  if (!ids.length || !subject || !body) { mailConfirm = false; renderMail(); return C.toast('<b>Заповни тему, текст і обери отримувачів.</b>'); }
  mailBusy = true; renderMail();
  try {
    let r;
    if (C.demo) { r = { sent: ids.length }; const log = store.get('stackup-demo-maillog', []); ids.forEach(id => log.unshift({ time: new Date().toISOString().replace('T', ' '), lead: id, subject, kind: 'розсилка', status: 'демо, не надіслано' })); store.set('stackup-demo-maillog', log.slice(0, 60)); }
    else r = await C.call({ action: 'mailing', ids, subject, body, confirm: true });
    C.toast('<span class="mono">' + (C.demo ? 'ДЕМО' : 'НАДІСЛАНО') + '</span> <b>' + (C.demo ? 'У демо листи не надсилаються.' : 'Листів: ' + r.sent) + '</b>', 5000);
    mailPick = {}; mailConfirm = false; mailMeta = null;
  } catch (e) { C.toast('<span class="mono">ПОМИЛКА</span> <b>' + esc(e.message === 'mail quota' ? 'Google сьогодні вже не дозволяє стільки листів.' : e.message === 'gmail not allowed' ? 'Немає доступу до Gmail: запусти setupContent і дозволь доступ.' : 'Не вдалося надіслати.') + '</b>', 6000); mailConfirm = false; }
  finally { mailBusy = false; renderMail(); }
}
async function toggleOptout(email, on) {
  try {
    let list;
    if (C.demo) { list = store.get('stackup-demo-optout', []).filter(x => x !== email.toLowerCase()); if (on) list.push(email.toLowerCase()); store.set('stackup-demo-optout', list); }
    else list = (await C.call({ action: 'optout', email, on })).optout;
    mailMeta = { ...(mailMeta || {}), optout: list }; renderMail();
  } catch (e) { C.toast('<b>Не вдалося змінити.</b>'); }
}

/* ---------- стратегія ---------- */
const STABS = [['trends', 'Тренди дня'], ['week', 'Стратегія тижня'], ['market', 'Ринок і конкуренти'], ['learn', 'Навчання'], ['dates', 'Свята і можливості']];
let stab = store.get('stackup-hub-stab', 'trends');
const learnDone = () => store.get('stackup-learn-done', {});
const text = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const ul = l => (l || []).length ? `<ul class="bul">${l.map(x => `<li>${text(x)}</li>`).join('')}</ul>` : '';
const EVKIND = { holiday: ['Свято', 'peach'], sale: ['Знижки', 'rose'], opportunity: ['Можливість', 'mint'], industry: ['Індустрія', 'blue'], content: ['Контент', 'lav'] };
function upcoming(days) { const t0 = new Date(today() + 'T00:00:00').getTime(); return ((cal && cal.events) || []).filter(e => { const t = new Date(e.date + 'T12:00:00').getTime(); return t >= t0 && t - t0 < days * DAY; }).sort((a, b) => a.date.localeCompare(b.date)); }
function evRow(e) { const [l, t] = EVKIND[e.kind] || EVKIND.holiday; return `<li class="ev"><span class="ev-d"><b>${esc(e.date.slice(8, 10))}</b><span class="mono">${esc(fmt(e.date + 'T12:00:00', { month: 'short' }).toUpperCase())}</span></span><div><span class="pill ${t}">${l}</span><b>${esc(e.title)}</b>${e.idea ? `<p>${text(e.idea)}</p>` : ''}${e.prep ? `<small class="mono">ГОТУВАТИ: ${esc(e.prep)}</small>` : ''}</div></li>`; }
function renderStrategy() {
  const I = insights || {};
  const tabs = STABS.map(([k, l]) => `<button type="button" role="tab" data-stab="${k}" aria-selected="${stab === k}">${l}</button>`).join('');
  let body = '';
  if (!insights && stab !== 'dates') body = '<p class="empty big">Звіти ще готуються. Перший з’явиться тут найближчим часом.</p>';
  else if (stab === 'trends') {
    const list = I.trends || [];
    body = list.length ? list.slice(0, 14).map((d, k) => `<section class="panel tr-day${k ? '' : ' fresh'}"><div class="panel-h"><h2>${esc(d.title)}</h2><span class="mono">${esc(dayName(d.date + 'T12:00:00').toUpperCase())}</span></div>${d.summary ? `<p class="lib-note">${text(d.summary)}</p>` : ''}
      <div class="tr-grid">${(d.items || []).map(t => `<article class="tr"><span class="mono">${esc(t.tag || 'ТРЕНД')}</span><h3>${esc(t.title)}</h3><p>${text(t.what)}</p><p class="tr-use"><span class="mono">ЯК НАМ ВИКОРИСТАТИ</span>${text(t.use)}</p>${t.source ? `<small class="mono">ДЖЕРЕЛО: ${esc(t.source)}</small>` : ''}</article>`).join('')}</div></section>`).join('') : '<p class="empty big">Трендів поки немає.</p>';
  } else if (stab === 'week') {
    const w = (I.weekly || [])[0];
    body = w ? `<section class="panel"><div class="panel-h"><h2>${esc(w.title)}</h2><span class="mono">${esc(w.range || '')}</span></div>${w.summary ? `<p class="lib-note">${text(w.summary)}</p>` : ''}
      <div class="wk-grid">${(w.blocks || []).map(b => `<div class="wk"><span class="mono">${esc(b.title.toUpperCase())}</span>${ul(b.items)}</div>`).join('')}</div>
      ${(w.plan || []).length ? `<h3 class="sub-h">План публікацій</h3><ol class="wk-plan">${w.plan.map(p => `<li><span class="mono">${esc(p.day)}</span><b>${esc(p.what)}</b>${p.why ? `<small>${esc(p.why)}</small>` : ''}</li>`).join('')}</ol>` : ''}
      ${(w.questions || []).length ? `<h3 class="sub-h">Обговоримо в чаті</h3>${ul(w.questions)}` : ''}</section>
      ${(I.weekly || []).slice(1, 5).map(o => `<details class="panel wk-old"><summary><b>${esc(o.title)}</b><span class="mono">${esc(o.range || '')}</span></summary>${o.summary ? `<p class="lib-note">${text(o.summary)}</p>` : ''}${(o.blocks || []).map(b => `<p class="mono">${esc(b.title.toUpperCase())}</p>${ul(b.items)}`).join('')}</details>`).join('')}` : '<p class="empty big">Перший розбір тижня буде в понеділок.</p>';
  } else if (stab === 'market') {
    const m = I.market || {};
    body = `<section class="panel"><div class="panel-h"><h2>Ринок розробки сайтів</h2><span class="mono">ОНОВЛЕНО ${esc(String(m.updated || '').toUpperCase())}</span></div>${m.summary ? `<p class="lib-note">${text(m.summary)}</p>` : ''}
      ${(m.facts || []).length ? `<div class="mk-facts">${m.facts.map(f => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div>` : ''}</section>
      <div class="mk-two"><section class="panel plus"><div class="panel-h"><h2>Наші плюси</h2></div>${ul(m.ourPluses)}</section><section class="panel minus"><div class="panel-h"><h2>Наші слабкі місця</h2></div>${ul(m.ourMinuses)}</section></div>
      <h3 class="sub-h">Конкуренти</h3><div class="mk-grid">${(m.competitors || []).map(c => `<article class="panel mk"><span class="mono">${esc(c.type)}</span><h3>${esc(c.name)}</h3>${c.price ? `<p class="mono mk-price">${esc(c.price)}</p>` : ''}<p class="mono">СИЛЬНІ</p>${ul(c.pluses)}<p class="mono">СЛАБКІ</p>${ul(c.minuses)}${c.takeaway ? `<p class="tr-use"><span class="mono">ЩО ЦЕ ДАЄ НАМ</span>${text(c.takeaway)}</p>` : ''}</article>`).join('')}</div>
      ${(m.gaps || []).length ? `<section class="panel"><div class="panel-h"><h2>Де ми можемо виграти</h2></div>${ul(m.gaps)}</section>` : ''}
      ${m.positioning ? `<section class="panel acid-p"><div class="panel-h"><h2>Наше позиціювання</h2></div><p class="big-quote">${text(m.positioning)}</p></section>` : ''}
      ${(m.sources || []).length ? `<p class="mono v-hint">ДЖЕРЕЛА: ${m.sources.map(esc).join(' · ')}</p>` : ''}`;
  } else if (stab === 'learn') {
    const L = I.lessons || [], done = learnDone(), n = L.filter(l => done[l.id]).length;
    body = `<section class="panel"><div class="panel-h"><h2>Бізнес і маркетинг без болю</h2><span class="mono">${n} / ${L.length} ПРОЙДЕНО</span></div><p class="lib-note">${text(I.learnIntro || 'Короткі уроки по 5–10 хвилин. Кожен закінчується однією дією для Stackup.')}</p><div class="lr-bar"><i style="width:${L.length ? Math.round(n / L.length * 100) : 0}%"></i></div></section>
      ${L.map((l, k) => `<details class="panel lesson${done[l.id] ? ' done' : ''}"${!done[l.id] && L.findIndex(x => !done[x.id]) === k ? ' open' : ''}><summary><span class="mono">${String(k + 1).padStart(2, '0')} · ${esc(String(l.module || '').toUpperCase())} · ${esc(l.minutes || 5)} ХВ</span><b>${esc(l.title)}</b>${done[l.id] ? '<i class="pill mint">ПРОЙДЕНО</i>' : ''}</summary>
        ${(l.body || []).map(p => `<p>${text(p)}</p>`).join('')}${l.task ? `<p class="tr-use"><span class="mono">ДІЯ ДЛЯ STACKUP</span>${text(l.task)}</p>` : ''}
        <div class="v-acts"><button type="button" class="button ${done[l.id] ? 'ghost' : 'primary'} sm" data-learn="${esc(l.id)}"><b>${done[l.id] ? 'Повернути в непройдені' : 'Пройдено'}</b><span>✓</span></button>${l.task && !done[l.id] ? `<button type="button" class="button ghost sm" data-learntask="${esc(l.id)}"><b>Додати дію в задачі</b><span>＋</span></button>` : ''}</div></details>`).join('')}`;
  } else {
    const list = upcoming(400);
    const byMonth = {}; list.forEach(e => { const k = e.date.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(e); });
    body = list.length ? Object.entries(byMonth).map(([k, l]) => `<section class="panel"><div class="panel-h"><h2>${esc(fmt(k + '-15T12:00:00', { month: 'long', year: 'numeric' }))}</h2><span class="mono">${l.length}</span></div><ul class="evs">${l.map(evRow).join('')}</ul></section>`).join('') : '<p class="empty big">Календар свят ще не завантажено.</p>';
  }
  $('#secStrategy').innerHTML = head('Стратегія', insights && insights.updated ? 'ОНОВЛЕНО ' + esc(when(insights.updated).toUpperCase()) : 'ГОТУЄ CLAUDE') + `<div class="ctabs" role="tablist">${tabs}</div>${body}`;
}

/* ---------- огляд: задачі, свята, тренд ---------- */
function homeTasks() {
  const l = sortTasks(openTasks()).slice(0, 5);
  return `<section class="panel"><div class="panel-h"><h2>Задачі</h2><button type="button" class="link mono" data-sec="tasks">УСІ ${openTasks().length} →</button></div>${l.length ? `<ul class="tasks compact">${l.map(t => taskRow(t, true)).join('')}</ul>` : '<p class="empty">Відкритих задач немає.</p>'}</section>`;
}
function homeDates() {
  const l = upcoming(21).slice(0, 4);
  return `<section class="panel"><div class="panel-h"><h2>Свята і можливості</h2><button type="button" class="link mono" data-sec="strategy" data-stab="dates">КАЛЕНДАР →</button></div>${l.length ? `<ul class="evs compact">${l.map(evRow).join('')}</ul>` : '<p class="empty">Найближчі 3 тижні без особливих дат.</p>'}</section>`;
}
function homeTrend() {
  const d = insights && (insights.trends || [])[0];
  return `<section class="panel"><div class="panel-h"><h2>Тренд дня</h2><button type="button" class="link mono" data-sec="strategy" data-stab="trends">УСІ →</button></div>${d ? `<p class="mono">${esc(dayName(d.date + 'T12:00:00').toUpperCase())}</p>${(d.items || []).slice(0, 2).map(t => `<div class="tr mini"><h3>${esc(t.title)}</h3><p class="tr-use">${text(t.use)}</p></div>`).join('')}` : '<p class="empty">Перший звіт трендів скоро буде.</p>'}</section>`;
}

/* ---------- у картці заявки: листування і Claude ---------- */
const talk = {}, aiOut = {};
let cur = null, sendStep = false;
const DEMO_THREAD = [
  { mine: false, date: new Date(Date.now() - 3 * DAY).toISOString(), subject: 'Сайт для кав’ярні', text: 'Добрий день! Хочемо оновити сайт і додати онлайн-замовлення. Скільки це може коштувати?' },
  { mine: true, date: new Date(Date.now() - 2 * DAY).toISOString(), subject: 'Re: Сайт для кав’ярні', text: 'Вітаю, Олено! Дякую за звернення. Заповніть, будь ласка, короткий бриф, і я підготую оцінку.' }
];
async function loadTalk(id) {
  talk[id] = { loading: true }; renderTalk();
  try {
    const r = C.demo ? await new Promise(ok => setTimeout(() => ok({ email: (cur && cur.row.email) || '', messages: DEMO_THREAD }), 300)) : await C.call({ action: 'thread', id });
    talk[id] = { messages: r.messages || [], email: r.email };
  } catch (e) { talk[id] = { error: e.message }; }
  if (cur && cur.id === id) renderTalk();
}
function renderTalk() {
  const box = $('#dTalk'); if (!box || !cur) return;
  const row = cur.row, id = cur.id, t = talk[id] || {}, a = aiOut[id] || {};
  const email = String(row.email || '').trim();
  const msgs = t.messages || [];
  const last = msgs.slice().reverse().find(m => !m.mine) || msgs[msgs.length - 1];
  const subjDefault = last ? (/^re:/i.test(last.subject) ? last.subject : 'Re: ' + last.subject) : 'Stackup: ' + (row.type || 'ваш проєкт');
  const draft = talk['d:' + id] || { subject: subjDefault, body: '' };
  talk['d:' + id] = draft;
  box.innerHTML = `<h3><span class="mono">✉</span>Листування</h3>
    ${!validEmail(email) ? '<p class="lead">У заявці немає email. Напиши клієнту в Telegram або за телефоном.</p>' :
      t.loading ? '<p class="mono loading">ЗАВАНТАЖУЄМО ЛИСТИ…</p>' :
      t.error ? `<p class="lead">${esc(t.error === 'gmail not allowed' || t.error === 'server error' ? 'Пошта ще не підключена. Запусти setupContent у Google Apps Script і дозволь доступ до Gmail.' : 'Не вдалося завантажити листи.')}</p>` :
      msgs.length ? `<ol class="tk-msgs">${msgs.map(m => `<li class="${m.mine ? 'me' : 'them'}"><span class="mono">${m.mine ? 'ТИ' : 'КЛІЄНТ'} · ${esc(when(m.date).toUpperCase())}</span><p>${esc(m.text).replace(/\n/g, '<br>')}</p></li>`).join('')}</ol>` : '<p class="lead">Листів з цим клієнтом ще не було.</p>'}
    ${validEmail(email) ? `<div class="tk-compose">
      <input type="text" id="tkSubject" maxlength="200" value="${esc(draft.subject)}" aria-label="Тема">
      <textarea id="tkBody" rows="5" maxlength="20000" placeholder="Текст листа. Або натисни «Чернетка від Claude».">${esc(draft.body)}</textarea>
      ${sendStep ? `<div class="confirm-box"><p><b>Надіслати лист клієнту?</b><br>Кому: ${esc(email)}</p><div class="v-acts"><button type="button" class="button primary sm" id="tkYes"><b>Підтверджую, надіслати</b><span>✓</span></button><button type="button" class="button ghost sm" id="tkNo"><b>Ні</b><span>×</span></button></div></div>`
      : `<div class="v-acts"><button type="button" class="button ghost sm" data-ai="reply"${a.busy ? ' disabled' : ''}><b>${a.busy === 'reply' ? 'Claude пише…' : 'Чернетка від Claude'}</b><span>✱</span></button><button type="button" class="button ghost sm" data-ai="followup"${a.busy ? ' disabled' : ''}><b>${a.busy === 'followup' ? 'Claude пише…' : 'Нагадування'}</b><span>↻</span></button><button type="button" class="button primary sm" id="tkSend"><b>Надіслати…</b><span>→</span></button></div>`}
      <p class="mono v-hint">ЛИСТ ПІДЕ З ТВОЄЇ ПОШТИ ЛИШЕ ПІСЛЯ ПІДТВЕРДЖЕННЯ</p></div>` : ''}`;
  const ab = $('#dAi'); if (!ab) return;
  ab.innerHTML = `<h3><span class="mono">✱</span>Аналіз Claude</h3>
    ${a.analyze ? `<div class="ai-out">${text(a.analyze)}</div>` : '<p class="lead">Claude прочитає бриф, нотатки і листування, оцінить, наскільки клієнт гарячий, і підкаже ціну та наступні кроки.</p>'}
    <div class="v-acts"><button type="button" class="button ghost sm" data-ai="analyze"${a.busy ? ' disabled' : ''}><b>${a.busy === 'analyze' ? 'Аналізую…' : a.analyze ? 'Проаналізувати ще раз' : 'Проаналізувати заявку'}</b><span>✱</span></button>
    <button type="button" class="button ghost sm" id="tkTask"><b>Створити задачу</b><span>＋</span></button></div>
    ${!ai.connected && !C.demo ? '<p class="mono v-hint">ПОТРІБЕН КЛЮЧ CLAUDE API (НАЛАШТУВАННЯ)</p>' : ''}`;
}
const DEMO_AI = {
  analyze: '**Суть.** Кав’ярня хоче оновити сайт і додати онлайн-замовлення з самовивозом.\n\n**Наскільки гаряча: 4 з 5.** Є бюджет, чіткий термін і готові фото.\n\n**Обсяг і ціна.** 6–8 сторінок, меню з кошиком, оплата карткою: орієнтовно $3 500–5 000, 5–7 тижнів.\n\n**Що уточнити**\n• Яка каса чи POS у них стоїть\n• Доставка чи лише самовивіз\n• Хто наповнює меню\n\n**Наступні кроки**\n• Сьогодні: відповісти і запропонувати дзвінок на 20 хв\n• До п’ятниці: надіслати КП з двома варіантами\n• Через тиждень: нагадування, якщо мовчить',
  reply: 'Вітаю, Олено!\n\nДякую за бриф, задача зрозуміла: новий сайт для Coffee Lab з онлайн-замовленням і самовивозом.\n\nЩоб точно оцінити, підкажіть, будь ласка:\n• яка у вас каса чи POS-система;\n• чи плануєте доставку, чи лише самовивіз;\n• хто наповнюватиме меню.\n\nМожемо коротко поговорити 20 хвилин цього тижня? Напишіть зручний час.\n\nЛана, Stackup',
  followup: 'Вітаю, Олено!\n\nНагадую про пропозицію для Coffee Lab. До речі, кав’ярні, які додають замовлення на сайті, зазвичай отримують чималу частку замовлень онлайн уже в перший місяць.\n\nЯкщо є питання, я на зв’язку.\n\nЛана'
};
async function runAi(task) {
  if (!cur) return; const id = cur.id, a = aiOut[id] = aiOut[id] || {};
  if (!ai.connected && !C.demo) { C.toast('<b>Спершу додай ключ Claude API (див. Налаштування).</b>', 5000); return; }
  a.busy = task; renderTalk();
  try {
    const r = C.demo ? await new Promise(ok => setTimeout(() => ok({ text: DEMO_AI[task] }), 900)) : await C.call({ action: 'aiLead', id, task });
    if (task === 'analyze') a.analyze = r.text;
    else { const d = talk['d:' + id]; d.body = r.text; }
  } catch (e) { C.toast('<span class="mono">CLAUDE</span> <b>' + esc(e.message === 'ai not configured' ? 'Ключ Claude API ще не додано.' : e.message === 'ai busy' ? 'Claude зараз перевантажений. Спробуй за хвилину.' : 'Не вдалося отримати відповідь.') + '</b>', 5000); }
  finally { a.busy = false; if (cur && cur.id === id) renderTalk(); }
}
async function sendOne() {
  if (!cur) return; const id = cur.id, d = talk['d:' + id];
  if (!d.subject.trim() || !d.body.trim()) { sendStep = false; renderTalk(); return C.toast('<b>Заповни тему і текст.</b>'); }
  try {
    if (C.demo) C.toast('<span class="mono">ДЕМО</span> <b>У демо листи не надсилаються.</b>');
    else { await C.call({ action: 'sendMessage', id, subject: d.subject, body: d.body, confirm: true }); C.toast('<span class="mono">НАДІСЛАНО</span> <b>Лист пішов клієнту.</b>'); }
    talk['d:' + id] = null; sendStep = false;
    if (!C.demo) loadTalk(id); else renderTalk();
  } catch (e) { sendStep = false; renderTalk(); C.toast('<span class="mono">ПОМИЛКА</span> <b>' + esc(e.message === 'gmail not allowed' ? 'Немає доступу до Gmail.' : e.message === 'mail quota' ? 'Ліміт листів на сьогодні вичерпано.' : 'Лист не надіслано.') + '</b>', 6000); }
}
document.addEventListener('stackup:detail', e => {
  const d = e.detail || {}; const changed = !cur || cur.id !== d.id;
  cur = { id: d.id, row: d.row || {} };
  if (changed) sendStep = false;
  if (!talk[d.id] && validEmail(cur.row.email)) loadTalk(d.id); else renderTalk();
});

/* ---------- бокове меню: секції згортаються, відкрита та, де ти зараз ---------- */
const GROUP_OF = { leads: 'leads', mail: 'leads', content: 'content', tasks: 'work', strategy: 'work', library: 'company', settings: 'company' };
function sideGroups() {
  const closed = store.get('stackup-side-closed', {}), active = GROUP_OF[sec];
  $$('.side-sec').forEach(g => { const open = g.dataset.group === active || !closed[g.dataset.group]; g.querySelector('.side-group').setAttribute('aria-expanded', String(open)); });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.side-group'); if (!b) return;
  const g = b.closest('.side-sec').dataset.group, open = b.getAttribute('aria-expanded') === 'true';
  const closed = store.get('stackup-side-closed', {});
  closed[g] = open ? 1 : 0;
  store.set('stackup-side-closed', closed); b.setAttribute('aria-expanded', String(!open));
});

/* ---------- події ---------- */
document.addEventListener('click', e => {
  if ($('#app').hidden) return;
  const t = e.target;
  if (t.closest('#detail')) { detailClick(t); return; }
  const s = t.closest('button[data-sec], a[data-sec]'); if (s) { e.preventDefault(); if (s.dataset.sec === 'content' && s.dataset.ctab) month = null; if (s.dataset.stab) { stab = s.dataset.stab; store.set('stackup-hub-stab', stab); } setSec(s.dataset.sec, s.dataset.ctab); return; }
  if (t.closest('.side-nav [data-view], .side-nav [data-quick], .kpis:not(.hub-kpis) [data-quick], #newBadge')) { if (sec !== 'leads') { sec = 'leads'; store.set('stackup-hub-sec', sec); applySec(); } return; }
  const ct = t.closest('[data-ctab-only]'); if (ct) { ctab = ct.dataset.ctabOnly; store.set('stackup-hub-ctab', ctab); renderAll(); return; }
  const it = t.closest('[data-item]'); if (it && !t.closest('#viewer')) { openItem(it.dataset.item); return; }
  const ld = t.closest('[data-lead]'); if (ld) { C.open(ld.dataset.lead); return; }
  const mo = t.closest('[data-month]'); if (mo) { month = new Date(month.getFullYear(), month.getMonth() + +mo.dataset.month, 1); renderContent(); return; }
  if (t.closest('#copyChanges')) { copyChanges(); return; }
  const tf = t.closest('[data-tfilter]'); if (tf) { tfilter = tf.dataset.tfilter; store.set('stackup-hub-tfilter', tfilter); renderTasks(); return; }
  const td = t.closest('[data-tdone]'); if (td) { const x = tasks.find(k => k.id === td.dataset.tdone); if (x) saveTask({ ...x, status: x.status === 'done' ? 'open' : 'done' }); return; }
  const te = t.closest('[data-tedit]'); if (te) { tedit = te.dataset.tedit; renderTasks(); const f = $('#tTitle'); f && f.focus(); return; }
  const tx = t.closest('[data-tdel]'); if (tx) { const x = tasks.find(k => k.id === tx.dataset.tdel); if (x && confirm('Видалити задачу «' + x.title + '»?')) deleteTask(x.id); return; }
  if (t.closest('#tCancel')) { tedit = null; renderTasks(); return; }
  const sb = t.closest('[data-stab]'); if (sb) { stab = sb.dataset.stab; store.set('stackup-hub-stab', stab); renderStrategy(); return; }
  const lr = t.closest('[data-learn]'); if (lr) { const d = learnDone(); if (d[lr.dataset.learn]) delete d[lr.dataset.learn]; else d[lr.dataset.learn] = new Date().toISOString(); store.set('stackup-learn-done', d); renderStrategy(); return; }
  const lt = t.closest('[data-learntask]'); if (lt) { const l = ((insights && insights.lessons) || []).find(x => x.id === lt.dataset.learntask); if (l) saveTask({ title: l.task.replace(/\*\*/g, '').slice(0, 200), priority: 'normal', status: 'open', due: localInput(new Date(Date.now() + 3 * DAY).toISOString()).slice(0, 10), lead: '', note: 'Урок: ' + l.title }).then(x => x && C.toast('<span class="mono">ЗАДАЧІ</span> <b>Додано.</b>')); return; }
  const ms = t.closest('[data-mstage]'); if (ms) { mailStage = ms.dataset.mstage; renderMail(); return; }
  const mp = t.closest('[data-mpick]'); if (mp) { mailPick[mp.dataset.mpick] = mp.checked; mailConfirm = false; renderMail(); return; }
  const mo2 = t.closest('[data-optout]'); if (mo2) { toggleOptout(mo2.dataset.optout, mo2.dataset.on === '1'); return; }
  if (t.closest('#mAll')) { const off = optout().map(x => x.toLowerCase()); C.leads().filter(l => validEmail(l.email) && !off.includes(String(l.email).toLowerCase()) && (mailStage === 'all' ? l.status !== 'archive' : l.status === mailStage)).forEach(l => { mailPick[l.id] = true; }); renderMail(); return; }
  if (t.closest('#mNone')) { mailPick = {}; mailConfirm = false; renderMail(); return; }
  if (t.closest('#mSend')) { mailConfirm = true; renderMail(); return; }
  if (t.closest('#mSendNo')) { mailConfirm = false; renderMail(); return; }
  if (t.closest('#mSendYes')) { sendMailing(); return; }
  const lib = t.closest('[data-lib]'); if (lib) { openLib(lib.dataset.lib, +lib.dataset.k); return; }
  const lg = t.closest('[data-libgo]'); if (lg) { openLib(lg.dataset.libg, +lg.dataset.libgo); return; }
  const lj = t.closest('[data-libjump]'); if (lj) { e.preventDefault(); const target = document.getElementById('lib-' + lj.dataset.libjump); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const cl = t.closest('[data-copylink]'); if (cl) { e.preventDefault(); const u = location.origin + cl.dataset.copylink; navigator.clipboard && navigator.clipboard.writeText(u).then(() => C.toast('<span class="mono">СКОПІЙОВАНО</span> <b>' + esc(u) + '</b>')); return; }
  const px = t.closest('[data-proxy]'); if (px) { const b = document.getElementById(px.dataset.proxy); if (b) b.click(); return; }
  if (t.closest('#viewer')) {
    if (t.closest('#vClose') || t === $('#viewer') || t.classList.contains('v-in')) { closeItem(); return; }
    const sl = t.closest('[data-slide]'); if (sl) { slide += +sl.dataset.slide; renderViewer(); return; }
    const go = t.closest('[data-goto]'); if (go) { slide = +go.dataset.goto; renderViewer(); return; }
    const st = t.closest('[data-step]'); if (st) { const all = items(), i = all.findIndex(a => a.id === open) + +st.dataset.step; if (all[i]) { open = all[i].id; slide = 0; ed = null; renderViewer(); } return; }
    const mv = t.closest('[data-move]'); if (mv && ed) { const k = +mv.dataset.move, j = k + +mv.dataset.dir; if (j >= 0 && j < ed.order.length) { [ed.order[k], ed.order[j]] = [ed.order[j], ed.order[k]]; slide = j; renderViewer(); } return; }
    const hd = t.closest('[data-hide]'); if (hd && ed) { const i = ed.order[+hd.dataset.hide]; if (ed.off[i]) delete ed.off[i]; else ed.off[i] = 1; slide = +hd.dataset.hide; renderViewer(); return; }
    const op = t.closest('[data-op]'); if (op) { viewerAct(op.dataset.op); return; }
    if (t.closest('#copyCap')) { navigator.clipboard && navigator.clipboard.writeText($('#vCaption').value).then(() => C.toast('<span class="mono">СКОПІЙОВАНО</span> <b>Підпис у буфері обміну.</b>')); return; }
  }
}, true);
document.addEventListener('keydown', e => {
  if ($('#viewer').hidden) { if (e.key === 'Enter' && e.target.matches && e.target.matches('.ccard[data-item]')) openItem(e.target.dataset.item); return; }
  if (e.key === 'Escape') { e.stopPropagation(); closeItem(); }
  if (e.target.matches('textarea,input')) return;
  if (e.key === 'ArrowRight') { const b = $('#viewer .v-arrow.r:not([disabled])'); if (b) b.click(); }
  if (e.key === 'ArrowLeft') { const b = $('#viewer .v-arrow.l:not([disabled])'); if (b) b.click(); }
}, true);
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'vCaption') $('#capLen').textContent = e.target.value.length + ' / 2200';
  if (id === 'mSubject' || id === 'mBody') { mailDraft[id === 'mSubject' ? 'subject' : 'body'] = e.target.value; store.set('stackup-mail-draft', mailDraft); mailPreview(); }
  if ((id === 'tkSubject' || id === 'tkBody') && cur) { const d = talk['d:' + cur.id]; if (d) d[id === 'tkSubject' ? 'subject' : 'body'] = e.target.value; }
});
document.addEventListener('change', e => {
  if (e.target.id === 'mTpl' && e.target.value) { const t = TEMPLATES.find(x => x.id === e.target.value); if (t) { mailDraft.subject = t.subject; mailDraft.body = t.body; store.set('stackup-mail-draft', mailDraft); mailConfirm = false; renderMail(); } }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'taskForm') return;
  e.preventDefault();
  const title = $('#tTitle').value.trim(); if (!title) { $('#tTitle').focus(); return; }
  const base = tasks.find(x => x.id === tedit) || {};
  saveTask({ ...base, id: tedit || undefined, title, priority: (($('input[name=tPrio]:checked') || {}).value) || 'normal', status: base.status || 'open', due: $('#tDue').value, lead: $('#tLead').value, note: $('#tNote').value.trim() }).then(x => { if (x) { tedit = null; renderTasks(); C.toast('<span class="mono">ЗАДАЧІ</span> <b>Збережено.</b>'); } });
});
function detailClick(t) {
  const ab = t.closest('[data-ai]'); if (ab) { runAi(ab.dataset.ai); return; }
  if (t.closest('#tkSend')) { sendStep = true; renderTalk(); return; }
  if (t.closest('#tkNo')) { sendStep = false; renderTalk(); return; }
  if (t.closest('#tkYes')) { sendOne(); return; }
  if (t.closest('#tkTask') && cur) { const r = cur.row; saveTask({ title: 'Відповісти: ' + (r.company || r.name || 'клієнт'), priority: r.status === 'new' ? 'urgent' : 'high', status: 'open', due: today(), lead: cur.id, note: '' }).then(x => x && C.toast('<span class="mono">ЗАДАЧІ</span> <b>Задачу створено.</b>')); }
}
/* свайп у перегляді */
(() => { let x0 = null; document.addEventListener('touchstart', e => { if (e.target.closest('.v-frame')) x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { const b = $('#viewer .v-arrow.' + (dx < 0 ? 'r' : 'l') + ':not([disabled])'); if (b) b.click(); } }, { passive: true }); })();

async function refresh() {
  try { await loadContent(); renderAll(); } catch (e) { /* admin.js покаже вхід */ }
}
function onEnter() { applySec(); refresh(); clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden && !busy && !open) refresh(); }, 60000); }
document.addEventListener('stackup:enter', onEnter);
document.addEventListener('stackup:leads', () => { applySec(); if (sec === 'home') renderHome(); });
document.addEventListener('stackup:wipe', () => { clearInterval(pollT); state = {}; tasks = []; tasksLoaded = false; mailMeta = null; cur = null; Object.keys(talk).forEach(k => delete talk[k]); Object.keys(aiOut).forEach(k => delete aiOut[k]); manifest = { items: [] }; library = null; open = null; $$('.sec:not(#secLeads)').forEach(x => { x.innerHTML = ''; }); const v = $('#viewer'); if (v) { v.hidden = true; v.innerHTML = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden && !open) refresh(); });
applySec();
if (!$('#app').hidden) onEnter(); // admin.js міг увійти раніше, ніж завантажився цей файл
})();
