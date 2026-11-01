/* STACKUP. — CRM заявок. Дані: Google Apps Script (config.js → endpoint). */
(() => {
'use strict';
const EP = (window.STACKUP || {}).endpoint || '';
const qp = new URLSearchParams(location.search);
const DEMO = !EP || qp.has('demo');
const KEY_STORE = 'stackup-admin-key', SEEN_STORE = 'stackup-admin-seen', FILTER_STORE = 'stackup-admin-filters-v2', VIEW_STORE = 'stackup-admin-view';
const POLL_MS = DEMO ? 15000 : 60000;

const STATUS = [
  ['new', 'Нові', 'acid', 'Щойно надійшли'],
  ['review', 'Оцінюю', 'blue', 'Рахую обсяг і терміни'],
  ['quoted', 'КП надіслано', 'peach', 'Чекаю відповіді клієнта'],
  ['work', 'В роботі', 'mint', 'Погоджено, робимо'],
  ['done', 'Завершено', 'stone', 'Здано клієнту'],
  ['archive', 'Архів', 'line', 'Відмова або неактуально']
];
const PIPE = ['new', 'review', 'quoted', 'work', 'done'];
const DL_ORDER = ['Якнайшвидше', 'ASAP', 'До 1 місяця', 'Within 1 month', '1–2 місяці', '1–2 months', '2–3 місяці', '2–3 months', 'Гнучко', 'Flexible'];
const stLabel = s => (STATUS.find(x => x[0] === s) || [s, s])[1];
const stTone = s => (STATUS.find(x => x[0] === s) || [s, s, 'line'])[2];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); };
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }); };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); };
const ago = iso => { const m = (Date.now() - new Date(iso)) / 60000; if (m < 1) return 'щойно'; if (m < 60) return Math.round(m) + ' хв'; if (m < 1440) return Math.round(m / 60) + ' год'; return Math.round(m / 1440) + ' дн'; };
const size = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const ext = n => { const m = String(n).match(/\.([a-z0-9]+)$/i); return m ? m[1].toUpperCase().slice(0, 4) : 'FILE'; };
const initials = x => String(x.company || x.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

let key = store.get(KEY_STORE, '') || '';
let items = [], current = null, cache = {}, pollTimer = null, firstLoad = true, flashIds = [];
let seen = new Set(store.get(SEEN_STORE, null) || []);
let seenInit = store.get(SEEN_STORE, null) !== null;
let view = store.get(VIEW_STORE, 'board');
const F0 = { status: 'active', mode: 'all', type: 'all', period: 'all', budget: 'all', sort: 'new', unread: false, q: '' };
let F = { ...F0, ...store.get(FILTER_STORE, {}), q: '' };

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

/* ---------- auth / load ---------- */
function showLogin(err) {
  $('#login').hidden = false; $('#app').hidden = true; closeDrawer(true);
  $('#loginError').textContent = err || '';
  clearInterval(pollTimer);
}
async function enter() {
  try {
    await load();
    if (!DEMO) store.set(KEY_STORE, key);
    $('#login').hidden = true; $('#app').hidden = false;
    $('#logoutBtn').hidden = DEMO; $('#demoTag').hidden = !DEMO;
    clearInterval(pollTimer); pollTimer = setInterval(poll, POLL_MS);
    render();
    const id = location.hash.slice(1); if (id && items.some(x => x.id === id)) openDrawer(id);
  } catch (e) {
    showLogin(/unauthorized/.test(e.message) ? 'Невірний ключ.' : 'Не вдалося з’єднатися: ' + e.message);
  }
}
async function load() {
  const j = await apiGet({ action: 'list' });
  const before = new Set(items.map(x => x.id));
  items = j.items || [];
  if (!seenInit) { items.filter(x => x.status !== 'new').forEach(x => seen.add(x.id)); seenInit = true; saveSeen(); }
  const fresh = firstLoad ? [] : items.filter(x => !before.has(x.id));
  firstLoad = false;
  $('#updated').textContent = 'ОНОВЛЕНО ' + fmtTime(new Date().toISOString());
  return fresh;
}
async function poll() {
  try {
    const fresh = await load();
    if (fresh.length) { flashIds = fresh.map(x => x.id); announce(fresh); }
    render();
  } catch (e) { $('#updated').textContent = 'НЕМАЄ ЗВ’ЯЗКУ · ' + fmtTime(new Date().toISOString()); }
}

/* ---------- new-brief signals ---------- */
const isUnread = x => !seen.has(x.id);
function saveSeen() { store.set(SEEN_STORE, [...seen].slice(-2000)); }
function markSeen(id) { if (!seen.has(id)) { seen.add(id); saveSeen(); render(); } }
function updateBadge() {
  const n = items.filter(isUnread).length;
  document.title = (n ? `(${n}) ` : '') + 'Заявки — STACKUP.';
  const b = $('#newBadge'); b.hidden = !n; b.textContent = '◆ ' + n + ' ' + (n === 1 ? 'НОВА' : n < 5 ? 'НОВІ' : 'НОВИХ');
  $('#cntNew').textContent = n || '';
  $('#cntAll').textContent = items.filter(x => x.status !== 'archive').length;
  $('#cntArch').textContent = items.filter(x => x.status === 'archive').length || '';
}
function announce(fresh) {
  const x = fresh[0], t = $('#toast');
  t.innerHTML = `<span class="mono">НОВА ЗАЯВКА${fresh.length > 1 ? ' · ' + fresh.length : ''}</span><b>${esc(x.company || x.name)}</b><button type="button" data-open="${esc(x.id)}">Відкрити ↗</button><button type="button" class="x" aria-label="Закрити">×</button>`;
  t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 12000);
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.08, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .5); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + .5); } catch (e) {}
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('STACKUP. Нова заявка', { body: (x.company || x.name) + (x.type ? ' · ' + x.type : '') }); } catch (e) {}
}
function bellState() {
  const b = $('#bellBtn');
  if (!('Notification' in window)) { b.hidden = true; return; }
  b.textContent = Notification.permission === 'granted' ? '🔔 СПОВІЩЕННЯ УВІМК.' : '🔔 УВІМКНУТИ СПОВІЩЕННЯ';
}

/* ---------- filters ---------- */
function inPeriod(x) {
  if (F.period === 'all') return true;
  return Date.now() - new Date(x.created) <= { today: 864e5, week: 7 * 864e5, month: 30 * 864e5 }[F.period];
}
function filtered(ignoreStatus) {
  const q = F.q.trim().toLowerCase();
  const list = items.filter(x => {
    if (!ignoreStatus) {
      if (F.status === 'active' && (x.status === 'archive' || x.status === 'done')) return false;
      if (!['active', 'all'].includes(F.status) && x.status !== F.status) return false;
    }
    if (F.mode !== 'all' && x.mode !== F.mode) return false;
    if (F.type !== 'all' && x.type !== F.type) return false;
    if (F.budget !== 'all' && x.budget !== F.budget) return false;
    if (F.unread && !isUnread(x)) return false;
    if (!inPeriod(x)) return false;
    if (q && ![x.name, x.company, x.email, x.phone, x.id, x.type, x.notes].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const dl = x => { const i = DL_ORDER.indexOf(x.deadline); return i < 0 ? 99 : i; };
  if (F.sort === 'old') list.sort((a, b) => new Date(a.created) - new Date(b.created));
  else if (F.sort === 'deadline') list.sort((a, b) => dl(a) - dl(b) || new Date(b.created) - new Date(a.created));
  else list.sort((a, b) => new Date(b.created) - new Date(a.created));
  return list;
}
function uniq(k) { return [...new Set(items.map(x => x[k]).filter(Boolean))].sort(); }
function options(sel, values, all) { return `<option value="all">${esc(all)}</option>` + values.map(v => `<option value="${esc(v)}"${v === F[sel] ? ' selected' : ''}>${esc(v)}</option>`).join(''); }
function renderFilters() {
  $('#fMode').value = F.mode;
  $('#fType').innerHTML = options('type', uniq('type'), 'Усі проєкти');
  $('#fBudget').innerHTML = options('budget', uniq('budget'), 'Будь-який бюджет');
  $('#fPeriod').value = F.period; $('#fSort').value = F.sort; $('#fUnread').checked = F.unread;
  $('#resetBtn').hidden = !(JSON.stringify({ ...F, q: '', status: 'active' }) !== JSON.stringify({ ...F0, q: '' }) || F.q || (view === 'list' && F.status !== 'active'));
}

/* ---------- render ---------- */
function render() {
  updateBadge(); renderFilters(); renderKpis();
  $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $$('[data-quick]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.quick === 'unread' && F.unread) || (b.dataset.quick === 'archive' && view === 'list' && F.status === 'archive'))));
  $('#viewTitle').textContent = view === 'board' ? 'Воронка' : (F.status === 'archive' ? 'Архів' : 'Усі заявки');
  $('#board').hidden = view !== 'board'; $('#listview').hidden = view !== 'list';
  if (view === 'board') renderBoard(); else renderTable();
  flashIds = [];
}

function renderKpis() {
  const c = s => items.filter(x => x.status === s).length;
  const week = items.filter(x => Date.now() - new Date(x.created) <= 7 * 864e5).length;
  const total = items.filter(x => x.status !== 'archive').length;
  const won = c('work') + c('done');
  const conv = (c('quoted') + won) ? Math.round(won / (c('quoted') + won) * 100) : 0;
  $('#kpis').innerHTML = [
    ['НЕПЕРЕГЛЯНУТІ', items.filter(isUnread).length, 'acid', 'unread'],
    ['ЗА 7 ДНІВ', week, '', ''],
    ['В РОБОТІ', c('review') + c('quoted') + c('work'), '', ''],
    ['КОНВЕРСІЯ КП', conv + '%', '', ''],
    ['УСЬОГО', total, '', '']
  ].map(([l, n, t, q]) => `<${q ? 'button type="button" data-quick="' + q + '"' : 'div'} class="kpi ${t}"><span class="mono">${l}</span><b>${n}</b></${q ? 'button' : 'div'}>`).join('');
}

function card(x) {
  return `<article class="card${isUnread(x) ? ' unread' : ''}${flashIds.includes(x.id) ? ' flash' : ''}${current === x.id ? ' cur' : ''}" draggable="true" data-open="${esc(x.id)}" tabindex="0">
    <div class="card-top"><span class="ava ${stTone(x.status)}">${esc(initials(x))}</span><span class="mono card-age">${esc(ago(x.created))}</span>${isUnread(x) ? '<em class="new-tag mono">НОВА</em>' : ''}</div>
    <strong>${esc(x.company || x.name)}</strong>
    <span class="card-sub">${esc(x.company ? x.name : x.email)}</span>
    <div class="tags"><span class="tag mono">${x.mode === 'has' ? 'ТЗ ✓' : 'БРИФ'}</span>${x.type && x.mode !== 'has' ? `<span class="tag">${esc(x.type)}</span>` : ''}</div>
    <div class="card-foot mono">${x.budget ? `<span>${esc(x.budget)}</span>` : ''}${x.deadline ? `<span>⏱ ${esc(x.deadline)}</span>` : ''}${x.files ? `<span>📎 ${x.files}</span>` : ''}${x.notes ? '<span title="Є нотатки">✎</span>' : ''}</div>
  </article>`;
}

function renderBoard() {
  const list = filtered(true);
  const cols = [...PIPE, ...(F.status === 'all' || F.status === 'archive' ? ['archive'] : [])];
  $('#resultCount').textContent = `${list.filter(x => cols.includes(x.status)).length} В ВОРОНЦІ`;
  $('#board').innerHTML = cols.map(s => {
    const st = STATUS.find(x => x[0] === s), cards = list.filter(x => x.status === s);
    return `<div class="col" data-col="${s}">
      <header class="col-head"><span class="dotc ${st[2]}"></span><b>${esc(st[1])}</b><span class="mono cnt">${cards.length}</span><p class="mono">${esc(st[3]).toUpperCase()}</p></header>
      <div class="col-body" data-drop="${s}">${cards.map(card).join('') || '<p class="col-empty mono">ПЕРЕТЯГНІТЬ СЮДИ</p>'}</div>
    </div>`;
  }).join('') + (cols.includes('archive') ? '' : `<button type="button" class="col-more mono" data-showarch>+ АРХІВ (${items.filter(x => x.status === 'archive').length})</button>`);
}

function renderTable() {
  const list = filtered(false);
  const count = s => items.filter(x => x.status === s).length;
  const chips = [['active', 'Активні', items.filter(x => !['done', 'archive'].includes(x.status)).length], ...STATUS.map(s => [s[0], s[1], count(s[0])]), ['all', 'Усі', items.length]];
  $('#statusChips').innerHTML = chips.map(([v, l, n]) => `<button type="button" role="tab" aria-selected="${v === F.status}" data-f="${v}">${esc(l)} <sup>${n}</sup></button>`).join('');
  $('#resultCount').textContent = `${list.length} З ${items.length}`;
  $('#rows').innerHTML = list.length ? list.map(x => `<tr class="row${isUnread(x) ? ' unread' : ''}${flashIds.includes(x.id) ? ' flash' : ''}" data-open="${esc(x.id)}" tabindex="0">
      <td class="c-dot"><span class="ava ${stTone(x.status)}">${esc(initials(x))}</span></td>
      <td class="c-date"><b>${esc(fmtDay(x.created))}</b><span class="mono">${esc(ago(x.created))} тому</span></td>
      <td class="c-client"><b>${esc(x.company || x.name)}${isUnread(x) ? ' <em class="new-tag mono">НОВА</em>' : ''}</b><span>${esc(x.company ? x.name : x.email)}</span></td>
      <td class="c-what"><span class="tag mono">${x.mode === 'has' ? 'ТЗ ✓' : 'БРИФ'}</span> ${esc(x.mode === 'has' ? 'Власне ТЗ' : x.type || '—')}</td>
      <td class="c-dl">${esc(x.deadline || '—')}</td>
      <td class="c-bg">${esc(x.budget || '—')}</td>
      <td class="c-files mono">${x.files ? '📎 ' + x.files : ''}</td>
      <td class="c-st"><span class="pill ${stTone(x.status)}">${esc(stLabel(x.status)).toUpperCase()}</span></td>
    </tr>`).join('') : `<tr><td colspan="8" class="none mono">${items.length ? 'ЗА ЦИМИ ФІЛЬТРАМИ НІЧОГО НЕМАЄ' : 'ПОКИ ЗАЯВОК НЕМАЄ'}</td></tr>`;
}

/* ---------- drawer ---------- */
async function openDrawer(id) {
  current = id; history.replaceState(null, '', '#' + id);
  $('#drawer').hidden = false; $('#scrim').hidden = false; document.body.classList.add('drawer-open');
  requestAnimationFrame(() => $('#drawer').classList.add('in'));
  markSeen(id);
  const row = items.find(x => x.id === id);
  $('#detail').innerHTML = `<div class="loading mono">ЗАВАНТАЖУЄМО ${esc(row ? row.company || row.name : '')}…</div>`;
  try {
    const d = cache[id] || (cache[id] = await apiGet({ action: 'get', id }));
    if (current === id) { renderDetail(d); $('#drawer').scrollTop = 0; }
  } catch (e) { $('#detail').innerHTML = `<p class="step-error">Не вдалося відкрити: ${esc(e.message)}</p>`; }
  $$('.card.cur').forEach(c => c.classList.remove('cur')); const c = $(`.card[data-open="${CSS.escape(id)}"]`); c && c.classList.add('cur');
}
function closeDrawer(instant) {
  current = null; $$('.card.cur').forEach(c => c.classList.remove('cur'));
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  $('#drawer').classList.remove('in'); document.body.classList.remove('drawer-open');
  const hide = () => { if (!current) { $('#drawer').hidden = true; $('#scrim').hidden = true; } };
  instant ? hide() : setTimeout(hide, 260);
}
function navBtns(id) {
  const vis = view === 'board' ? filtered(true).sort((a, b) => PIPE.indexOf(a.status) - PIPE.indexOf(b.status)) : filtered(false);
  const i = vis.findIndex(x => x.id === id);
  if (i < 0) return '';
  const p = vis[i - 1], n = vis[i + 1];
  return `<span class="mono pager"><button type="button" ${p ? `data-open="${esc(p.id)}"` : 'disabled'} aria-label="Попередня">←</button>${i + 1} / ${vis.length}<button type="button" ${n ? `data-open="${esc(n.id)}"` : 'disabled'} aria-label="Наступна">→</button></span>`;
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
  const live = items.find(x => x.id === row.id) || row;
  const groups = {};
  (d.files || []).forEach(f => (groups[f.label] = groups[f.label] || []).push(f));
  const spec = (d.files || []).filter(f => f.field === 'specFiles');
  $('#detail').innerHTML = `
    <div class="d-nav"><button type="button" class="icon-btn" id="closeDrawer" aria-label="Закрити">×</button>${navBtns(row.id)}</div>
    <div class="d-bar mono"><span>№ ${esc(row.id)}</span><span>${esc(fmtDate(row.created))}</span></div>
    <div class="d-hero"><span class="ava big ${stTone(live.status)}">${esc(initials(c))}</span>
      <div><h2>${esc(c.company || c.name)}</h2><p class="serif d-who">${esc(c.company ? c.name : (row.mode === 'has' ? 'надіслав(ла) ТЗ' : 'створив(ла) ТЗ'))}</p></div></div>
    <p class="contact-line">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
    <p class="mono d-label">ЕТАП</p>
    <div class="stage" role="group" aria-label="Етап">${STATUS.map(([v, l, t], i) => `<button type="button" class="${t}${PIPE.indexOf(v) <= PIPE.indexOf(live.status) && PIPE.includes(live.status) && PIPE.includes(v) ? ' passed' : ''}" data-st="${v}" aria-pressed="${live.status === v}"><span class="mono">${v === 'archive' ? '×' : String(i + 1).padStart(2, '0')}</span>${esc(l)}</button>`).join('')}</div>
    <div class="act-row">${contactLinks(c)}${d.folderUrl ? `<a class="button ghost" href="${esc(d.folderUrl)}" target="_blank" rel="noopener"><b>Папка на Drive</b> <span>↗</span></a>` : ''}</div>

    ${spec.length ? `<div class="spec-box"><span class="mono">ТЗ КЛІЄНТА</span>${spec.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener"><span class="mono">${esc(ext(f.name))}</span><b>${esc(f.name)}</b><em>${size(f.size)}</em><i>↗</i></a>`).join('')}</div>` : ''}

    <section class="d-sec notes"><h3><span class="mono">✎</span>Мої нотатки</h3>
      <textarea id="notes" rows="4" placeholder="Оцінка, години, ціна, питання до клієнта…">${esc(live.notes || '')}</textarea>
      <div class="notes-bar"><button type="button" class="link mono" id="saveNotes">ЗБЕРЕГТИ НОТАТКИ</button><span class="mono" id="notesState"></span></div>
    </section>

    ${rec.estimate && rec.estimate.length ? `<section class="d-sec d-est"><h3><span class="mono">✱</span>Для оцінки</h3><div class="est">${rec.estimate.map(([k, v]) => `<div><span class="mono">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` : ''}

    ${(rec.sections || []).map((s, i) => `<details class="d-sec acc"${i < 2 ? ' open' : ''}><summary><h3><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}</h3><i aria-hidden="true">+</i></summary>
      <dl>${s.rows.map(r => `<dt>${esc(r.label)}</dt><dd>${valueHTML(r)}</dd>`).join('')}</dl></details>`).join('')}

    <section class="d-sec"><h3><span class="mono">📎</span>Файли · ${(d.files || []).length}</h3>
      ${Object.keys(groups).length ? Object.entries(groups).map(([label, list]) => `<p class="f-group mono">${esc(label).toUpperCase()}</p><ul class="file-list">${list.map(f => `<li><span class="mono">${esc(ext(f.name))}</span><b><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a></b><em>${size(f.size)}</em></li>`).join('')}</ul>`).join('') : '<p class="lead">Файлів немає.</p>'}
    </section>`;
}

async function setStatus(id, st) {
  const row = items.find(x => x.id === id); if (!row || row.status === st) return;
  const prev = row.status; row.status = st;
  if (cache[id]) cache[id].row.status = st;
  render(); if (current === id && cache[id]) renderDetail(cache[id]);
  try { await apiPost({ action: 'update', id, status: st }); }
  catch (e) { row.status = prev; if (cache[id]) cache[id].row.status = prev; render(); if (current === id && cache[id]) renderDetail(cache[id]); alert('Не вдалося змінити етап: ' + e.message); }
}
async function saveNotes() {
  const v = $('#notes').value, s = $('#notesState'), id = current;
  s.textContent = 'ЗБЕРІГАЄМО…';
  try {
    await apiPost({ action: 'update', id, notes: v });
    const row = items.find(x => x.id === id); row.notes = v; if (cache[id]) cache[id].row.notes = v;
    s.textContent = '✓ ЗБЕРЕЖЕНО'; render();
  } catch (e) { s.textContent = 'ПОМИЛКА: ' + e.message; }
}

/* ---------- events ---------- */
function setF(k, v) { F[k] = v; store.set(FILTER_STORE, { ...F, q: '' }); render(); }
function setView(v) { view = v; store.set(VIEW_STORE, v); render(); }
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); key = $('#keyInput').value.trim(); enter(); });
$('#logoutBtn').addEventListener('click', () => { try { localStorage.removeItem(KEY_STORE); } catch (e) {} key = ''; items = []; cache = {}; showLogin(); });
$('#refreshBtn').addEventListener('click', () => { cache = {}; poll(); });
$('#bellBtn').addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (e) {} bellState(); });
$('#search').addEventListener('input', e => { F.q = e.target.value; render(); });
$('#fMode').addEventListener('change', e => setF('mode', e.target.value));
$('#fType').addEventListener('change', e => setF('type', e.target.value));
$('#fBudget').addEventListener('change', e => setF('budget', e.target.value));
$('#fPeriod').addEventListener('change', e => setF('period', e.target.value));
$('#fSort').addEventListener('change', e => setF('sort', e.target.value));
$('#fUnread').addEventListener('change', e => setF('unread', e.target.checked));
$('#resetBtn').addEventListener('click', () => { F = { ...F0 }; $('#search').value = ''; store.set(FILTER_STORE, F0); render(); });
$('#newBadge').addEventListener('click', () => { F.unread = true; F.status = 'all'; setView('list'); });
$('#scrim').addEventListener('click', () => closeDrawer());

document.addEventListener('click', e => {
  if (e.target.closest('#toast .x')) { $('#toast').hidden = true; return; }
  if (e.target.closest('#closeDrawer')) { closeDrawer(); return; }
  const v = e.target.closest('[data-view]'); if (v) { if (v.closest('.side-nav')) { F.unread = false; if (F.status === 'archive') F.status = 'active'; } setView(v.dataset.view); return; }
  const q = e.target.closest('[data-quick]');
  if (q) {
    if (q.dataset.quick === 'unread') { F.unread = !F.unread; if (F.unread) F.status = 'all'; else if (F.status === 'all') F.status = 'active'; store.set(FILTER_STORE, { ...F, q: '' }); render(); }
    else { F.unread = false; F.status = 'archive'; setView('list'); }
    return;
  }
  if (e.target.closest('[data-showarch]')) { setF('status', 'all'); return; }
  const f = e.target.closest('[data-f]'); if (f) { setF('status', f.dataset.f); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { const url = new URL(cp.dataset.copy, location.href).href; navigator.clipboard && navigator.clipboard.writeText(url).then(() => { const s = cp.querySelector('span'); s.textContent = '✓ СКОПІЙОВАНО'; setTimeout(() => s.textContent = 'КОПІЮВАТИ', 1600); }); return; }
  const st = e.target.closest('[data-st]'); if (st && current) { setStatus(current, st.dataset.st); return; }
  if (e.target.closest('#saveNotes')) { saveNotes(); return; }
  const o = e.target.closest('[data-open]'); if (o) { $('#toast').hidden = true; openDrawer(o.dataset.open); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && current) closeDrawer();
  if (e.key === 'Enter' && e.target.matches('[data-open].card, tr.row')) openDrawer(e.target.dataset.open);
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && document.activeElement && document.activeElement.id === 'notes') { e.preventDefault(); saveNotes(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) poll(); });

/* drag & drop between pipeline stages */
let dragId = null;
document.addEventListener('dragstart', e => { const c = e.target.closest('.card'); if (!c) return; dragId = c.dataset.open; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
document.addEventListener('dragend', e => { const c = e.target.closest('.card'); c && c.classList.remove('dragging'); $$('.col.over').forEach(x => x.classList.remove('over')); dragId = null; });
document.addEventListener('dragover', e => { const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); $$('.col.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); });
document.addEventListener('drop', e => { const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); col.classList.remove('over'); setStatus(dragId, col.dataset.col); });
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
    ,{ id: '261030-R5TB', created: h(30), status: 'new', name: 'Тарас Гнатюк', company: 'Reelly Dubai', email: 'taras@reelly.example', phone: '@taras_g', mode: 'none', type: 'Вебсервіс / продукт', deadline: '2–3 місяці', budget: '$7 000+', files: 3, notes: '', record: { estimate: [['Сторінок / екранів', '14'], ['Функцій', '9'], ['Тексти', 'Готові'], ['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', '2–3 місяці'], ['Бюджет', '$7 000+']], sections: [] }, fileList: [] },
    { id: '261029-W2HC', created: h(60), status: 'review', name: 'Ірина Савчук', company: 'Savchuk Dental', email: 'clinic@savchuk.example', phone: '+380 50 222 33 44', mode: 'none', type: 'Корпоративний сайт', deadline: 'До 1 місяця', budget: '$1 000–3 000', files: 5, notes: 'Потрібен онлайн-запис, перевірити інтеграцію з їхньою CRM.', record: { estimate: [], sections: [] }, fileList: [] },
    { id: '261020-J7MS', created: h(280), status: 'quoted', name: 'Олег Ярема', company: 'Yarema Wines', email: 'oleh@yarema.example', phone: '', mode: 'has', type: 'Власне ТЗ', deadline: 'Гнучко', budget: '$3 000–7 000', files: 1, notes: 'КП $4 200, чекаю відповіді до п’ятниці.', record: { estimate: [], sections: [] }, fileList: [] },
    { id: '261002-N1DD', created: h(720), status: 'done', name: 'Анна Руденко', company: 'Rudenko Law', email: 'anna@rudenko.example', phone: '', mode: 'none', type: 'Лендинг', deadline: 'До 1 місяця', budget: '$1 000–3 000', files: 2, notes: 'Здано 25.10.', record: { estimate: [], sections: [] }, fileList: [] }
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

// demo: a fresh brief "arrives" 20 s after opening, to show how new ones look
if (DEMO) setTimeout(() => {
  demo = demo || demoData();
  demo.push({ id: '261101-Z9NE', created: new Date().toISOString(), status: 'new', name: 'Софія Ткач', company: 'Bloom Atelier', email: 'sofia@bloom.example', phone: '@sofia_bloom', mode: 'has', type: 'Власне ТЗ', deadline: '1–2 місяці', budget: '$1 000–3 000', files: 1, notes: '',
    record: { estimate: [['Дизайн-основа', 'Нічого немає'], ['Терміни', '1–2 місяці'], ['Бюджет', '$1 000–3 000']], sections: [{ title: 'Технічне завдання клієнта', rows: [{ label: 'Наскільки ТЗ фінальне?', type: 'radio', value: 'Фінальне, можна оцінювати' }] }] },
    fileList: [['specFiles', 'Файл ТЗ', 'Bloom_TZ.docx', 220000]] });
}, 20000);

/* ---------- init ---------- */
bellState();
if (DEMO || key) enter(); else showLogin();
})();
