/* STACKUP. — профіль клієнта у вкладці «Клієнт».
   Як у ManyChat: контакти, соцмережі, теги і свої групи полів (напр. «Бізнес», «Угода»).
   Значення зберігаються самі, щойно поле втрачає фокус. Групи, поля й теги налаштовуються кнопкою «Налаштувати поля». */
(() => {
'use strict';
const C = window.StackupCRM;
if (!C || !C.saveProfile) return;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const TONES = ['peach', 'blue', 'mint', 'lav', 'rose', 'sand', 'stone'];
const TYPES = [['text', 'Текст'], ['long', 'Довгий текст'], ['number', 'Число'], ['date', 'Дата'], ['url', 'Посилання'], ['select', 'Вибір зі списку'], ['bool', 'Так / ні']];
const CONTACTS = [['name', 'Ім’я', 'text', 'Як звати клієнта'], ['company', 'Компанія', 'text', 'Назва бізнесу'], ['email', 'Email', 'email', 'name@company.com'], ['phone', 'Телефон / нік', 'text', '+380… або @нік']];
const SOCIALS = [
  ['instagram', 'Instagram', '◎', '@нік', h => 'https://instagram.com/' + h],
  ['telegram', 'Telegram', '✈', '@нік', h => 'https://t.me/' + h],
  ['facebook', 'Facebook', 'f', 'нік або посилання', h => 'https://facebook.com/' + h],
  ['tiktok', 'TikTok', '♪', '@нік', h => 'https://www.tiktok.com/@' + h],
  ['linkedin', 'LinkedIn', 'in', 'нік або посилання', h => 'https://www.linkedin.com/in/' + h],
  ['website', 'Сайт', '⌂', 'site.com', h => 'https://' + h]
];
let cur = null, editing = false, stateT = null;

/* посилання на соцмережу: лише https-адреса або простий нік, щоб не з’явилось javascript: тощо */
function socialUrl(k, v) {
  v = String(v || '').trim(); if (!v) return '';
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^http:\/\/[^\s"'<>]+$/i.test(v)) return v.replace(/^http:/i, 'https:');
  const s = SOCIALS.find(x => x[0] === k);
  if (k === 'website') return /^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(v) ? s[4](v) : '';
  const h = v.replace(/^@/, '');
  return /^[a-z0-9._-]{2,60}$/i.test(h) ? s[4](h) : '';
}
const slug = name => { const t = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); return (t || 'x') + '-' + Date.now().toString(36).slice(-4); };

function setState(txt, cls) {
  const el = $('#pfState'); if (!el) return;
  el.textContent = txt; el.className = 'pf-state mono ' + (cls || '');
  clearTimeout(stateT); if (cls === 'ok') stateT = setTimeout(() => { el.textContent = ''; el.className = 'pf-state mono'; }, 2200);
}
async function save(patch) {
  if (!cur) return;
  const id = cur;
  setState('ЗБЕРІГАЮ…', 'busy');
  try { await C.saveProfile(id, patch); if (cur === id) setState('✓ ЗБЕРЕЖЕНО', 'ok'); return true; }
  catch (e) {
    setState('ПОМИЛКА', 'err');
    C.toast('<span class="mono">ПРОФІЛЬ</span> <b>' + esc(e.message === 'bad email' ? 'Перевір email: схоже, в ньому помилка.' : e.message === 'unknown action' ? 'Онови Code.gs у Google Apps Script.' : 'Не вдалося зберегти. Спробуй ще раз.') + '</b>', 5000);
    return false;
  }
}
async function saveSchema(sc) {
  setState('ЗБЕРІГАЮ…', 'busy');
  try { await C.saveSchema(sc); setState('✓ ЗБЕРЕЖЕНО', 'ok'); render(); return true; }
  catch (e) { setState('ПОМИЛКА', 'err'); C.toast('<b>Не вдалося зберегти налаштування полів.</b>', 4000); return false; }
}

function fieldInput(f, v) {
  const a = `data-pff="${esc(f.id)}" id="pf_${esc(f.id)}" aria-label="${esc(f.name)}"`;
  if (f.type === 'long') return `<textarea ${a} rows="2" maxlength="4000">${esc(v ?? '')}</textarea>`;
  if (f.type === 'number') return `<input type="number" inputmode="decimal" ${a} value="${esc(v ?? '')}">`;
  if (f.type === 'date') return `<input type="date" ${a} value="${esc(v ?? '')}">`;
  if (f.type === 'url') return `<input type="url" ${a} value="${esc(v ?? '')}" placeholder="https://…">`;
  if (f.type === 'select') return `<select ${a}><option value="">—</option>${(f.options || []).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (f.type === 'bool') return `<label class="pf-switch"><input type="checkbox" ${a}${v === true ? ' checked' : ''}><i></i><span>${v === true ? 'Так' : 'Ні'}</span></label>`;
  return `<input type="text" ${a} value="${esc(v ?? '')}" maxlength="500">`;
}

function render() {
  const box = $('#dProfile'); if (!box || !cur) return;
  const row = C.leads().find(x => x.id === cur) || {}, p = C.profile(cur), sc = C.schema();
  const tags = (p.tags || []).filter(t => sc.tags.some(k => k.id === t));
  const free = sc.tags.filter(t => !tags.includes(t.id));
  box.className = 'd-sec prof' + (editing ? ' editing' : '');
  box.innerHTML = `<div class="pf-top"><h3><span class="mono">◉</span>Профіль клієнта</h3><em class="pf-state mono" id="pfState" aria-live="polite"></em><button type="button" class="pf-edit" data-pfedit aria-pressed="${editing}">${editing ? '✓ Готово' : '⚙ Налаштувати поля'}</button></div>
    <div class="pf-tags" aria-label="Теги">
      ${tags.map(t => { const k = sc.tags.find(x => x.id === t); return `<span class="ctag ${esc(k.tone)}">${esc(k.name)}<button type="button" data-pftagoff="${esc(t)}" aria-label="Зняти тег ${esc(k.name)}">×</button></span>`; }).join('')}
      <span class="pf-tagadd"><input type="text" id="pfTagIn" list="pfTagList" maxlength="40" placeholder="＋ Тег" aria-label="Додати тег" autocomplete="off"><datalist id="pfTagList">${free.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist></span>
      ${free.length && !editing ? `<span class="pf-sugg">${free.slice(0, 6).map(t => `<button type="button" class="ctag ghost ${esc(t.tone)}" data-pftagon="${esc(t.id)}">＋ ${esc(t.name)}</button>`).join('')}</span>` : ''}
    </div>
    ${editing ? `<div class="pf-reg"><p class="mono">УСІ ТЕГИ · НАТИСНИ НА КОЛІР, ЩОБ ЗМІНИТИ</p><div>${sc.tags.map(t => `<span class="ctag ${esc(t.tone)}"><button type="button" class="pf-tone" data-pftone="${esc(t.id)}" aria-label="Змінити колір"></button>${esc(t.name)}<button type="button" data-pftagdel="${esc(t.id)}" aria-label="Видалити тег ${esc(t.name)} з усіх клієнтів">×</button></span>`).join('') || '<em>Тегів ще немає. Додай перший у полі «＋ Тег» вище.</em>'}</div></div>` : ''}
    <div class="pf-grid">
      <fieldset class="pf-g"><legend>Контакти</legend>
        ${CONTACTS.map(([k, l, type, ph]) => `<label class="pf-row"><span>${l}</span><input type="${type}" data-pfc="${k}" value="${esc(row[k] || '')}" placeholder="${esc(ph)}" maxlength="${k === 'phone' ? 80 : 120}"${k === 'email' ? ' inputmode="email" autocomplete="off"' : ''}></label>`).join('')}
      </fieldset>
      <fieldset class="pf-g"><legend>Соцмережі</legend>
        ${SOCIALS.map(([k, l, i, ph]) => { const v = (p.socials || {})[k] || '', u = socialUrl(k, v); return `<label class="pf-row soc ${k}"><span><i aria-hidden="true">${i}</i>${l}</span><input type="text" data-pfs="${k}" value="${esc(v)}" placeholder="${esc(ph)}" maxlength="200">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="pf-go" aria-label="Відкрити ${l}">↗︎</a>` : '<span class="pf-go off"></span>'}</label>`; }).join('')}
      </fieldset>
      ${sc.groups.map(g => `<fieldset class="pf-g custom" data-g="${esc(g.id)}"><legend>${editing ? `<input type="text" class="pf-gname" data-pfgname="${esc(g.id)}" value="${esc(g.name)}" maxlength="60" aria-label="Назва групи"><button type="button" class="pf-x" data-pfgdel="${esc(g.id)}" aria-label="Видалити групу">×</button>` : esc(g.name)}</legend>
        ${g.fields.map(f => `<div class="pf-row t-${esc(f.type)}"><label for="pf_${esc(f.id)}">${esc(f.name)}${editing ? ` <small class="mono">${esc((TYPES.find(x => x[0] === f.type) || TYPES[0])[1]).toUpperCase()}</small>` : ''}</label>${fieldInput(f, (p.fields || {})[f.id])}${editing ? `<button type="button" class="pf-x" data-pffdel="${esc(g.id)}|${esc(f.id)}" aria-label="Видалити поле">×</button>` : ''}</div>`).join('') || '<p class="pf-none">Полів ще немає.</p>'}
        ${editing ? `<form class="pf-addf" data-pfaddf="${esc(g.id)}"><input type="text" name="name" maxlength="60" placeholder="Нове поле, напр. «Ніша»" required aria-label="Назва поля"><select name="type" aria-label="Тип поля">${TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input type="text" name="options" class="pf-opts" placeholder="Варіанти через кому" aria-label="Варіанти" hidden><button type="submit" class="mini-ok mono">＋ ПОЛЕ</button></form>` : ''}
      </fieldset>`).join('')}
      ${editing ? `<form class="pf-g pf-addg" data-pfaddg><legend>Нова група</legend><input type="text" name="name" maxlength="60" placeholder="Напр. «Угода», «Бізнес», «Особисте»" required aria-label="Назва групи"><button type="submit" class="button ghost sm"><b>Створити групу</b><span>＋</span></button></form>`
        : !sc.groups.length ? `<button type="button" class="pf-g pf-hint" data-pfedit><b>＋ Свої поля</b><span>Створи групи на кшталт «Бізнес» чи «Угода» і поля, які потрібні саме тобі: ніша, ціна в КП, дата дзвінка…</span></button>` : ''}
    </div>`;
}

/* ---------- події ---------- */
document.addEventListener('stackup:detail', e => { const id = (e.detail || {}).id; if (id !== cur) editing = false; cur = id; render(); });
document.addEventListener('stackup:leads', () => { if (cur && $('#dProfile') && !$('#dProfile').contains(document.activeElement)) render(); });

function addTag(name) {
  name = String(name || '').trim().slice(0, 40); if (!name || !cur) return;
  const sc = C.schema(), p = C.profile(cur);
  let t = sc.tags.find(x => x.name.toLowerCase() === name.toLowerCase());
  const tags = (p.tags || []).slice();
  const go = () => { if (!tags.includes(t.id)) tags.push(t.id); save({ tags }).then(render); };
  if (t) return go();
  t = { id: slug(name), name, tone: TONES[sc.tags.length % TONES.length] };
  sc.tags.push(t);
  saveSchema(sc).then(okk => { if (okk) go(); });
}

document.addEventListener('click', e => {
  const t = e.target; if (!t.closest('#dProfile')) return;
  if (t.closest('[data-pfedit]')) { editing = !editing; render(); return; }
  const off = t.closest('[data-pftagoff]'); if (off) { const p = C.profile(cur); const tags = (p.tags || []).filter(x => x !== off.dataset.pftagoff); off.closest('.ctag').classList.add('out'); save({ tags }).then(render); return; }
  const on = t.closest('[data-pftagon]'); if (on) { const p = C.profile(cur); const tags = (p.tags || []).concat(on.dataset.pftagon); save({ tags }).then(render); return; }
  const tn = t.closest('[data-pftone]'); if (tn) { const sc = C.schema(), x = sc.tags.find(k => k.id === tn.dataset.pftone); if (x) { x.tone = TONES[(TONES.indexOf(x.tone) + 1) % TONES.length]; saveSchema(sc); } return; }
  const td = t.closest('[data-pftagdel]'); if (td) { const sc = C.schema(), x = sc.tags.find(k => k.id === td.dataset.pftagdel); if (x && confirm(`Видалити тег «${x.name}» з усіх клієнтів?`)) { sc.tags = sc.tags.filter(k => k.id !== x.id); saveSchema(sc); } return; }
  const gd = t.closest('[data-pfgdel]'); if (gd) { const sc = C.schema(), g = sc.groups.find(k => k.id === gd.dataset.pfgdel); if (g && confirm(`Видалити групу «${g.name}» разом з полями?`)) { sc.groups = sc.groups.filter(k => k !== g); saveSchema(sc); } return; }
  const fd = t.closest('[data-pffdel]'); if (fd) { const [gid, fid] = fd.dataset.pffdel.split('|'), sc = C.schema(), g = sc.groups.find(k => k.id === gid), f = g && g.fields.find(k => k.id === fid); if (f && confirm(`Видалити поле «${f.name}»?`)) { g.fields = g.fields.filter(k => k !== f); saveSchema(sc); } return; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#dProfile') || !cur) return;
  if (t.dataset.pfc) {
    const k = t.dataset.pfc, v = t.value.trim();
    if (k === 'email' && v && !/^[^\s@<>"'(),;:\\]+@[^\s@<>"'(),;:\\]+\.[a-z]{2,}$/i.test(v)) { t.classList.add('bad'); setState('ПЕРЕВІР EMAIL', 'err'); return; }
    t.classList.remove('bad');
    const row = C.leads().find(x => x.id === cur) || {}; if (String(row[k] || '') === v) return;
    save({ [k]: v }); return;
  }
  if (t.dataset.pfs) {
    const socials = {}; document.querySelectorAll('#dProfile [data-pfs]').forEach(i => { if (i.value.trim()) socials[i.dataset.pfs] = i.value.trim(); });
    save({ socials }).then(() => { const lab = t.closest('.pf-row'), u = socialUrl(t.dataset.pfs, t.value), a = lab && lab.querySelector('.pf-go'); if (a) a.outerHTML = u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="pf-go" aria-label="Відкрити">↗︎</a>` : '<span class="pf-go off"></span>'; });
    return;
  }
  if (t.dataset.pff) {
    const v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'checkbox') { const s = t.parentElement.querySelector('span'); if (s) s.textContent = t.checked ? 'Так' : 'Ні'; }
    save({ fields: { [t.dataset.pff]: v } }); return;
  }
  if (t.dataset.pfgname) { const sc = C.schema(), g = sc.groups.find(k => k.id === t.dataset.pfgname), v = t.value.trim(); if (g && v && v !== g.name) { g.name = v; saveSchema(sc); } return; }
  if (t.name === 'type' && t.closest('[data-pfaddf]')) { const o = t.closest('form').querySelector('.pf-opts'); o.hidden = t.value !== 'select'; o.required = t.value === 'select'; }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'pfTagIn' && e.key === 'Enter') { e.preventDefault(); const v = e.target.value; e.target.value = ''; addTag(v); }
});
document.addEventListener('input', e => {
  // вибір зі списку підказок datalist — додаємо одразу
  if (e.target.id === 'pfTagIn' && e.inputType !== 'insertText' && C.schema().tags.some(t => t.name === e.target.value)) { const v = e.target.value; e.target.value = ''; addTag(v); }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.closest || !f.closest('#dProfile')) return;
  e.preventDefault();
  const sc = C.schema(), name = String(f.elements.name.value || '').trim(); if (!name) return;
  if (f.hasAttribute('data-pfaddg')) { if (sc.groups.length >= 20) return C.toast('<b>Максимум 20 груп.</b>'); sc.groups.push({ id: slug(name), name, fields: [] }); saveSchema(sc); return; }
  const g = sc.groups.find(k => k.id === f.dataset.pfaddf); if (!g) return;
  const type = f.elements.type.value, options = type === 'select' ? String(f.elements.options.value || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30) : [];
  if (type === 'select' && !options.length) { f.elements.options.focus(); return; }
  g.fields.push({ id: slug(name), name, type, options });
  saveSchema(sc).then(() => { const n = document.querySelector(`#dProfile [data-pfaddf="${CSS.escape(g.id)}"] input[name=name]`); n && n.focus(); });
});
})();
