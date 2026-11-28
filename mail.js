/* STACKUP. — розсилки як кампанії (як Broadcasts у ManyChat).
   Кожна розсилка — окрема картка: чернетка або «надіслано» з датою і кількістю листів.
   Аудиторію можна змінити будь-коли: усі клієнти, нові, етап воронки, тег або вручну.
   Хто вже отримав цю розсилку, повторно її не отримає. Лист іде лише після підтвердження. */
(() => {
'use strict';
const C = window.StackupCRM, H = window.StackupHub;
if (!C || !H) return;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const MAX = 60;
const TEMPLATES = [
  { id: 'ny', name: 'Привітання з Новим роком', subject: 'З Новим роком від Stackup ✦', body: 'Вітаю, {{name}}!\n\nДякую, що цього року були з нами. Бажаю, щоб у новому році ваш бізнес ріс, а сайт приводив клієнтів, поки ви відпочиваєте.\n\nЯкщо плануєте оновлення сайту чи новий проєкт у 2027, напишіть, підготую ідеї безкоштовно.\n\nЛана, Stackup\nstackup.studio' },
  { id: 'follow', name: 'Нагадування після КП', subject: 'Щодо проєкту {{company}}', body: 'Вітаю, {{name}}!\n\nНагадую про пропозицію для {{company}}. Якщо є питання чи хочеться щось змінити в обсязі або бюджеті, давайте обговоримо, підлаштуємось.\n\nЛана, Stackup' },
  { id: 'case', name: 'Новий кейс у портфоліо', subject: 'Новий проєкт Stackup', body: 'Вітаю, {{name}}!\n\nМи щойно запустили новий проєкт і хочу поділитися: stackup.studio\n\nЯкщо вам теж потрібен сайт, який продає, буду рада допомогти.\n\nЛана, Stackup' },
  { id: 'blank', name: 'Порожній лист', subject: '', body: 'Вітаю, {{name}}!\n\n\n\nЛана, Stackup' }
];
const fill = (s, l) => String(s).replace(/\{\{\s*name\s*\}\}/g, String(l.name || '').split(/\s+/)[0] || 'вітаю').replace(/\{\{\s*company\s*\}\}/g, l.company || l.name || '');
const fmt = (iso, o) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('uk-UA', o || { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;
const head = (title, sub, tools = '') => `<header class="hub-top"><div class="top-title"><h1>${title}</h1>${sub ? `<span class="mono">${sub}</span>` : ''}</div><div class="hub-tools">${tools}</div></header>`;

let meta = null, open = null, ed = null, tab = 'all', confirmOn = false, busy = false, saveT = null, saved = '', q = '', justSent = null;

/* ---------- дані ---------- */
function demoMeta() {
  let camps = store.get('stackup-demo-campaigns', null);
  if (!camps) {
    const L = C.leads(), d = n => new Date(Date.now() - n * 864e5).toISOString();
    camps = [
      { id: 'cdemo2', name: 'Нагадування після КП', subject: 'Щодо проєкту {{company}}', body: TEMPLATES[1].body, audience: { kind: 'stage', value: 'quoted', ids: [] }, status: 'draft', created: d(1), updated: d(0.2), sentAt: '', sent: 0, got: [] },
      { id: 'cdemo1', name: 'Новий кейс: Reelly', subject: 'Новий проєкт Stackup', body: TEMPLATES[2].body, audience: { kind: 'all', value: '', ids: [] }, status: 'sent', created: d(9), updated: d(8), sentAt: d(8), sent: 3, got: L.slice(2, 5).map(x => x.id) }
    ];
    store.set('stackup-demo-campaigns', camps);
  }
  return { optout: store.get('stackup-demo-optout', []), quota: 100, log: store.get('stackup-demo-maillog', []), campaigns: camps };
}
async function load() {
  if (C.demo) { meta = demoMeta(); return; }
  try { meta = await C.call({ action: 'mailMeta' }); meta.campaigns = meta.campaigns || []; } catch (e) { meta = { optout: [], quota: null, log: [], campaigns: [], error: e.message }; }
}
const optout = () => (meta && meta.optout || []).map(x => String(x).toLowerCase());
const camp = id => (meta.campaigns || []).find(c => c.id === id);

/* ---------- аудиторія ---------- */
const AUD = [['all', 'Усі клієнти'], ['new', 'Нові'], ['stage', 'Етап'], ['tag', 'Тег'], ['manual', 'Вручну']];
function audLabel(a) {
  a = a || {};
  if (a.kind === 'new') return 'Нові заявки';
  if (a.kind === 'stage') { const s = C.stages().find(x => x.id === a.value); return 'Етап: ' + (a.value === 'archive' ? 'Архів' : s ? s.name : '—'); }
  if (a.kind === 'tag') { const t = C.schema().tags.find(x => x.id === a.value); return 'Тег: ' + (t ? t.name : '—'); }
  if (a.kind === 'manual') return 'Вручну: ' + (a.ids || []).length;
  return 'Усі клієнти';
}
function audLeads(a) {
  a = a || {};
  const L = C.leads().filter(l => H.validEmail(l.email)), P = C.profiles();
  if (a.kind === 'new') return L.filter(l => l.status === 'new');
  if (a.kind === 'stage') return L.filter(l => l.status === a.value);
  if (a.kind === 'tag') return L.filter(l => ((P[l.id] || {}).tags || []).includes(a.value));
  if (a.kind === 'manual') return L.filter(l => (a.ids || []).includes(l.id));
  return L.filter(l => l.status !== 'archive');
}
function plan(c) {
  const off = optout(), got = new Set(c.got || []), all = audLeads(c.audience);
  const todo = all.filter(l => !got.has(l.id) && !off.includes(String(l.email).toLowerCase()));
  return { all, todo, got: all.filter(l => got.has(l.id)), off: all.filter(l => off.includes(String(l.email).toLowerCase())) };
}

/* ---------- список розсилок ---------- */
function render() {
  const el = $('#secMail'); if (!el) return;
  if (!meta) { el.innerHTML = head('Розсилки', 'ЗАВАНТАЖУЄМО…') + `<div class="cp-list">${[0, 1, 2].map(i => `<div class="cp sk" style="--i:${i}"><span class="sk-l w40"></span><span class="sk-l w70"></span></div>`).join('')}</div>`; load().then(render); return; }
  if (open) return renderEditor(el);
  const list = (meta.campaigns || []).slice().sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const nD = list.filter(c => !c.sent).length, nS = list.length - nD;
  const shown = list.filter(c => tab === 'all' || (tab === 'draft' ? !c.sent : c.sent));
  el.innerHTML = head('Розсилки', 'ЛИСТИ ЙДУТЬ З ТВОЄЇ ПОШТИ · ЛИШЕ ПІСЛЯ ПІДТВЕРДЖЕННЯ', `<button type="button" class="button primary" data-cpnew><b>Нова розсилка</b><span>＋</span></button>`) +
    `${meta.error === 'unknown action' ? '<div class="banner"><span class="mono">ПОТРІБНЕ ОНОВЛЕННЯ</span><b>Встав новий Code.gs у Google Apps Script і створи нову версію розгортання.</b></div>' : ''}
    <div class="ch-filters" role="group" aria-label="Фільтр">${[['all', 'Усі', list.length], ['draft', 'Чернетки', nD], ['sent', 'Надіслані', nS]].map(([k, l, n]) => `<button type="button" class="ch-f${tab === k ? ' on' : ''}" data-cptab="${k}" aria-pressed="${tab === k}">${l}<em>${n || ''}</em></button>`).join('')}</div>
    ${shown.length ? `<ol class="cp-list">${shown.map((c, i) => { const p = plan(c); return `<li><button type="button" class="cp${justSent === c.id ? ' flash' : ''}" data-cpopen="${esc(c.id)}" style="--i:${Math.min(i, 10)}">
        <span class="cp-st ${c.sent ? 'sent' : 'draft'} mono">${c.sent ? '✓ НАДІСЛАНО' : '✎ ЧЕРНЕТКА'}</span>
        <b>${esc(c.name || 'Без назви')}</b><span class="cp-sub">${esc(c.subject || 'Без теми')}</span>
        <span class="cp-meta mono"><span class="cp-aud">${esc(audLabel(c.audience).toUpperCase())}</span>${c.sent ? `<span>${esc(fmt(c.sentAt).toUpperCase())} · ${c.sent} ${plural(c.sent, 'ЛИСТ', 'ЛИСТИ', 'ЛИСТІВ')}</span>` : `<span>ЗМІНЕНО ${esc(fmt(c.updated || c.created).toUpperCase())}</span>`}${p.todo.length && c.sent ? `<span class="cp-new">+${p.todo.length} ЩЕ НЕ ОТРИМАЛИ</span>` : ''}</span></button></li>`; }).join('')}</ol>`
      : `<div class="ch-none"><span class="ch-none-i" aria-hidden="true">✉</span><p><b>${list.length ? 'Тут порожньо.' : 'Розсилок ще немає.'}</b><br>${list.length ? 'Зміни фільтр.' : 'Створи першу: обери, кому, напиши лист, і CRM запам’ятає, хто його вже отримав.'}</p></div>`}
    ${(meta.log || []).length ? `<details class="panel ml-log"><summary class="panel-h"><h2>Журнал листів</h2><span class="mono">${meta.log.length}</span></summary><ul>${meta.log.slice(0, 30).map(r => `<li><span class="mono">${esc(String(r.time).slice(0, 16))} · ${esc(String(r.kind).toUpperCase())}</span><b>${esc(r.subject)}</b><small>${esc(leadName(r.lead) || r.lead)} · ${esc(r.status)}</small></li>`).join('')}</ul></details>` : ''}`;
  justSent = null;
}
const leadName = id => { const l = C.leads().find(x => x.id === id); return l ? l.company || l.name : ''; };

/* ---------- редактор розсилки ---------- */
function startEdit(id) {
  const c = id ? camp(id) : null;
  open = id || 'new';
  ed = c ? JSON.parse(JSON.stringify(c)) : { id: '', name: 'Нова розсилка', subject: TEMPLATES[0].subject, body: TEMPLATES[0].body, audience: { kind: 'all', value: '', ids: [] }, status: 'draft', sent: 0, got: [] };
  ed.audience = Object.assign({ kind: 'all', value: '', ids: [] }, ed.audience || {});
  saved = sig(); confirmOn = false; q = '';
  render(); scrollTo({ top: 0, behavior: 'smooth' });
}
const sig = () => JSON.stringify([ed.name, ed.subject, ed.body, ed.audience]);
function renderEditor(el) {
  const c = ed, a = c.audience, p = plan(c), stages = C.stages(), tags = C.schema().tags;
  const sample = p.todo[0] || p.all[0] || { name: 'Олена', company: 'Coffee Lab' };
  const pool = a.kind === 'manual' ? C.leads().filter(l => H.validEmail(l.email) && l.status !== 'archive' || (a.ids || []).includes(l.id)) : p.all;
  const ql = q.trim().toLowerCase();
  const rows = pool.filter(l => !ql || [l.name, l.company, l.email].some(v => String(v || '').toLowerCase().includes(ql)));
  const got = new Set(c.got || []), off = optout();
  const n = Math.min(p.todo.length, MAX);
  el.innerHTML = `<button type="button" class="link mono cp-back" data-cpback>← УСІ РОЗСИЛКИ</button>` + head(esc(c.name || 'Розсилка'), c.sent ? `✓ НАДІСЛАНО ${esc(fmt(c.sentAt).toUpperCase())} · ${c.sent} ${plural(c.sent, 'ЛИСТ', 'ЛИСТИ', 'ЛИСТІВ')}` : '✎ ЧЕРНЕТКА · ЩЕ НЕ НАДСИЛАЛАСЬ', `<span class="mono cp-save" id="cpSave"></span>`) +
  `<div class="ml-wrap cp-ed">
    <section class="panel ml-compose">
      <label class="v-label mono" for="cpName">НАЗВА (БАЧИШ ЛИШЕ ТИ)</label><input type="text" id="cpName" maxlength="120" value="${esc(c.name)}">
      <div class="panel-h"><h2>Лист</h2><select id="cpTpl" aria-label="Шаблон"><option value="">Шаблони…</option>${TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      <label class="v-label mono" for="cpSubject">ТЕМА</label><input type="text" id="cpSubject" maxlength="200" value="${esc(c.subject)}">
      <label class="v-label mono" for="cpBody">ТЕКСТ <em>{{name}} — ІМʼЯ · {{company}} — КОМПАНІЯ</em></label><textarea id="cpBody" rows="10" maxlength="20000">${esc(c.body)}</textarea>
      <p class="v-label mono">ТАК ПОБАЧИТЬ ${esc(String(sample.name || '').toUpperCase())}</p>
      <div class="ml-preview" id="cpPreview"><b>${esc(fill(c.subject, sample))}</b><p>${esc(fill(c.body, sample)).replace(/\n/g, '<br>')}</p><small>—<br>Якщо не хочете отримувати такі листи, дайте відповідь «відписатися», і ми більше не напишемо.</small></div>
      ${confirmOn ? `<div class="confirm-box"><p><b>Надіслати ${n} ${plural(n, 'лист', 'листи', 'листів')}?</b> Кожен отримає окремий лист зі своїм іменем. Скасувати після надсилання не можна.</p><p class="mono">${p.todo.slice(0, 12).map(l => esc(l.company || l.name)).join(' · ')}${p.todo.length > 12 ? ' …' : ''}</p>
        <div class="v-acts"><button type="button" class="button primary" id="cpYes"${busy ? ' disabled' : ''}><b>${busy ? 'Надсилаю…' : 'Підтверджую, надіслати'}</b><span>✓</span></button><button type="button" class="button ghost" id="cpNo"><b>Скасувати</b><span>×</span></button></div></div>`
      : `<button type="button" class="button primary" id="cpSend"${n ? '' : ' disabled'}><b>${n ? (c.sent ? 'Дослати новим: ' : 'Надіслати: ') + n + ' ' + plural(n, 'лист', 'листи', 'листів') + '…' : c.sent && p.got.length ? 'Усі з цієї аудиторії вже отримали' : 'Нікому надсилати'}</b><span>→</span></button>`}
      ${p.todo.length > MAX ? `<p class="mono v-hint">ЗА РАЗ ДО ${MAX} ЛИСТІВ · РЕШТУ ДОШЛЕШ НАСТУПНИМ НАТИСКАННЯМ</p>` : ''}
      ${meta.quota != null ? `<p class="mono v-hint">ЛІМІТ GOOGLE НА СЬОГОДНІ: ${esc(meta.quota)} ЛИСТІВ</p>` : ''}
      <div class="cp-acts">${!c.sent && c.id ? '<button type="button" class="link mono del" data-cpdel>ВИДАЛИТИ ЧЕРНЕТКУ</button>' : ''}${c.id ? '<button type="button" class="link mono" data-cpdup>ДУБЛЮВАТИ</button>' : ''}</div>
    </section>
    <section class="panel ml-to"><div class="panel-h"><h2>Кому</h2><span class="mono">${p.all.length} В АУДИТОРІЇ</span></div>
      <div class="chips cp-aud-k" role="radiogroup" aria-label="Аудиторія">${AUD.map(([k, l]) => `<button type="button" role="radio" data-cpaud="${k}" aria-pressed="${a.kind === k}" aria-checked="${a.kind === k}">${l}</button>`).join('')}</div>
      ${a.kind === 'stage' ? `<select id="cpStage" class="cp-sel" aria-label="Етап">${stages.map(s => `<option value="${esc(s.id)}"${a.value === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="archive"${a.value === 'archive' ? ' selected' : ''}>Архів</option></select>` : ''}
      ${a.kind === 'tag' ? (tags.length ? `<select id="cpTag" class="cp-sel" aria-label="Тег">${tags.map(t => `<option value="${esc(t.id)}"${a.value === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : '<p class="cp-note">Тегів ще немає. Додай їх у картці клієнта, вкладка «Клієнт».</p>') : ''}
      <div class="cp-sum"><span class="go"><b>${p.todo.length}</b> отримають</span><span class="got"><b>${p.got.length}</b> вже отримали</span>${p.off.length ? `<span class="off"><b>${p.off.length}</b> відписані</span>` : ''}</div>
      ${a.kind === 'manual' ? `<div class="ml-bulk"><input type="search" id="cpQ" placeholder="Пошук клієнта" value="${esc(q)}" aria-label="Пошук клієнта"><button type="button" class="link mono" data-cpall>ОБРАТИ ВСІХ</button><button type="button" class="link mono" data-cpnone>ЗНЯТИ ВСЕ</button></div>` : ''}
      <ul class="ml-list">${rows.map(l => { const no = off.includes(String(l.email).toLowerCase()), was = got.has(l.id), inA = a.kind !== 'manual' || (a.ids || []).includes(l.id);
        return `<li class="${no ? 'off' : ''}${was ? ' was' : ''}">${a.kind === 'manual' ? `<label><input type="checkbox" data-cppick="${esc(l.id)}"${inA ? ' checked' : ''}><span><b>${esc(l.company || l.name)}</b><small>${esc(l.email)}</small></span></label>` : `<span class="cp-who"><b>${esc(l.company || l.name)}</b><small>${esc(l.email)}</small></span>`}
          ${was ? '<span class="cp-got mono">✓ ОТРИМАВ(ЛА)</span>' : ''}<button type="button" class="link mono" data-optout="${esc(l.email)}" data-on="${no ? '0' : '1'}">${no ? 'ПОВЕРНУТИ' : 'ВІДПИСАТИ'}</button></li>`; }).join('') || '<li class="empty">У цій аудиторії немає клієнтів з email.</li>'}</ul>
    </section>
  </div>`;
}
function preview() {
  const el = $('#cpPreview'); if (!el || !ed) return;
  const p = plan(ed), l = p.todo[0] || p.all[0] || { name: 'Олена', company: 'Coffee Lab' };
  el.querySelector('b').textContent = fill(ed.subject, l);
  el.querySelector('p').innerHTML = esc(fill(ed.body, l)).replace(/\n/g, '<br>');
}
function saveState(t) { const s = $('#cpSave'); if (s) { s.textContent = t; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); } }

/* ---------- збереження ---------- */
async function persist() {
  clearTimeout(saveT);
  if (!ed || sig() === saved) return true;
  const snap = sig();
  saveState('ЗБЕРІГАЮ…');
  try {
    let c;
    if (C.demo) {
      const all = store.get('stackup-demo-campaigns', []), now = new Date().toISOString();
      c = Object.assign({}, ed, { id: ed.id || 'cd' + Date.now().toString(36), updated: now, created: ed.created || now });
      store.set('stackup-demo-campaigns', [c].concat(all.filter(x => x.id !== c.id)));
    } else {
      c = (await C.call({ action: 'campaignSave', cid: ed.id || undefined, name: ed.name.trim() || 'Без назви', subject: ed.subject, body: ed.body, audience: ed.audience })).campaign;
      c.got = ed.got || [];
    }
    ed.id = c.id; ed.updated = c.updated; ed.created = c.created; open = c.id;
    meta.campaigns = [c].concat((meta.campaigns || []).filter(x => x.id !== c.id)).map(x => x.id === c.id ? Object.assign(x, { got: ed.got || [] }) : x);
    if (sig() === snap) saved = snap;
    saveState('✓ ЗБЕРЕЖЕНО');
    return true;
  } catch (e) { saveState(e.message === 'unknown action' ? 'ОНОВИ CODE.GS' : 'НЕ ЗБЕРЕЖЕНО'); return false; }
}
const later = () => { clearTimeout(saveT); saveT = setTimeout(persist, 1200); };

async function send() {
  const p = plan(ed), ids = p.todo.slice(0, MAX).map(l => l.id);
  const subject = ed.subject.trim(), body = ed.body.trim();
  if (!ids.length || !subject || !body) { confirmOn = false; render(); return C.toast('<b>Заповни тему, текст і обери, кому.</b>'); }
  if (!(await persist())) { confirmOn = false; render(); return C.toast('<b>Не вдалося зберегти розсилку. Спробуй ще раз.</b>'); }
  busy = true; render();
  try {
    let r;
    if (C.demo) {
      await new Promise(ok => setTimeout(ok, 900)); r = { sent: ids.length };
      const all = store.get('stackup-demo-campaigns', []), x = all.find(k => k.id === ed.id), now = new Date().toISOString();
      if (x) { x.got = [...new Set((x.got || []).concat(ids))]; x.sent = (x.sent || 0) + ids.length; x.status = 'sent'; x.sentAt = x.sentAt || now; x.updated = now; }
      store.set('stackup-demo-campaigns', all);
      const log = store.get('stackup-demo-maillog', []); ids.forEach(id => log.unshift({ time: now.replace('T', ' '), lead: id, subject, kind: 'розсилка', status: 'демо, не надіслано' })); store.set('stackup-demo-maillog', log.slice(0, 60));
    } else r = await C.call({ action: 'mailing', ids, subject, body, campaign: ed.id, confirm: true });
    C.toast('<span class="mono">' + (C.demo ? 'ДЕМО' : 'НАДІСЛАНО') + '</span> <b>' + (C.demo ? 'У демо листи не надсилаються. ' : '') + 'Листів: ' + r.sent + '</b>', 5000);
    justSent = ed.id; open = null; ed = null; meta = null; confirmOn = false;
  } catch (e) {
    C.toast('<span class="mono">ПОМИЛКА</span> <b>' + esc(e.message === 'mail quota' ? 'Google сьогодні вже не дозволяє стільки листів.' : e.message === 'gmail not allowed' ? 'Немає доступу до Gmail: запусти setupContent і дозволь доступ.' : e.message === 'no recipients' ? 'Усі з цієї аудиторії вже отримали цей лист.' : e.message === 'too many requests' ? 'Забагато розсилок за годину. Зачекай трохи.' : 'Не вдалося надіслати.') + '</b>', 6000);
    confirmOn = false;
  } finally { busy = false; render(); }
}
async function toggleOptout(email, on) {
  try {
    let list;
    if (C.demo) { list = store.get('stackup-demo-optout', []).filter(x => x !== email.toLowerCase()); if (on) list.push(email.toLowerCase()); store.set('stackup-demo-optout', list); }
    else list = (await C.call({ action: 'optout', email, on })).optout;
    meta.optout = list; confirmOn = false; render();
  } catch (e) { C.toast('<b>Не вдалося змінити.</b>'); }
}

/* ---------- події ---------- */
document.addEventListener('click', e => {
  const t = e.target; if (!t.closest('#secMail')) return;
  if (t.closest('[data-cpnew]')) { startEdit(null); return; }
  const o = t.closest('[data-cpopen]'); if (o) { startEdit(o.dataset.cpopen); return; }
  const tb = t.closest('[data-cptab]'); if (tb) { tab = tb.dataset.cptab; render(); return; }
  if (t.closest('[data-cpback]')) { persist(); open = null; ed = null; confirmOn = false; render(); return; }
  if (!ed) return;
  const au = t.closest('[data-cpaud]'); if (au) {
    const k = au.dataset.cpaud, a = ed.audience;
    if (k === 'manual' && a.kind !== 'manual') a.ids = plan(ed).all.map(l => l.id); // «Вручну» починається з поточної аудиторії
    a.kind = k; a.value = k === 'stage' ? (a.value && C.stages().some(s => s.id === a.value) ? a.value : (C.stages()[0] || {}).id || 'new') : k === 'tag' ? (C.schema().tags.some(x => x.id === a.value) ? a.value : (C.schema().tags[0] || {}).id || '') : '';
    confirmOn = false; render(); later(); return;
  }
  const pk = t.closest('[data-cppick]'); if (pk) { const ids = new Set(ed.audience.ids || []); pk.checked ? ids.add(pk.dataset.cppick) : ids.delete(pk.dataset.cppick); ed.audience.ids = [...ids]; confirmOn = false; render(); later(); return; }
  if (t.closest('[data-cpall]')) { const ql = q.trim().toLowerCase(); ed.audience.ids = [...new Set((ed.audience.ids || []).concat(C.leads().filter(l => H.validEmail(l.email) && l.status !== 'archive' && (!ql || [l.name, l.company, l.email].some(v => String(v || '').toLowerCase().includes(ql)))).map(l => l.id)))]; render(); later(); return; }
  if (t.closest('[data-cpnone]')) { ed.audience.ids = []; confirmOn = false; render(); later(); return; }
  const oo = t.closest('[data-optout]'); if (oo) { toggleOptout(oo.dataset.optout, oo.dataset.on === '1'); return; }
  if (t.closest('#cpSend')) { confirmOn = true; render(); const y = $('#cpYes'); y && y.focus(); return; }
  if (t.closest('#cpNo')) { confirmOn = false; render(); return; }
  if (t.closest('#cpYes')) { send(); return; }
  if (t.closest('[data-cpdup]')) { const copy = Object.assign({}, ed, { id: '', name: ed.name + ' (копія)', status: 'draft', sent: 0, sentAt: '', got: [] }); open = 'new'; ed = copy; saved = ''; confirmOn = false; render(); persist(); return; }
  if (t.closest('[data-cpdel]')) {
    if (!confirm('Видалити цю чернетку розсилки?')) return;
    (async () => {
      try { if (C.demo) store.set('stackup-demo-campaigns', store.get('stackup-demo-campaigns', []).filter(x => x.id !== ed.id)); else await C.call({ action: 'campaignDel', cid: ed.id }); meta.campaigns = meta.campaigns.filter(x => x.id !== ed.id); open = null; ed = null; render(); }
      catch (err) { C.toast('<b>' + (err.message === 'already sent' ? 'Надіслану розсилку не можна видалити: вона лишається в історії.' : 'Не вдалося видалити.') + '</b>'); }
    })();
  }
});
document.addEventListener('input', e => {
  const id = e.target.id; if (!ed) return;
  if (id === 'cpName') { ed.name = e.target.value; later(); }
  if (id === 'cpSubject' || id === 'cpBody') { ed[id === 'cpSubject' ? 'subject' : 'body'] = e.target.value; preview(); confirmOn && (confirmOn = false, render()); later(); }
  if (id === 'cpQ') { q = e.target.value; render(); const s = $('#cpQ'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
});
document.addEventListener('change', e => {
  if (!ed) return;
  const id = e.target.id;
  if (id === 'cpStage' || id === 'cpTag') { ed.audience.value = e.target.value; confirmOn = false; render(); later(); }
  if (id === 'cpTpl' && e.target.value) { const t = TEMPLATES.find(x => x.id === e.target.value); if (t) { ed.subject = t.subject; ed.body = t.body; if (!ed.id && ed.name === 'Нова розсилка') ed.name = t.name; confirmOn = false; render(); later(); } }
});
document.addEventListener('stackup:wipe', () => { meta = null; open = null; ed = null; });
document.addEventListener('stackup:leads', () => { if (H.sec() === 'mail' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#secMail'))) render(); });
addEventListener('beforeunload', () => { if (ed && sig() !== saved) persist(); });

window.StackupMail = { render };
})();
