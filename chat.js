/* STACKUP. — чати і картка клієнта.
   Розділ «Чати»: усі розмови з Telegram, Instagram Direct і пошти в одному списку.
   У картці клієнта вкладка «Чат»: уся розмова, відповідь у будь-який канал, чернетки від Claude.
   Нічого не надсилається само: Claude лише пише чернетку в поле, а відправка — двома натисканнями. */
(() => {
'use strict';
const C = window.StackupCRM, H = window.StackupHub;
if (!C || !H) return;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY = 864e5;
const CH = {
  telegram: { l: 'Telegram', s: 'TG', i: '✈' },
  instagram: { l: 'Instagram', s: 'IG', i: '◎' },
  email: { l: 'Пошта', s: '@', i: '✉' }
};
const ORDER = ['telegram', 'instagram', 'email'];
const TONES = ['peach', 'blue', 'mint', 'lav', 'rose', 'stone'];
const tone = id => TONES[[...String(id)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];
const initials = x => String(x.company || x.name || '?').replace(/^@/, '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
const nameOf = x => x.company || x.name || 'Клієнт';
const fmt = (iso, o) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('uk-UA', o); };
const hm = iso => fmt(iso, { hour: '2-digit', minute: '2-digit' });
function ago(iso) {
  const t = new Date(iso).getTime(); if (!t) return '';
  const d = Date.now() - t;
  if (d < 60e3) return 'щойно';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' хв';
  if (new Date(t).toDateString() === new Date().toDateString()) return hm(iso);
  if (d < 7 * DAY) return fmt(iso, { weekday: 'short' });
  return fmt(iso, { day: 'numeric', month: 'short' });
}
function dayLabel(iso) {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((t - x) / DAY);
  return diff === 0 ? 'СЬОГОДНІ' : diff === 1 ? 'ВЧОРА' : fmt(iso, { day: 'numeric', month: 'long' }).toUpperCase();
}
const ERR = {
  'confirm required': 'Потрібне підтвердження.', 'no channel': 'Клієнт ще не писав у цей канал.', 'telegram not connected': 'Telegram-бот не підключений.',
  'instagram not connected': 'Instagram ще не підключено.', 'gmail not allowed': 'Немає доступу до Gmail. Запусти setupContent.', 'mail quota': 'Ліміт листів на сьогодні вичерпано.',
  'bad email': 'У картці немає правильного email.', 'too many requests': 'Забагато повідомлень за годину. Зачекай трохи.', 'bad request': 'Заповни текст повідомлення.'
};
function errText(m) {
  m = String(m || '');
  if (/blocked by the user|bot was blocked/i.test(m)) return 'Клієнт заблокував бота в Telegram.';
  if (/outside of allowed window|24 ?h/i.test(m)) return 'Instagram дозволяє відповідати лише протягом 24 годин після останнього повідомлення клієнта.';
  if (/^(TG|IG): /.test(m)) return (m[0] === 'T' ? 'Telegram: ' : 'Instagram: ') + m.slice(4);
  return ERR[m] || 'Не надіслано. Спробуй ще раз.';
}

/* ---------- стан ---------- */
let inbox = { convs: {}, channels: null, loaded: false, old: false, primed: false };
let filter = store.get('stackup-chat-filter', 'all'), q = '';
const chats = {}, drafts = {}, aiS = {}, justAdded = {};
let cur = null, confirmFor = null, confirmT = null, inboxT = null, chatT = null;

/* ---------- демо ---------- */
const DEMO_LINES = {
  telegram: [['in', 'Добрий день! Побачила ваш сайт, хочу оновити свій. Можна дізнатись ціну?'], ['out', 'Вітаю! Так, звісно 🙂 Розкажіть, будь ласка, що за бізнес і що зараз не подобається в сайті?'], ['in', 'Квіткова майстерня в Києві. Сайт старий, з телефона незручно замовляти букет'], ['in', 'І хочеться онлайн-оплату']],
  instagram: [['in', 'Привіт! Ви робите інтернет-магазини?'], ['out', 'Привіт! Так, робимо 🙌 Що будете продавати?'], ['in', 'Косметику ручної роботи, десь 40 товарів']],
  email: [['in', 'Сайт для кав’ярні\nДобрий день! Хочемо оновити сайт і додати онлайн-замовлення. Скільки це може коштувати?'], ['out', 'Re: Сайт для кав’ярні\nВітаю, Олено! Дякую за звернення. Заповніть, будь ласка, короткий бриф, і я підготую оцінку.']]
};
function demoPlan() {
  const ls = C.leads().filter(l => l.status !== 'archive');
  return ls.slice(0, 6).map((l, i) => ({ l, ch: i === 0 ? 'telegram' : i === 1 ? 'instagram' : i === 3 ? 'telegram' : 'email', unread: i === 0 ? 2 : i === 1 ? 1 : 0, mins: [4, 26, 180, 1500, 3000, 6000][i] }));
}
function demoMsgs(p) {
  const lines = DEMO_LINES[p.ch], t0 = Date.now() - p.mins * 60e3 - lines.length * 7 * 60e3;
  return lines.map(([dir, text], k) => { const [subject, ...rest] = p.ch === 'email' ? text.split('\n') : [null, text]; return { id: 'd' + p.l.id + k, channel: p.ch, mine: dir === 'out', at: new Date(t0 + k * 7 * 60e3).toISOString(), subject: subject || undefined, text: p.ch === 'email' ? rest.join('\n') : text }; });
}
function demoInbox() {
  const convs = {}, seen = store.get('stackup-demo-chat-read', {});
  demoPlan().forEach(p => { const m = demoMsgs(p), last = m[m.length - 1]; convs[p.l.id] = { unread: seen[p.l.id] ? 0 : p.unread, channels: [p.ch], last: { channel: last.channel, mine: last.mine, text: last.subject ? last.subject : last.text, at: last.at } }; });
  Object.entries(demoDraftStore()).forEach(([id, list]) => { if (!list.length) return; const c = convs[id] = convs[id] || { unread: 0, channels: [], last: null }; c.drafts = list.length; c.draft = { channel: list[0].channel, text: list[0].text, at: list[0].at }; });
  return { ok: true, convs, channels: { telegram: { on: true, bot: 'Stackup_studio_bot' }, instagram: { on: false, username: '' }, email: { on: true } } };
}
function demoChat(id) {
  const p = demoPlan().find(x => x.l.id === id), seen = store.get('stackup-demo-chat-read', {}); seen[id] = 1; store.set('stackup-demo-chat-read', seen);
  const extra = store.get('stackup-demo-chat-sent', {})[id] || [];
  const ch = {}; if (p) ch[p.ch] = p.ch === 'email' ? (p.l.email || 'client@example.com') : p.ch === 'telegram' ? '@' + String(p.l.name || 'client').split(/\s+/)[0].toLowerCase() : '@studio_client';
  const lead = C.leads().find(x => x.id === id) || {};
  if (H.validEmail(lead.email)) ch.email = lead.email;
  return new Promise(ok => setTimeout(() => ok({ ok: true, messages: (p ? demoMsgs(p) : []).concat(extra), drafts: demoDraftStore()[id] || [], channels: ch, invite: ch.telegram ? '' : 'https://t.me/Stackup_studio_bot?start=' + id + '_demo' }), 500));
}
/* демо-чернетки: кілька штук у перших клієнтів, щоб було видно, як виглядає довгий список */
function demoDraftStore() {
  let all = store.get('stackup-demo-drafts', null);
  if (all) return all;
  all = {}; const plan = demoPlan(), at = m => new Date(Date.now() - m * 60e3).toISOString();
  if (plan[0]) all[plan[0].l.id] = [
    { id: 'dd1', channel: 'telegram', subject: '', text: 'Дякую, що розповіли! Для квіткової майстерні онлайн-оплата і зручне замовлення з телефона — саме те, що треба. Можемо созвонитись на 15 хвилин завтра? 🌷', at: at(3), src: 'ai:reply' },
    { id: 'dd2', channel: 'telegram', subject: '', text: 'Підготую для вас 2 варіанти: швидкий лендинг з каталогом і повноцінний магазин з кошиком. Скажіть, скільки приблизно букетів у вас в асортименті?', at: at(40), src: 'me' },
    { id: 'dd3', channel: 'telegram', subject: '', text: 'Нагадую про себе 🙂 Якщо зручно, надішлю короткий бриф — 5 хвилин, і я порахую ціну.', at: at(300), src: 'ai:followup' },
    { id: 'dd4', channel: 'telegram', subject: '', text: 'Ось кілька наших робіт для натхнення: stackup.studio/#work', at: at(1500), src: 'me' }
  ];
  if (plan[2]) all[plan[2].l.id] = [{ id: 'dd5', channel: 'email', subject: 'Re: Сайт для кав’ярні', text: 'Вітаю, Олено!\n\nДякую за бриф. Орієнтовно це $3 000–4 500 і 5–6 тижнів. Надішлю детальну пропозицію до п’ятниці.\n\nЛана, Stackup', at: at(90), src: 'ai:reply' }];
  store.set('stackup-demo-drafts', all);
  return all;
}
function demoDraftSet(id, list) { const all = demoDraftStore(); all[id] = list; store.set('stackup-demo-drafts', all); }
const DEMO_AI = {
  analyze: '**Суть.** Квіткова майстерня хоче новий сайт з онлайн-замовленням букетів і оплатою карткою.\n\n**Наскільки гаряча: 4 з 5.** Пише сама, є біль (з телефона незручно) і зрозуміла мета.\n\n**Обсяг і ціна.** Каталог на 30–60 букетів, кошик, оплата, доставка за 2 години: орієнтовно $2 500–4 000, 4–6 тижнів.\n\n**Що уточнити**\n• Скільки букетів і як часто змінюється асортимент\n• Яку платіжку хочуть (LiqPay, WayForPay, Monobank)\n• Хто робить фото\n\n**Наступні кроки**\n• Сьогодні: відповісти і запропонувати дзвінок на 15 хв\n• Завтра: надіслати бриф\n• Через 3 дні: нагадати, якщо мовчить',
  reply: { telegram: 'Дякую, зрозуміла 🌷 Онлайн-оплату й зручне замовлення з телефона зробимо. Підкажіть, скільки приблизно букетів у каталозі і чи потрібна доставка в той самий день? Можемо коротко созвонитись на 15 хв, коли вам зручно?', instagram: 'Супер, косметика ручної роботи це гарно 🙌 Підкажіть, будь ласка, чи вже є фото товарів і яку оплату хочете підключити? Тоді одразу скажу орієнтовну ціну.', email: 'Вітаю, Олено!\n\nДякую за бриф, задача зрозуміла: новий сайт для кав’ярні з онлайн-замовленням і самовивозом.\n\nЩоб точно оцінити, підкажіть, будь ласка:\n• яка у вас каса чи POS-система;\n• чи плануєте доставку, чи лише самовивіз;\n• хто наповнюватиме меню.\n\nМожемо коротко поговорити 20 хвилин цього тижня?\n\nЛана, Stackup' },
  followup: { telegram: 'Добрий день! Нагадую про сайт для майстерні 🌷 Якщо зручно, надішлю приклад, як може виглядати каталог.', instagram: 'Привіт! Як ваші думки щодо магазину? Можу показати пару прикладів 🙂', email: 'Вітаю!\n\nНагадую про пропозицію щодо сайту. Якщо є питання, я на зв’язку і можу коротко показати приклади.\n\nЛана, Stackup' }
};

/* ---------- інбокс ---------- */
const unread = () => Object.values(inbox.convs).reduce((n, c) => n + (+c.unread || 0), 0);
async function loadInbox() {
  try {
    const r = C.demo ? demoInbox() : await C.call({ action: 'inbox' });
    const before = inbox.primed ? Object.assign({}, ...Object.entries(inbox.convs).map(([k, v]) => ({ [k]: v.unread || 0 }))) : null;
    inbox = { convs: r.convs || {}, channels: r.channels || null, loaded: true, old: false, primed: true };
    if (before) {
      const fresh = Object.entries(inbox.convs).filter(([k, v]) => (v.unread || 0) > (before[k] || 0) && !(cur && cur.id === k && C.current() === k && paneOn()));
      if (fresh.length) {
        const l = C.leads().find(x => x.id === fresh[0][0]);
        C.toast(`<span class="mono">${esc((CH[(fresh[0][1].last || {}).channel] || CH.telegram).l.toUpperCase())}</span><b>${esc(l ? nameOf(l) : 'Нове повідомлення')}: ${esc(String((fresh[0][1].last || {}).text || '').slice(0, 60))}</b><button type="button" data-chat="${esc(fresh[0][0])}">Відкрити ↗︎</button>`, 9000);
      }
    }
  } catch (e) {
    if (e.message === 'unauthorized') return;
    if (e.message === 'unknown action') inbox.old = true;
    inbox.loaded = true;
  }
  H.applySec();
  if (H.sec() === 'chats') render();
  badgeDrawer();
}
function convRows() {
  const leads = C.leads();
  return leads.map(l => {
    const c = inbox.convs[l.id] || { unread: 0, last: null, channels: [] };
    const ch = new Set(c.channels || []); if (H.validEmail(l.email)) ch.add('email');
    return { l, c, ch: ORDER.filter(k => ch.has(k)), at: c.last ? c.last.at : l.created };
  }).filter(x => x.l.status !== 'archive' || x.c.unread);
}
function render() {
  const box = $('#secChats'); if (!box) return;
  const all = convRows(), chs = inbox.channels || {};
  const counts = { all: all.length, unread: all.filter(x => x.c.unread).length, drafts: all.filter(x => x.c.drafts).length, telegram: 0, instagram: 0, email: 0 };
  all.forEach(x => x.ch.forEach(k => { counts[k]++; }));
  const ql = q.trim().toLowerCase();
  const list = all.filter(x => filter === 'all' || (filter === 'unread' ? x.c.unread : filter === 'drafts' ? x.c.drafts : x.ch.includes(filter)))
    .filter(x => !ql || [x.l.name, x.l.company, x.l.email, x.l.phone, x.c.last && x.c.last.text].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const tg = chs.telegram || {}, igc = chs.instagram || {}, em = chs.email || {};
  const chip = (k, l) => `<button type="button" class="ch-f${filter === k ? ' on' : ''}" data-cfilter="${k}" aria-pressed="${filter === k}">${l}<em>${counts[k] || ''}</em></button>`;
  const hadFocus = document.activeElement && document.activeElement.id === 'chSearch';
  box.innerHTML = `<header class="hub-top"><div class="top-title"><h1>Чати</h1><span class="mono">TELEGRAM · INSTAGRAM · ПОШТА — УСЕ В ОДНОМУ МІСЦІ</span></div>
      <div class="hub-tools"><input type="search" id="chSearch" placeholder="Пошук розмови" value="${esc(q)}" aria-label="Пошук розмови"><button type="button" class="icon-btn" id="chRefresh" aria-label="Оновити">↻</button></div></header>
    ${inbox.old ? '<div class="banner"><span class="mono">ПОТРІБНЕ ОНОВЛЕННЯ</span><b>Щоб чати запрацювали, встав новий Code.gs у Google Apps Script, запусти setupContent і створи нову версію розгортання.</b></div>' : ''}
    <div class="ch-chans">
      <div class="ch-chan ${tg.on ? 'on' : ''}"><span class="ch-ico tg">${CH.telegram.i}</span><div><b>Telegram</b><small>${tg.on ? (tg.bot ? 'Клієнти пишуть боту @' + esc(tg.bot) : 'Бот підключений') : 'Бот не підключений'}</small>${tg.error ? `<small class="err">${esc(tg.error)}</small>` : ''}</div>${tg.bot ? `<button type="button" class="link mono" data-ccopy="https://t.me/${esc(tg.bot)}">КОПІЮВАТИ ПОСИЛАННЯ</button>` : ''}</div>
      <div class="ch-chan ${igc.on ? 'on' : ''}"><span class="ch-ico ig">${CH.instagram.i}</span><div><b>Instagram Direct</b><small>${igc.on ? 'Повідомлення @' + esc(igc.username) : 'Запрацює, щойно підключимо Instagram'}</small>${igc.error ? `<small class="err">${esc(igc.error)}</small>` : ''}</div></div>
      <div class="ch-chan ${em.on !== false ? 'on' : ''}"><span class="ch-ico em">${CH.email.i}</span><div><b>Пошта</b><small>Листи клієнтів з твоєї Gmail</small>${em.error ? `<small class="err">${esc(em.error)}</small>` : ''}</div></div>
    </div>
    <div class="ch-filters" role="group" aria-label="Фільтр">${chip('all', 'Усі')}${chip('unread', 'Непрочитані')}${chip('drafts', '✎ Чернетки')}${chip('telegram', 'Telegram')}${chip('instagram', 'Instagram')}${chip('email', 'Пошта')}</div>
    ${!inbox.loaded ? `<ol class="cv-list">${[0, 1, 2, 3].map(i => `<li class="cv sk" style="--i:${i}"><span class="ava sk-b"></span><span class="cv-main"><span class="sk-l w40"></span><span class="sk-l w70"></span></span></li>`).join('')}</ol>`
      : list.length ? `<ol class="cv-list">${list.map((x, i) => convRow(x, i)).join('')}</ol>`
      : `<div class="ch-none"><span class="ch-none-i" aria-hidden="true">✺</span><p><b>${all.length ? 'Тут порожньо.' : 'Поки що розмов немає.'}</b><br>${all.length ? 'Зміни фільтр або пошук.' : 'Коли клієнт напише боту в Telegram, у Direct Instagram або на пошту, розмова з’явиться тут, а для нового клієнта одразу створиться картка.'}</p></div>`}`;
  if (hadFocus) { const s = $('#chSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
function convRow(x, i) {
  const l = x.l, c = x.c, last = c.last, main = (last && last.channel) || x.ch[0];
  return `<li><button type="button" class="cv${c.unread ? ' un' : ''}" data-chat="${esc(l.id)}" style="--i:${Math.min(i, 12)}">
    <span class="ava ${tone(l.id)}">${esc(initials(l))}${main ? `<i class="cv-ch ${main}" title="${CH[main].l}">${CH[main].i}</i>` : ''}</span>
    <span class="cv-main"><span class="cv-top"><b>${esc(nameOf(l))}</b><time class="mono">${esc(ago(x.at))}</time></span>
    <span class="cv-prev">${c.draft && !c.unread ? `<em class="cv-dr">Чернетка:</em> ${esc(String(c.draft.text).replace(/\s+/g, ' ').slice(0, 110))}` : last ? (last.mine ? '<em>Ти:</em> ' : '') + esc(String(last.text).replace(/\s+/g, ' ').slice(0, 110)) : `<i>${esc(l.mode === 'chat' ? 'Нова розмова' : l.mode === 'lead' ? 'Заявка з сайту' : 'Бриф')}${x.ch.length ? ' · можна написати: ' + x.ch.map(k => CH[k].l).join(', ') : ' · немає каналу для відповіді'}</i>`}</span></span>
    ${c.unread ? `<em class="cv-n">${c.unread}</em>` : c.drafts ? `<em class="cv-d" title="Чернеток: ${c.drafts}">✎ ${c.drafts}</em>` : ''}</button></li>`;
}

/* ---------- розмова в картці ---------- */
const keyOf = m => m.id || (m.channel + m.at + String(m.text).slice(0, 24));
const paneOn = () => !!$('#pane-chat') && !$('#pane-chat').hidden;
function chans(t) { return ORDER.filter(k => t && t.channels && t.channels[k]); }
function pickChannel(id) {
  const t = chats[id], d = drafts[id] = drafts[id] || { subject: '', text: '' };
  const avail = chans(t);
  if (d.channel && avail.includes(d.channel)) return d.channel;
  const lastIn = ((t && t.list) || []).slice().reverse().find(m => !m.mine && avail.includes(m.channel));
  d.channel = lastIn ? lastIn.channel : avail[0] || '';
  return d.channel;
}
async function loadChat(id, silent) {
  const prev = chats[id];
  if (!silent) { chats[id] = Object.assign({}, prev || {}, { loading: !(prev && prev.list) }); renderChat(); }
  let fresh = [];
  try {
    const r = C.demo ? await demoChat(id) : await C.call({ action: 'chat', id });
    const old = prev && prev.list ? new Set(prev.list.filter(m => !m.local).map(keyOf)) : null;
    const srv = r.messages || [], same = (a, b) => a.channel === b.channel && b.mine && String(a.text).trim() === String(b.text).trim();
    // своє щойно надіслане тримаємо, доки сервер (Gmail буває повільний) не покаже його сам
    const pending = prev && prev.list ? prev.list.filter(m => m.local && (m.state === 'sending' || m.state === 'failed' || (Date.now() - new Date(m.at) < 10 * 60e3 && !srv.some(x => same(m, x))))) : [];
    const list = srv.concat(pending);
    fresh = old ? list.filter(m => !m.local && !old.has(keyOf(m))).map(keyOf) : [];
    const dPrev = prev && prev.drafts ? prev.drafts.map(x => x.id).join() : null;
    chats[id] = { list, channels: r.channels || {}, invite: r.invite || '', mailError: r.mailError || '', fresh, drafts: r.drafts || (prev && prev.drafts) || [] };
    syncDraftConv(id);
    if (silent && dPrev !== null && dPrev !== chats[id].drafts.map(x => x.id).join() && cur && cur.id === id) renderDrafts();
    if (inbox.convs[id] && inbox.convs[id].unread) { inbox.convs[id].unread = 0; H.applySec(); if (H.sec() === 'chats') render(); }
  } catch (e) {
    if (e.message === 'unauthorized') return;
    if (e.message === 'unknown action') chats[id] = { list: [], channels: {}, old: true };
    else if (!prev || !prev.list) chats[id] = { err: e.message };
    else chats[id] = Object.assign(prev, { loading: false });
  }
  if (cur && cur.id === id) { if (silent && !fresh.length) return; silent ? renderStream(true) : renderChat(); }
}
function renderChat() {
  const box = $('#dTalk'); if (!box || !cur) return;
  const id = cur.id, t = chats[id] || { loading: true };
  const avail = chans(t), ch = pickChannel(id), r = cur.row;
  box.innerHTML = `<div class="ch-head">${avail.length ? avail.map(k => `<span class="ch-pill ${k}"><i>${CH[k].i}</i>${esc(String(t.channels[k]).trim() || CH[k].l)}</span>`).join('') : ''}
      ${t.invite ? `<button type="button" class="ch-pill add" data-ccopy="${esc(t.invite)}" title="Посилання на бота: клієнт натисне Start, і Telegram-чат прив’яжеться до цієї картки"><i>＋</i>Запросити в Telegram</button>` : ''}</div>
    ${t.old ? '<p class="ch-warn">Чати запрацюють після оновлення Code.gs у Google Apps Script (setupContent + нова версія розгортання).</p>' : ''}
    ${t.mailError ? `<p class="ch-warn">${t.mailError === 'gmail not allowed' ? 'Пошта ще не підключена: запусти setupContent у Google Apps Script і дозволь доступ до Gmail.' : 'Не вдалося завантажити листи з Gmail.'}</p>` : ''}
    <ol class="ch-stream" id="chStream" aria-live="polite"></ol>
    <section class="ch-drafts" id="chDrafts" aria-label="Чернетки по клієнту" hidden></section>
    <div class="ch-compose" id="chCompose"></div>`;
  renderStream(false);
  renderDrafts();
  renderCompose();
  fitTalk();
  void r; void ch;
}
/* розмова займає рівно висоту картки: стрічка гортається всередині, поле відповіді завжди внизу */
function fitTalk() {
  const tk = $('#dTalk'), dr = $('#drawer'); if (!tk || !dr || !paneOn()) return;
  const top = tk.getBoundingClientRect().top - dr.getBoundingClientRect().top + dr.scrollTop;
  tk.style.height = Math.max(380, dr.clientHeight - top) + 'px';
}
addEventListener('resize', () => { fitTalk(); });
function streamHTML(t, id) {
  if (t.loading) return [0, 1, 2, 3].map(i => `<li class="msg ${i % 2 ? 'me' : 'them'} sk" style="--i:${i}"><div class="msg-b"><span class="sk-l w${[70, 50, 80, 40][i]}"></span><span class="sk-l w${[40, 30, 60, 20][i]}"></span></div></li>`).join('');
  if (t.err) return `<li class="ch-empty">Не вдалося завантажити розмову. <button type="button" class="link mono" data-creload>СПРОБУВАТИ ЩЕ</button></li>`;
  const list = (t.list || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (!list.length) {
    const avail = chans(t);
    return `<li class="ch-empty"><span class="ch-none-i" aria-hidden="true">✺</span><b>Повідомлень ще немає.</b><br>${avail.length ? 'Напиши першим через ' + avail.map(k => CH[k].l).join(' або ') + '.' : t.invite ? 'Надішли клієнту посилання «Запросити в Telegram» (кнопка вгорі): щойно він натисне Start, розмова з’явиться тут.' : 'У картці немає email чи месенджера. Зателефонуй клієнту або додай контакт.'}</li>`;
  }
  let day = '', out = '';
  const fresh = new Set(t.fresh || []);
  list.forEach((m, i) => {
    const dl = dayLabel(m.at);
    if (dl !== day) { day = dl; out += `<li class="ch-day mono"><span>${esc(dl)}</span></li>`; }
    const long = String(m.text).length > 700;
    const st = m.state === 'sending' ? '<span class="msg-st sending" aria-label="Надсилаю">надсилаю<i></i><i></i><i></i></span>' : m.state === 'failed' ? '' : m.mine ? `<span class="msg-st${m.state === 'sent' ? ' just' : ''}" aria-label="Надіслано">✓</span>` : '';
    out += `<li class="msg ${m.mine ? 'me' : 'them'} ${esc(m.channel)}${fresh.has(keyOf(m)) || m.state ? ' new' : ''}${m.state === 'sending' ? ' sending' : ''}${m.state === 'failed' ? ' failed' : ''}" style="--i:${Math.max(0, i - list.length + 6)}">
      <div class="msg-b">${m.subject ? `<b class="msg-s">${esc(m.subject)}</b>` : ''}<p class="${long ? 'clamp' : ''}">${esc(m.text).replace(/\n/g, '<br>')}</p>${long ? '<button type="button" class="link mono msg-more" data-cmore>ПОКАЗАТИ ПОВНІСТЮ</button>' : ''}
      <span class="msg-meta mono"><i title="${CH[m.channel] ? CH[m.channel].l : ''}">${CH[m.channel] ? CH[m.channel].i : ''}</i>${esc(hm(m.at))}${st}</span>
      ${m.state === 'failed' ? `<span class="msg-err">${esc(errText(m.error))} <button type="button" class="link mono" data-cretry="${esc(m.id)}">ПОВЕРНУТИ В ПОЛЕ</button></span>` : ''}</div></li>`;
  });
  void id;
  return out;
}
function renderStream(keepPos) {
  const s = $('#chStream'); if (!s || !cur) return;
  const t = chats[cur.id] || { loading: true };
  const atEnd = !keepPos || s.scrollHeight - s.scrollTop - s.clientHeight < 80;
  s.innerHTML = streamHTML(t, cur.id);
  if (atEnd) { s.scrollTop = s.scrollHeight; requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); setTimeout(() => { s.scrollTop = s.scrollHeight; }, 550); }
  t.fresh = [];
  (t.list || []).forEach(m => { if (m.state === 'sent') m.state = ''; });
}
function renderCompose() {
  const box = $('#chCompose'); if (!box || !cur) return;
  const id = cur.id, t = chats[id] || {}, avail = chans(t), ch = pickChannel(id), d = drafts[id], a = aiS[id] || {};
  if (t.loading && !t.list) { box.innerHTML = ''; return; }
  if (!avail.length) { box.innerHTML = t.invite ? `<div class="ch-noch"><p>Щоб листуватися тут, запроси клієнта в Telegram: скопіюй посилання і надішли йому будь-яким способом.</p><button type="button" class="button primary sm" data-ccopy="${esc(t.invite)}"><b>Скопіювати посилання</b><span>⧉</span></button></div>` : ''; return; }
  const writing = a.busy === 'reply' || a.busy === 'followup';
  const conf = confirmFor === id;
  box.className = 'ch-compose' + (writing ? ' writing' : '') + (conf ? ' confirming' : '');
  box.innerHTML = `${avail.length > 1 ? `<div class="ch-via" role="radiogroup" aria-label="Канал відповіді"><span class="mono">ВІДПОВІСТИ ЧЕРЕЗ</span>${avail.map(k => `<button type="button" role="radio" aria-checked="${k === ch}" data-cvia="${k}" class="${k}"><i>${CH[k].i}</i>${CH[k].l}</button>`).join('')}</div>` : `<div class="ch-via one"><span class="mono">ВІДПОВІДЬ ЧЕРЕЗ ${esc(CH[ch].l.toUpperCase())}</span></div>`}
    ${ch === 'email' ? `<input type="text" id="chSubject" maxlength="200" placeholder="Тема листа" value="${esc(d.subject || defaultSubject(id))}" aria-label="Тема листа"${writing ? ' disabled' : ''}>` : ''}
    <div class="ch-box"><textarea id="chText" rows="2" maxlength="${ch === 'email' ? 20000 : 4000}" placeholder="${ch === 'email' ? 'Текст листа…' : 'Повідомлення…'}" aria-label="Текст повідомлення"${writing ? ' disabled' : ''}>${esc(d.text || '')}</textarea>
      <div class="ch-writing" aria-hidden="${!writing}"><span class="ai-spark">✱</span><b>Claude пише ${a.busy === 'followup' ? 'нагадування' : 'відповідь'}</b><span class="dots"><i></i><i></i><i></i></span><span class="sk-l w90"></span><span class="sk-l w70"></span><span class="sk-l w40"></span></div></div>
    <div class="ch-tools">
      <button type="button" class="ch-ai" data-cai="reply"${a.busy ? ' disabled' : ''}><span class="ai-spark">✱</span>Відповідь від Claude</button>
      <button type="button" class="ch-ai" data-cai="followup"${a.busy ? ' disabled' : ''}><span>↻</span>Нагадування</button>
      <button type="button" class="ch-ai ch-keep" data-dsave${writing ? ' disabled' : ''} title="Зберегти текст із поля в чернетки цього клієнта"><span>✎</span>${d.did ? 'Оновити чернетку' : 'У чернетки'}</button>
      <span class="grow"></span>
      ${conf ? '<button type="button" class="ch-cancel mono" data-cno>НІ</button>' : ''}
      <button type="button" class="ch-send${conf ? ' confirm' : ''}" id="chSend"${writing ? ' disabled' : ''}><b>${conf ? 'Так, надіслати в ' + esc(CH[ch].l) : 'Надіслати'}</b><span>${conf ? '✓' : '→'}</span></button>
    </div>
    <p class="mono ch-hint">${conf ? 'НАТИСНИ ЩЕ РАЗ, ЩОБ НАДІСЛАТИ КЛІЄНТУ' : 'CLAUDE НІЧОГО НЕ НАДСИЛАЄ САМ · ⌘ + ENTER — НАДІСЛАТИ'}</p>`;
  autosize($('#chText'));
}
function defaultSubject(id) {
  const t = chats[id], last = ((t && t.list) || []).slice().reverse().find(m => m.channel === 'email' && m.subject);
  return last ? (/^re:/i.test(last.subject) ? last.subject : 'Re: ' + last.subject) : 'Stackup: ' + ((cur && cur.row.type) || 'ваш проєкт');
}
function autosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px'; }
function badgeDrawer() {
  const b = $('#dChatNew'); if (!b || !cur) return;
  const n = (inbox.convs[cur.id] || {}).unread || 0;
  b.textContent = paneOn() ? '' : (n || '');
}

/* ---------- чернетки по клієнту ----------
   Кожна чернетка Claude і кожен текст, збережений кнопкою «У чернетки», лежать у картці клієнта.
   Список видно над полем відповіді, щойно відкриваєш чат; довгий список гортається всередині. */
let draftsOpen = store.get('stackup-chat-drafts-open', true);
const SRC = { me: 'Ти', 'ai:reply': 'Claude · відповідь', 'ai:followup': 'Claude · нагадування' };
const freshDraft = {};
function syncDraftConv(id) {
  const list = (chats[id] || {}).drafts || [], c = inbox.convs[id] = inbox.convs[id] || { unread: 0, channels: [], last: null };
  c.drafts = list.length; c.draft = list[0] ? { channel: list[0].channel, text: list[0].text, at: list[0].at } : null;
  if (H.sec() === 'chats') render();
}
function addDraft(id, x) { const t = chats[id] = chats[id] || {}; t.drafts = [x].concat((t.drafts || []).filter(k => k.id !== x.id)); freshDraft[x.id] = 1; syncDraftConv(id); }
function dropDraft(id, did) { const t = chats[id]; if (!t || !t.drafts) return; t.drafts = t.drafts.filter(k => k.id !== did); const d = drafts[id]; if (d && d.did === did) d.did = ''; syncDraftConv(id); if (cur && cur.id === id) renderDrafts(); }
function renderDrafts() {
  const box = $('#chDrafts'); if (!box || !cur) return;
  const id = cur.id, t = chats[id] || {}, list = t.drafts || [], d = drafts[id] || {};
  if (!list.length || (t.loading && !t.list)) { box.hidden = true; box.innerHTML = ''; fitTalk(); return; }
  box.hidden = false;
  box.className = 'ch-drafts' + (draftsOpen ? ' open' : '') + (list.length > 3 ? ' many' : '');
  const top = list[0];
  box.innerHTML = `<button type="button" class="chd-head" data-dtoggle aria-expanded="${draftsOpen}" aria-controls="chdList"><span class="chd-i" aria-hidden="true">✎</span><b>Чернетки по клієнту</b><em>${list.length}</em><span class="chd-peek">${draftsOpen ? '' : esc(String(top.text).replace(/\s+/g, ' ').slice(0, 90))}</span><span class="chd-arr" aria-hidden="true">⌃</span></button>
    <ol class="chd-list" id="chdList"${draftsOpen ? '' : ' hidden'}>${list.map((x, i) => `<li class="chd ${esc(x.channel)}${x.id === d.did ? ' on' : ''}${freshDraft[x.id] ? ' new' : ''}" style="--i:${Math.min(i, 8)}" data-did="${esc(x.id)}">
      <button type="button" class="chd-use" data-duse="${esc(x.id)}" title="Взяти в поле відповіді"><span class="chd-meta mono"><i aria-hidden="true">${CH[x.channel] ? CH[x.channel].i : ''}</i>${esc(SRC[x.src] || (String(x.src).indexOf('ai') === 0 ? 'Claude' : 'Ти'))} · ${esc(ago(x.at))}${x.id === d.did ? ' · <b>У ПОЛІ</b>' : ''}</span>${x.subject ? `<b class="chd-s">${esc(x.subject)}</b>` : ''}<span class="chd-t">${esc(x.text)}</span></button>
      <button type="button" class="chd-del" data-ddel="${esc(x.id)}" aria-label="Видалити чернетку">✕</button></li>`).join('')}</ol>`;
  Object.keys(freshDraft).forEach(k => delete freshDraft[k]);
  fitTalk();
}
/* якщо в полі є свій текст, що ще не збережений, — спершу кладемо його в чернетки, щоб нічого не загубилось */
function stashField(id) {
  const d = drafts[id]; if (!d) return;
  const text = String(d.text || '').trim(); if (!text) return;
  const t = chats[id] || {}, same = (t.drafts || []).find(x => x.id === d.did);
  if (same && same.text.trim() === text && String(same.subject || '') === String(d.subject || '')) return;
  saveDraft(id, true);
}
async function saveDraft(id, quiet) {
  const d = drafts[id], ch = pickChannel(id), text = String((d && d.text) || '').trim();
  if (!text) { if (!quiet) shake($('#chText')); return; }
  const subject = ch === 'email' ? String(d.subject || defaultSubject(id)).trim() : '';
  const old = d.did || '';
  const tmp = { id: 'dl' + Date.now().toString(36), channel: ch, subject, text, at: new Date().toISOString(), src: 'me' };
  if (old) dropDraft(id, old);
  addDraft(id, tmp); if (!quiet) d.did = tmp.id;
  if (cur && cur.id === id) { renderDrafts(); if (!quiet) renderCompose(); }
  try {
    if (C.demo) demoDraftSet(id, chats[id].drafts);
    else {
      const r = await C.call({ action: 'draft', id, channel: ch, text, subject, did: old && !/^dl/.test(old) ? old : undefined });
      const t = chats[id]; t.drafts = (t.drafts || []).map(x => x.id === tmp.id ? r.draft : x);
      if (d.did === tmp.id) d.did = r.draft.id;
      syncDraftConv(id); if (cur && cur.id === id) renderDrafts();
    }
    if (!quiet) C.toast('<span class="mono">ЧЕРНЕТКА</span> <b>Збережено в картці клієнта.</b>');
  } catch (e) {
    dropDraft(id, tmp.id);
    C.toast('<span class="mono">ЧЕРНЕТКА</span> <b>' + esc(e.message === 'too many drafts' ? 'Забагато чернеток: видали старі.' : e.message === 'unknown action' ? 'Онови Code.gs у Google Apps Script.' : 'Не вдалося зберегти чернетку.') + '</b>', 5000);
  }
}
function useDraft(id, did) {
  const t = chats[id] || {}, x = (t.drafts || []).find(k => k.id === did); if (!x) return;
  const d = drafts[id] = drafts[id] || {};
  if (d.did !== did) stashField(id);
  const avail = chans(t);
  d.channel = avail.includes(x.channel) ? x.channel : pickChannel(id);
  d.text = x.text; d.subject = x.subject || ''; d.did = x.local ? '' : x.id;
  confirmFor = null; renderDrafts(); renderCompose();
  const ta = $('#chText'); if (ta) { ta.classList.remove('pulled'); void ta.offsetWidth; ta.classList.add('pulled'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  if (x.channel !== d.channel) C.toast('<b>Цей канал недоступний, чернетку взято в ' + esc(CH[d.channel] ? CH[d.channel].l : 'інший канал') + '.</b>', 4000);
}
async function delDraft(id, did) {
  const li = $(`#chDrafts [data-did="${CSS.escape(did)}"]`);
  if (li) { li.classList.add('out'); await new Promise(ok => setTimeout(ok, calm() ? 0 : 260)); }
  const t = chats[id] || {}, keep = (t.drafts || []).slice();
  dropDraft(id, did); if (cur && cur.id === id) renderCompose();
  try {
    if (C.demo) demoDraftSet(id, chats[id].drafts);
    else if (!/^dl/.test(did)) await C.call({ action: 'draft', op: 'del', id, did });
  } catch (e) { if (e.message !== 'not found') { chats[id].drafts = keep; syncDraftConv(id); if (cur && cur.id === id) renderDrafts(); C.toast('<b>Не вдалося видалити чернетку.</b>'); } }
}

/* ---------- надсилання (два натискання) ---------- */
function askSend() {
  if (!cur) return;
  const id = cur.id, d = drafts[id], ch = pickChannel(id);
  const text = String(d.text || '').trim();
  if (!text) { shake($('#chText')); return; }
  if (ch === 'email' && !String(d.subject || defaultSubject(id)).trim()) { shake($('#chSubject')); return; }
  if (confirmFor !== id) {
    confirmFor = id; renderCompose();
    clearTimeout(confirmT); confirmT = setTimeout(() => { if (confirmFor === id) { confirmFor = null; renderCompose(); } }, 6000);
    const b = $('#chSend'); b && b.focus();
    return;
  }
  confirmFor = null; clearTimeout(confirmT);
  doSend(id, ch, text, ch === 'email' ? String(d.subject || defaultSubject(id)).trim() : '', d.did || '');
}
async function doSend(id, ch, text, subject, did) {
  const t = chats[id]; if (!t) return;
  const m = { id: 'l' + Date.now().toString(36), local: true, channel: ch, mine: true, at: new Date().toISOString(), text, subject: subject || undefined, state: 'sending' };
  t.list = (t.list || []).concat(m);
  drafts[id] = { channel: ch, subject: '', text: '' };
  renderStream(false); renderCompose();
  try {
    if (C.demo) { await new Promise(ok => setTimeout(ok, 900)); const all = store.get('stackup-demo-chat-sent', {}); (all[id] = all[id] || []).push({ id: 'ds' + Date.now(), channel: ch, mine: true, at: m.at, text, subject: m.subject }); store.set('stackup-demo-chat-sent', all); }
    else await C.call({ action: 'chatSend', id, channel: ch, text, subject, confirm: true, draft: did || undefined });
    m.state = 'sent';
    if (did) { dropDraft(id, did); if (C.demo) demoDraftSet(id, t.drafts); }
    const c = inbox.convs[id] = inbox.convs[id] || { unread: 0, channels: [ch] }; c.last = { channel: ch, mine: true, text: subject || text, at: m.at };
  } catch (e) { m.state = 'failed'; m.error = e.message; m.did = did; }
  if (cur && cur.id === id) renderStream(false);
  if (m.state === 'sent') setTimeout(() => { if (cur && cur.id === id) loadChat(id, true); }, 2500);
}
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }

/* ---------- Claude ---------- */
const THINK = { analyze: ['Читаю бриф…', 'Переглядаю розмову…', 'Оцінюю, наскільки клієнт гарячий…', 'Рахую обсяг і вилку ціни…', 'Складаю наступні кроки…'] };
function aiReady() { if (C.demo || H.ai().connected) return true; C.toast('<span class="mono">CLAUDE</span> <b>Спершу додай ключ Claude API (див. Налаштування).</b>', 5000); return false; }
async function runAi(task) {
  if (!cur || !aiReady()) return;
  const id = cur.id, a = aiS[id] = aiS[id] || {};
  if (a.busy) return;
  const ch = task === 'analyze' ? '' : pickChannel(id);
  a.busy = task; a.t0 = Date.now();
  if (task === 'analyze') renderAi(); else { confirmFor = null; renderCompose(); }
  let res = null, err = null;
  try {
    res = C.demo ? await new Promise(ok => setTimeout(() => ok({ text: task === 'analyze' ? DEMO_AI.analyze : DEMO_AI[task][ch] || DEMO_AI[task].email }), 2200))
      : await C.call({ action: 'aiLead', id, task, channel: ch || 'email' });
  } catch (e) { err = e.message; }
  const wait = Math.max(0, 700 - (Date.now() - a.t0)); // анімація не блимає, навіть якщо відповідь миттєва
  await new Promise(ok => setTimeout(ok, wait));
  a.busy = false;
  if (err) {
    C.toast('<span class="mono">CLAUDE</span> <b>' + esc(err === 'ai not configured' ? 'Ключ Claude API ще не додано.' : err === 'ai busy' ? 'Claude зараз перевантажений. Спробуй за хвилину.' : err === 'unknown action' ? 'Онови Code.gs у Google Apps Script.' : 'Не вдалося отримати відповідь.') + '</b>', 5000);
    if (cur && cur.id === id) { task === 'analyze' ? renderAi() : renderCompose(); }
    return;
  }
  if (task === 'analyze') { a.analyze = res.text; a.reveal = true; if (cur && cur.id === id) renderAi(); return; }
  const d = drafts[id] = drafts[id] || {}; d.channel = ch;
  stashField(id);
  // чернетка Claude одразу зберігається в списку чернеток клієнта (на сервері — в аркуші «Чат»)
  const nd = res.draft || { id: 'dl' + Date.now().toString(36), channel: ch, subject: '', text: res.text, at: new Date().toISOString(), src: 'ai:' + task, local: !C.demo };
  addDraft(id, nd); d.did = nd.local ? '' : nd.id; d.subject = '';
  if (cur && cur.id === id) renderDrafts();
  if (!(cur && cur.id === id)) { d.text = res.text; return; }
  d.text = '';
  renderCompose();
  typeInto($('#chText'), res.text, v => { d.text = v; });
}
function typeInto(el, full, onChange) {
  if (!el) { onChange(full); return; }
  if (calm()) { el.value = full; onChange(full); autosize(el); el.focus(); return; }
  const dur = Math.min(1600, 300 + full.length * 6), t0 = performance.now();
  el.classList.add('typing');
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), n = Math.round(full.length * (1 - Math.pow(1 - k, 2)));
    el.value = full.slice(0, n); autosize(el);
    if (k < 1 && document.body.contains(el)) requestAnimationFrame(step);
    else { el.value = full; onChange(full); el.classList.remove('typing'); autosize(el); el.focus(); el.setSelectionRange(0, 0); el.scrollTop = 0; }
  };
  requestAnimationFrame(step);
}
let thinkT = null;
function renderAi() {
  const box = $('#dAi'); if (!box || !cur) return;
  const id = cur.id, a = aiS[id] || {};
  clearInterval(thinkT);
  const busy = a.busy === 'analyze';
  const paras = a.analyze ? String(a.analyze).split(/\n{2,}/) : [];
  box.innerHTML = `<h3><span class="mono">✱</span>Аналіз Claude</h3>
    ${busy ? `<div class="ai-think" role="status"><span class="ai-orb" aria-hidden="true"><i></i><i></i><i></i><b>✱</b></span><div><b class="ai-phrase" id="aiPhrase">${THINK.analyze[0]}</b><span class="sk-l w90"></span><span class="sk-l w70"></span><span class="sk-l w80"></span></div></div>`
      : paras.length ? `<div class="ai-out${a.reveal ? ' reveal' : ''}">${paras.map((p, i) => `<p style="--d:${i * 90}ms">${H.text(p)}</p>`).join('')}</div>`
      : '<p class="lead">Claude прочитає бриф, нотатки і всю розмову з клієнтом, оцінить, наскільки він гарячий, підкаже ціну і наступні кроки.</p>'}
    <div class="v-acts"><button type="button" class="button ghost sm ai-go" data-cai="analyze"${a.busy ? ' disabled' : ''}><b>${busy ? 'Аналізую…' : a.analyze ? 'Проаналізувати ще раз' : 'Проаналізувати заявку'}</b><span class="ai-spark">✱</span></button>
      ${a.analyze && !busy ? '<button type="button" class="button ghost sm" data-ctask-ai><b>Зробити кроки задачами</b><span>＋</span></button>' : ''}</div>
    ${!H.ai().connected && !C.demo ? '<p class="mono v-hint">ПОТРІБЕН КЛЮЧ CLAUDE API (НАЛАШТУВАННЯ)</p>' : ''}`;
  a.reveal = false;
  if (busy) { let k = 0; thinkT = setInterval(() => { const el = $('#aiPhrase'); if (!el || !(aiS[id] || {}).busy) { clearInterval(thinkT); return; } k = (k + 1) % THINK.analyze.length; el.classList.remove('swap'); void el.offsetWidth; el.textContent = THINK.analyze[k]; el.classList.add('swap'); }, 1700); }
}

/* ---------- задачі клієнта ---------- */
function renderTasks() {
  const box = $('#dTasks'); if (!box || !cur) return;
  const id = cur.id, PR = H.PRIO, all = H.tasks().filter(t => t.lead === id);
  const open = all.filter(t => t.status !== 'done').sort((a, b) => Object.keys(PR).indexOf(a.priority) - Object.keys(PR).indexOf(b.priority) || String(a.due || '9').localeCompare(String(b.due || '9')));
  const done = all.filter(t => t.status === 'done').slice(-3);
  const row = t => `<li class="ct${justAdded[t.id] ? ' pop' : ''}${t.status === 'done' ? ' done' : ''}"><button type="button" class="tk-check" data-ctdone="${esc(t.id)}" aria-pressed="${t.status === 'done'}" aria-label="Виконано">✓</button><span class="ct-b"><b>${esc(t.title)}</b><small class="mono"><span class="pill ${(PR[t.priority] || PR.normal)[1]}">${esc((PR[t.priority] || PR.normal)[0])}</span>${t.due ? ' · ДО ' + esc(fmt(t.due + 'T12:00:00', { day: 'numeric', month: 'short' }).toUpperCase()) : ''}</small></span></li>`;
  box.innerHTML = `<h3><span class="mono">☐</span>Задачі по клієнту</h3>
    ${open.length || done.length ? `<ul class="ct-list">${open.map(row).join('')}${done.map(row).join('')}</ul>` : '<p class="lead">Задач по цьому клієнту ще немає.</p>'}
    <form class="ct-add" id="ctAdd"><input type="text" id="ctTitle" maxlength="200" placeholder="Нова задача, наприклад «Надіслати КП»" aria-label="Нова задача">
      <select id="ctPrio" aria-label="Пріоритет">${Object.entries(PR).map(([k, [l]]) => `<option value="${k}"${k === 'high' ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input type="date" id="ctDue" value="${H.today()}" aria-label="Термін"><button type="submit" class="button primary sm"><b>Додати</b><span>＋</span></button></form>`;
  Object.keys(justAdded).forEach(k => delete justAdded[k]);
}
async function addTask(t) {
  const item = await H.saveTask(t);
  if (item) { justAdded[item.id] = 1; renderTasks(); }
  return item;
}

/* ---------- події ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const cv = t.closest('[data-chat]'); if (cv) { e.preventDefault(); e.stopPropagation(); $('#toast').hidden = true; C.open(cv.dataset.chat, 'chat'); return; }
  const cf = t.closest('[data-cfilter]'); if (cf) { filter = cf.dataset.cfilter; store.set('stackup-chat-filter', filter); render(); return; }
  if (t.closest('#chRefresh')) { inbox.loaded = inbox.loaded && true; loadInbox(); return; }
  const cc = t.closest('[data-ccopy]'); if (cc) { const u = cc.dataset.ccopy; navigator.clipboard && navigator.clipboard.writeText(u).then(() => C.toast('<span class="mono">СКОПІЙОВАНО</span> <b>' + esc(u) + '</b>')); return; }
  if (!t.closest('#detail')) return;
  const via = t.closest('[data-cvia]'); if (via && cur) { drafts[cur.id].channel = via.dataset.cvia; confirmFor = null; renderCompose(); const x = $('#chText'); x && x.focus(); return; }
  if (t.closest('#chSend')) { askSend(); return; }
  if (t.closest('[data-dtoggle]')) { draftsOpen = !draftsOpen; store.set('stackup-chat-drafts-open', draftsOpen); renderDrafts(); return; }
  const du = t.closest('[data-duse]'); if (du && cur) { useDraft(cur.id, du.dataset.duse); return; }
  const dd = t.closest('[data-ddel]'); if (dd && cur) { delDraft(cur.id, dd.dataset.ddel); return; }
  if (t.closest('[data-dsave]') && cur) { saveDraft(cur.id); return; }
  if (t.closest('[data-cno]')) { confirmFor = null; renderCompose(); return; }
  const ai = t.closest('[data-cai]'); if (ai) { runAi(ai.dataset.cai); return; }
  if (t.closest('[data-creload]') && cur) { loadChat(cur.id); return; }
  const mr = t.closest('[data-cmore]'); if (mr) { const p = mr.previousElementSibling; p && p.classList.remove('clamp'); mr.remove(); return; }
  const rt = t.closest('[data-cretry]'); if (rt && cur) { const c = chats[cur.id], m = c && c.list.find(x => x.id === rt.dataset.cretry); if (m) { c.list = c.list.filter(x => x !== m); drafts[cur.id] = { channel: m.channel, subject: m.subject || '', text: m.text, did: m.did || '' }; renderStream(true); renderCompose(); $('#chText') && $('#chText').focus(); } return; }
  const td = t.closest('[data-ctdone]'); if (td) { const x = H.tasks().find(k => k.id === td.dataset.ctdone); if (x) { td.closest('.ct').classList.add('ticking'); addTask({ ...x, status: x.status === 'done' ? 'open' : 'done' }); } return; }
  if (t.closest('[data-ctask-ai]') && cur) {
    const id = cur.id, text = (aiS[id] || {}).analyze || '';
    const block = text.split(/\*\*Наступні кроки\*\*/i)[1] || text;
    const steps = block.split('\n').map(s => s.replace(/^[•\-\d.\s]+/, '').trim()).filter(s => s.length > 4).slice(0, 4);
    if (!steps.length) { C.toast('<b>Не знайшла кроків у аналізі.</b>'); return; }
    (async () => { for (const s of steps) await addTask({ title: s.replace(/\*\*/g, '').slice(0, 200), priority: 'high', status: 'open', due: H.today(), lead: id, note: 'З аналізу Claude' }); C.toast('<span class="mono">ЗАДАЧІ</span> <b>Додано ' + steps.length + '.</b>'); })();
  }
}, true);
document.addEventListener('submit', e => {
  if (e.target.id !== 'ctAdd' || !cur) return;
  e.preventDefault();
  const title = $('#ctTitle').value.trim(); if (!title) { shake($('#ctTitle')); return; }
  addTask({ title, priority: $('#ctPrio').value, status: 'open', due: $('#ctDue').value, lead: cur.id, note: '' });
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'chSearch') { q = e.target.value; render(); return; }
  if (!cur) return;
  if (id === 'chText') { drafts[cur.id].text = e.target.value; autosize(e.target); if (confirmFor === cur.id) { confirmFor = null; renderCompose(); const x = $('#chText'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }
  if (id === 'chSubject') drafts[cur.id].subject = e.target.value;
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'chText' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); askSend(); }
});
document.addEventListener('stackup:detail', e => {
  const d = e.detail || {}, changed = !cur || cur.id !== d.id;
  cur = { id: d.id, row: d.row || {} };
  if (changed) confirmFor = null;
  drafts[d.id] = drafts[d.id] || { subject: '', text: '' };
  if (!chats[d.id]) loadChat(d.id); else { renderChat(); if (changed) loadChat(d.id, true); }
  renderAi(); renderTasks(); badgeDrawer();
});
document.addEventListener('stackup:dtab', e => {
  badgeDrawer();
  if (e.detail.tab === 'chat' && cur) { fitTalk(); const s = $('#chStream'); if (s) s.scrollTop = s.scrollHeight; if (inbox.convs[cur.id] && inbox.convs[cur.id].unread) loadChat(cur.id, true); }
  if (e.detail.tab === 'client') renderTasks();
});
function tickChat() { if (cur && C.current() === cur.id && paneOn() && !document.hidden) loadChat(cur.id, true); }
function start() { loadInbox(); clearInterval(inboxT); clearInterval(chatT); inboxT = setInterval(() => { if (!document.hidden) loadInbox(); }, C.demo ? 60000 : 30000); chatT = setInterval(tickChat, 12000); }
document.addEventListener('stackup:enter', start);
document.addEventListener('stackup:leads', () => { if (H.sec() === 'chats') render(); });
document.addEventListener('stackup:wipe', () => { clearInterval(inboxT); clearInterval(chatT); inbox = { convs: {}, channels: null, loaded: false, old: false, primed: false }; cur = null; [chats, drafts, aiS].forEach(o => Object.keys(o).forEach(k => delete o[k])); const b = $('#secChats'); if (b) b.innerHTML = ''; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) { loadInbox(); tickChat(); } });

window.StackupChat = { render, unread };
if (!$('#app').hidden) start();
})();
