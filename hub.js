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
const SECS = ['home', 'leads', 'content', 'library', 'settings'];
const CTABS = [['review', 'На затвердженні'], ['changes', 'Правки'], ['scheduled', 'Заплановано'], ['published', 'Опубліковано'], ['all', 'Усе'], ['plan', 'Календар'], ['grid', 'Сітка профілю']];

let sec = SECS.includes(new URLSearchParams(location.search).get('s')) ? new URLSearchParams(location.search).get('s') : store.get('stackup-hub-sec', 'home');
let ctab = store.get('stackup-hub-ctab', 'review');
let manifest = { items: [] }, library = null, state = {}, ig = { connected: false }, loaded = false, busy = false, open = null, slide = 0, month = null, pollT = null;

/* ---------- дані ---------- */
async function fetchJson(u) { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }
const demoState = () => store.get('stackup-demo-content', {});
async function loadContent() {
  const [m, s] = await Promise.all([
    fetchJson(BASE + 'manifest.json').catch(() => ({ items: [] })),
    C.demo ? Promise.resolve({ ok: true, state: demoState(), ig: { connected: false, demo: true } }) : C.call({ action: 'content' }).catch(e => { if (e.message === 'unauthorized') throw e; return null; })
  ]);
  manifest = { items: (m.items || []).filter(x => x && /^[a-z0-9-]{1,80}$/.test(x.id)) };
  if (s) { state = s.state || {}; ig = s.ig || { connected: false }; loaded = true; }
  else loaded = loaded || false;
}
async function act(id, op, extra) {
  if (busy) return; busy = true;
  try {
    let st;
    if (C.demo) {
      const all = demoState(), cur = all[id] || {};
      st = { ...cur, status: { approve: 'scheduled', changes: 'changes', review: 'review', skip: 'skipped', now: 'scheduled' }[op], updated: new Date().toISOString() };
      if (extra.at) st.at = extra.at; if (extra.caption != null) st.caption = extra.caption; if (extra.comment != null) st.comment = extra.comment;
      if (op === 'approve') st.comment = '';
      all[id] = st; store.set('stackup-demo-content', all);
      if (op === 'now') { C.toast('<span class="mono">ДЕМО</span> <b>У демо-режимі публікації в Instagram немає.</b>'); }
    } else if (op === 'now') {
      st = (await C.call({ action: 'publishNow', id, caption: extra.caption })).state;
    } else {
      st = (await C.call({ action: 'contentUpdate', id, op, ...extra })).state;
    }
    state[id] = st;
    const msg = { approve: 'Заплановано на ' + when(st.at), changes: 'Повернуто на правки', review: 'Повернуто на затвердження', skip: 'Пропущено', now: st.status === 'published' ? 'Опубліковано в Instagram' : 'Публікується, відео ще обробляється' }[op];
    C.toast('<span class="mono">ГОТОВО</span> <b>' + esc(msg) + '</b>');
    renderAll();
  } catch (e) {
    const m = e.message || '';
    C.toast('<span class="mono">ПОМИЛКА</span> <b>' + esc(m === 'instagram not connected' ? 'Instagram ще не підключено (див. Налаштування).' : m === 'bad date' ? 'Перевірте дату і час.' : m === 'locked item' ? 'Вже опубліковано або публікується.' : /^IG: /.test(m) ? 'Instagram: ' + m.slice(4) : 'Не вдалося зберегти. Спробуйте ще раз.') + '</b>', 6000);
  } finally { busy = false; }
}

/* стан + маніфест разом */
function items() {
  return manifest.items.map(x => {
    const s = state[x.id] || {};
    const status = s.status || 'review';
    const at = s.at || '';
    return { ...x, st: s, status, at, baseCaption: x.caption || '', caption: s.caption || x.caption || '', time: at || x.proposedAt || '' };
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
  document.title = { home: 'Огляд', leads: 'Заявки', content: 'Контент', library: 'Матеріали', settings: 'Налаштування' }[sec] + ' — Stackup';
  void ch;
}
function renderAll() {
  applySec();
  if (sec === 'home') renderHome();
  if (sec === 'content') renderContent();
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
    `<div class="kpis hub-kpis">${kp('НОВІ ЗАЯВКИ', unread.length, unread.length ? 'acid' : '', 'leads')}${kp('ЗАЯВКИ В РОБОТІ', work.length, '', 'leads')}${kp('НА ЗАТВЕРДЖЕННІ', review.length, review.length ? 'acid' : '', 'content', 'review')}${kp('ПУБЛІКАЦІЙ ЗА 7 ДНІВ', week, '', 'content', 'plan')}${kp('ОПУБЛІКОВАНО', pub, '', 'content', 'published')}</div>
    <div class="home-grid">
      <section class="panel wide"><div class="panel-h"><h2>Чекає на тебе</h2><button type="button" class="link mono" data-sec="content" data-ctab="review">УСІ ${review.length} →</button></div>
        ${review.length ? `<div class="strip-row">${review.slice(0, 8).map(x => tile(x)).join('')}</div>` : '<p class="empty">Усе затверджено. Нові пости з’являться тут, щойно я їх підготую.</p>'}
        ${changes.length ? `<p class="mono note-line">НА ПРАВКАХ У МЕНЕ: ${changes.length} · <button type="button" class="link mono" data-sec="content" data-ctab="changes">ПЕРЕГЛЯНУТИ</button></p>` : ''}</section>
      <section class="panel"><div class="panel-h"><h2>Найближчі публікації</h2><button type="button" class="link mono" data-sec="content" data-ctab="plan">КАЛЕНДАР →</button></div>
        ${next.length ? `<ul class="agenda">${next.slice(0, 6).map(x => `<li><button type="button" data-item="${esc(x.id)}"><img src="${esc(thumbOf(x))}" alt="" loading="lazy"><span><span class="mono">${esc(dayName(x.at).toUpperCase())} · ${esc(fmt(x.at, { hour: '2-digit', minute: '2-digit' }))}</span><b>${esc(x.title)}</b></span>${chip(x.status)}</button></li>`).join('')}</ul>` : '<p class="empty">Нічого не заплановано. Затвердь пост, і він з’явиться тут.</p>'}</section>
      <section class="panel"><div class="panel-h"><h2>Останні заявки</h2><button type="button" class="link mono" data-sec="leads">ВОРОНКА →</button></div>
        ${L.length ? `<ul class="agenda leads">${L.filter(x => x.status !== 'archive').slice(0, 6).map(x => `<li><button type="button" data-lead="${esc(x.id)}"><span class="ava ${C.isUnread(x) ? 'acid' : 'line'}">${esc(String(x.company || x.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><span class="mono">${esc(when(x.created).toUpperCase())}${C.isUnread(x) ? ' · <em class="new-tag">НОВА</em>' : ''}</span><b>${esc(x.company || x.name)}</b><small>${esc(x.type || '')}</small></span></button></li>`).join('')}</ul>` : '<p class="empty">Заявок поки немає.</p>'}</section>
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
function openItem(id) { open = id; slide = 0; renderViewer(); $('#viewer').hidden = false; document.documentElement.classList.add('noscroll'); requestAnimationFrame(() => $('#viewer').classList.add('in')); }
function closeItem() { open = null; $('#viewer').classList.remove('in'); document.documentElement.classList.remove('noscroll'); setTimeout(() => { if (!open) { $('#viewer').hidden = true; $('#viewer').innerHTML = ''; } }, 220); }
function renderViewer() {
  const x = items().find(i => i.id === open); if (!x) return closeItem();
  const media = x.media || [], n = media.length;
  slide = Math.max(0, Math.min(slide, n - 1));
  const stage = x.kind === 'reel' && x.video
    ? `<video src="${esc(path(x.video))}" poster="${esc(path(media[0]))}" controls playsinline preload="metadata"></video>`
    : `<img src="${esc(path(media[slide]))}" alt="${esc(x.title)}, ${slide + 1} з ${n}">`;
  const locked = ['published', 'publishing'].includes(x.status);
  const draftCap = $('#vCaption') && $('#vCaption').dataset.id === x.id ? $('#vCaption').value : x.caption;
  const draftAt = $('#vAt') && $('#vAt').dataset.id === x.id ? $('#vAt').value : localInput(x.at || x.proposedAt || new Date(Date.now() + DAY).toISOString());
  const all = items(), i = all.findIndex(a => a.id === x.id);
  $('#viewer').innerHTML = `<div class="v-in" role="dialog" aria-modal="true" aria-label="${esc(x.title)}">
    <div class="v-stage k-${esc(x.kind)}">
      <div class="v-frame">${stage}
        ${n > 1 && x.kind !== 'reel' ? `<button type="button" class="v-arrow l" data-slide="-1" aria-label="Назад"${slide ? '' : ' disabled'}>‹</button><button type="button" class="v-arrow r" data-slide="1" aria-label="Далі"${slide < n - 1 ? '' : ' disabled'}>›</button>` : ''}
      </div>
      ${n > 1 && x.kind !== 'reel' ? `<div class="v-dots">${media.map((_, k) => `<button type="button" data-goto="${k}" aria-label="Кадр ${k + 1}"${k === slide ? ' aria-current="true"' : ''}></button>`).join('')}</div>
      <div class="v-thumbs">${(x.thumbs || media).map((t, k) => `<button type="button" data-goto="${k}"${k === slide ? ' aria-current="true"' : ''}><img src="${esc(path(t))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>
    <div class="v-side">
      <div class="v-nav"><span class="mono">${i + 1} / ${all.length}</span><div class="pager"><button type="button" data-step="-1" aria-label="Попередня"${i > 0 ? '' : ' disabled'}>←</button><button type="button" data-step="1" aria-label="Наступна"${i < all.length - 1 ? '' : ' disabled'}>→</button></div><button type="button" class="icon-btn" id="vClose" aria-label="Закрити">×</button></div>
      <div class="v-head"><span class="mono">${esc(KIND[x.kind] || '')}${n > 1 ? ' · ' + n + ' КАДРІВ' : ''}${x.series ? ' · ' + esc(x.series.toUpperCase()) : ''}</span>${chip(x.status)}</div>
      <h2>${esc(x.title)}</h2>
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
  if (op === 'approve') {
    const v = $('#vAt').value, d = new Date(v);
    if (!v || isNaN(d)) return C.toast('<b>Вкажіть дату і час.</b>');
    if (d < Date.now() - 5 * 60000 && !confirm('Цей час уже минув. Опублікувати при найближчій перевірці (до 10 хв)?')) return;
    return act(x.id, 'approve', { at: d.toISOString(), caption: capOut });
  }
  if (op === 'now') { if (!confirm('Опублікувати «' + x.title + '» в Instagram зараз?')) return; return act(x.id, 'now', { caption: capOut }); }
  if (op === 'changes') { const c = $('#vComment').value.trim(); if (!c) { $('#vComment').focus(); return; } return act(x.id, 'changes', { comment: c, caption: capOut }); }
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
  $('#secSettings').innerHTML = head('Налаштування', '') + `<div class="set-grid">
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

/* ---------- події ---------- */
document.addEventListener('click', e => {
  if ($('#app').hidden) return;
  const t = e.target;
  const s = t.closest('button[data-sec], a[data-sec]'); if (s) { e.preventDefault(); if (s.dataset.sec === 'content' && s.dataset.ctab) month = null; setSec(s.dataset.sec, s.dataset.ctab); return; }
  if (t.closest('.side-nav [data-view], .side-nav [data-quick], .kpis:not(.hub-kpis) [data-quick], #newBadge')) { if (sec !== 'leads') { sec = 'leads'; store.set('stackup-hub-sec', sec); applySec(); } return; }
  const ct = t.closest('[data-ctab-only]'); if (ct) { ctab = ct.dataset.ctabOnly; store.set('stackup-hub-ctab', ctab); renderAll(); return; }
  const it = t.closest('[data-item]'); if (it && !t.closest('#viewer')) { openItem(it.dataset.item); return; }
  const ld = t.closest('[data-lead]'); if (ld) { C.open(ld.dataset.lead); return; }
  const mo = t.closest('[data-month]'); if (mo) { month = new Date(month.getFullYear(), month.getMonth() + +mo.dataset.month, 1); renderContent(); return; }
  if (t.closest('#copyChanges')) { copyChanges(); return; }
  const lib = t.closest('[data-lib]'); if (lib) { openLib(lib.dataset.lib, +lib.dataset.k); return; }
  const lg = t.closest('[data-libgo]'); if (lg) { openLib(lg.dataset.libg, +lg.dataset.libgo); return; }
  const lj = t.closest('[data-libjump]'); if (lj) { e.preventDefault(); const target = document.getElementById('lib-' + lj.dataset.libjump); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const cl = t.closest('[data-copylink]'); if (cl) { e.preventDefault(); const u = location.origin + cl.dataset.copylink; navigator.clipboard && navigator.clipboard.writeText(u).then(() => C.toast('<span class="mono">СКОПІЙОВАНО</span> <b>' + esc(u) + '</b>')); return; }
  const px = t.closest('[data-proxy]'); if (px) { const b = document.getElementById(px.dataset.proxy); if (b) b.click(); return; }
  if (t.closest('#viewer')) {
    if (t.closest('#vClose') || t === $('#viewer') || t.classList.contains('v-in')) { closeItem(); return; }
    const sl = t.closest('[data-slide]'); if (sl) { slide += +sl.dataset.slide; renderViewer(); return; }
    const go = t.closest('[data-goto]'); if (go) { slide = +go.dataset.goto; renderViewer(); return; }
    const st = t.closest('[data-step]'); if (st) { const all = items(), i = all.findIndex(a => a.id === open) + +st.dataset.step; if (all[i]) { open = all[i].id; slide = 0; renderViewer(); } return; }
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
document.addEventListener('input', e => { if (e.target.id === 'vCaption') $('#capLen').textContent = e.target.value.length + ' / 2200'; });
/* свайп у перегляді */
(() => { let x0 = null; document.addEventListener('touchstart', e => { if (e.target.closest('.v-frame')) x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { const b = $('#viewer .v-arrow.' + (dx < 0 ? 'r' : 'l') + ':not([disabled])'); if (b) b.click(); } }, { passive: true }); })();

async function refresh() {
  try { await loadContent(); renderAll(); } catch (e) { /* admin.js покаже вхід */ }
}
function onEnter() { applySec(); refresh(); clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden && !busy && !open) refresh(); }, 60000); }
document.addEventListener('stackup:enter', onEnter);
document.addEventListener('stackup:leads', () => { applySec(); if (sec === 'home') renderHome(); });
document.addEventListener('stackup:wipe', () => { clearInterval(pollT); state = {}; manifest = { items: [] }; library = null; open = null; $$('.sec:not(#secLeads)').forEach(x => { x.innerHTML = ''; }); const v = $('#viewer'); if (v) { v.hidden = true; v.innerHTML = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden && !open) refresh(); });
applySec();
if (!$('#app').hidden) onEnter(); // admin.js міг увійти раніше, ніж завантажився цей файл
})();
