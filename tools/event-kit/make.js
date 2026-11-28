// Stackup event kit: turns a small JSON spec into ready Instagram stories / posts
// in the approved brand style (dark premium, pastel gradient, glass, Lana's stickers).
//
//   node tools/event-kit/make.js tools/event-kit/specs/black-friday-2026.json
//
// Writes content/ig/<id>/01.jpg … (+ t01.jpg … thumbnails) and prints the manifest entry.
// Spec format: see tools/event-kit/README.md.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = { ink: '#131412', paper: '#F4F4EC', peach: '#FDAA7E', lav: '#D0C6E8', sky: '#ACD2EB', mint: '#99DAAF', rose: '#F3B7B0', stone: '#E2E1D6' };
const GRAD = `linear-gradient(120deg,${C.peach} 0%,${C.rose} 30%,${C.lav} 55%,${C.sky} 100%)`;
const col = c => C[c] || c || C.peach;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// **word** → italic serif accent
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="ser">$1</span>').replace(/\n/g, '<br>');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&family=Literata:ital,opsz,wght@1,7..72,400&display=swap');
*{box-sizing:border-box;margin:0}
body{background:#fff}
.fr{position:relative;overflow:hidden;background:${C.ink};color:${C.paper};font-family:Montserrat,sans-serif}
.fr::after{content:"";position:absolute;inset:0;opacity:.16;mix-blend-mode:overlay;z-index:40;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>")}
.abs{position:absolute}
.blob{position:absolute;border-radius:50%}
.lines{position:absolute;inset:0;z-index:1;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 1.5px,transparent 1.5px 180px)}
.logo{position:absolute;left:0;right:0;text-align:center;z-index:30;font:800 30px Montserrat;letter-spacing:.02em}
.logo i{display:inline-block;width:.24em;height:.24em;background:currentColor;margin-left:.06em;font-style:normal}
.ey{font:700 22px Montserrat;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.h{font-weight:800;letter-spacing:-.035em;line-height:1}
.ser{font-family:'Newsreader','Literata',serif;font-style:italic;font-weight:400;letter-spacing:-.02em}
.b{font:500 36px/1.4 Montserrat}
.gls{position:relative;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.06));border:1.5px solid rgba(255,255,255,.35);backdrop-filter:blur(26px);border-radius:36px;box-shadow:0 30px 80px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.4)}
.ck{display:flex;gap:20px;align-items:center;padding:20px 0;border-bottom:1.5px solid rgba(255,255,255,.18);font:700 32px/1.25 Montserrat}
.ck:last-child{border-bottom:0}
.ck small{display:block;font:500 24px/1.35 Montserrat;opacity:.75;margin-top:4px}
.dot{width:46px;height:46px;border-radius:14px;color:${C.ink};font:800 24px/46px Montserrat;text-align:center;flex:none}
.btn{display:inline-flex;align-items:center;gap:22px;padding:30px 44px;border-radius:99px;background:${GRAD};color:${C.ink};font:800 40px Montserrat;box-shadow:0 0 120px rgba(253,170,126,.55)}
.pill{display:inline-block;padding:12px 26px;border-radius:99px;font:700 26px Montserrat;color:${C.ink}}
.big{display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:800;letter-spacing:-.06em}
.st{position:absolute;filter:drop-shadow(0 20px 40px rgba(0,0,0,.45))}
.cross{position:absolute;left:-4%;right:-4%;top:50%;height:12px;border-radius:6px;background:${C.peach};transform:rotate(-12deg);box-shadow:0 0 30px rgba(253,170,126,.8)}
`;

function bg(i, c1, c2, W, H) {
  const blob = (x, y, d, c, o, b) => `<div class="blob" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;background:${c};filter:blur(${b}px);opacity:${o}"></div>`;
  return blob(-300 + (i % 2) * 380, -260, 900, c1, .9, 150) + blob(480, H - 670 - (i % 3) * 120, 900, c2, .85, 150) + blob(620, H * .3, 520, C.lav, .35, 140) + '<div class="lines"></div>';
}

function frame(f, i, n, spec) {
  const story = spec.format !== 'post';
  const W = 1080, H = story ? 1920 : 1350;
  const top = story ? 300 : 150, pad = 72;
  const c1 = col(f.colors && f.colors[0] || ['peach', 'sky', 'lav', 'mint'][i % 4]), c2 = col(f.colors && f.colors[1] || ['lav', 'peach', 'sky', 'peach'][i % 4]);
  let body = '';
  if (f.eyebrow) body += `<div class="ey">◆ ${esc(f.eyebrow)}</div>`;
  if (f.h1 || f.h2) {
    const s = f.size || (story ? 116 : 100);
    body += `<div style="margin-top:22px">${f.h1 ? `<div class="h" style="font-size:${s}px">${rich(f.h1)}</div>` : ''}${f.h2 ? `<div class="ser" style="font-size:${Math.round(s * 1.05)}px;line-height:1.05;margin-top:6px">${esc(f.h2)}</div>` : ''}</div>`;
  }
  if (f.body) body += `<div class="b" style="margin-top:30px;max-width:${f.bodyWidth || 760}px;opacity:.88">${rich(f.body)}</div>`;
  if (f.big) {
    const d = f.big.size || 460;
    body += `<div style="margin:${story ? 70 : 40}px 0 0 ${f.big.x == null ? 230 : f.big.x}px;position:relative;width:${d + 140}px;height:${d + 140}px">
      <div class="abs" style="inset:0;border-radius:50%;border:2px solid rgba(255,255,255,.35)"></div>
      ${f.big.gradient ? `<div class="abs" style="inset:70px;border-radius:50%;background:${GRAD};box-shadow:0 0 160px rgba(253,170,126,.55)"></div>` : ''}
      <div class="gls big" style="position:absolute;inset:70px;font-size:${f.big.font || 200}px;${f.big.gradient ? `background:transparent;color:${C.ink};border:none;box-shadow:none;backdrop-filter:none` : ''}"><span style="position:relative">${esc(f.big.text)}${f.big.cross ? '<i class="cross"></i>' : ''}</span></div></div>`;
  }
  if (f.card) {
    const rows = (f.card.items || []).map((it, k) => {
      const [a, b] = Array.isArray(it) ? it : [it, ''];
      return `<div class="ck"><span class="dot" style="background:${col([C.peach, C.lav, C.sky, C.mint][k % 4])}">${f.card.check ? '✓' : k + 1}</span><span>${esc(a)}${b ? `<small>${esc(b)}</small>` : ''}</span></div>`;
    }).join('');
    body += `<div class="gls" style="margin-top:${story ? 60 : 40}px;width:${f.card.width || 840}px;padding:${f.card.title ? 34 : 14}px 44px 14px;transform:rotate(${f.card.rot == null ? -2 : f.card.rot}deg)">
      ${f.card.title ? `<div class="ey" style="opacity:.9">${esc(f.card.title)}</div>` : ''}${rows}</div>`;
  }
  if (f.button) body += `<div style="margin-top:${story ? 70 : 44}px"><span class="btn">${rich(f.button)}<span style="font-size:44px">→</span></span></div>`;
  if (f.note) body += `<div class="b" style="margin-top:28px;font-size:30px;opacity:.75">${rich(f.note)}</div>`;
  if (f.pill) body += `<div style="margin-top:34px"><span class="pill" style="background:${col(f.pill.color)}">${esc(f.pill.text)}</span></div>`;
  const st = (f.stickers || []).map(([p, x, y, w, r]) => {
    const [d, nn] = p.split('/');
    const file = path.join(__dirname, 'stickers', d, `sticker-${nn}.png`);
    return `<img class="st" src="file://${file}" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${r || 0}deg);z-index:${f.stickerZ || 12}">`;
  }).join('');
  const foot = story && spec.foot !== false
    ? `<div class="abs ey" style="left:${pad}px;top:1655px;z-index:30;display:flex;align-items:center;gap:14px"><span style="width:16px;height:16px;border-radius:50%;background:${c1};box-shadow:0 0 14px ${c1}"></span>${esc(spec.foot || spec.title)}</div><div class="abs ey" style="right:${pad}px;top:1655px;z-index:30">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</div>`
    : (!story ? `<div class="abs ey" style="left:${pad}px;top:${H - 96}px;z-index:30;font-size:18px">${esc(spec.footLeft || 'stackup.studio')}</div>${n > 1 ? `<div class="abs ey" style="right:${pad}px;top:${H - 96}px;z-index:30;font-size:18px">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</div>` : ''}` : '');
  return `<div class="fr" id="f${i}" style="width:${W}px;height:${H}px">${bg(i + (spec.seed || 0), c1, c2, W, H)}
    <div class="logo" style="top:${story ? 205 : 58}px">STACKUP<i></i></div>
    <div class="abs" style="left:${pad + (f.x || 0)}px;top:${top + (f.y || 0)}px;right:${pad}px;z-index:20">${body}</div>${st}${foot}</div>`;
}

(async () => {
  const specPath = process.argv[2];
  if (!specPath) { console.error('usage: node tools/event-kit/make.js <spec.json>'); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!/^[a-z0-9-]+$/.test(spec.id || '')) throw new Error('spec.id must be a-z 0-9 -');
  const out = path.join(ROOT, 'content', 'ig', spec.id);
  fs.mkdirSync(out, { recursive: true });
  const frames = spec.frames || [];
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${frames.map((f, i) => frame(f, i, frames.length, spec)).join('')}</body>`;
  const tmp = path.join(out, '_render.html');
  fs.writeFileSync(tmp, html);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined });
  const p = await b.newPage({ viewport: { width: 1200, height: 2000 }, ignoreHTTPSErrors: true });
  await p.goto('file://' + tmp);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  const media = [], thumbs = [];
  for (let i = 0; i < frames.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    const el = p.locator('#f' + i);
    await el.screenshot({ path: path.join(out, nn + '.jpg'), type: 'jpeg', quality: 92 });
    media.push(`ig/${spec.id}/${nn}.jpg`);
  }
  // thumbnails 360px wide
  const tp = await b.newPage({ viewport: { width: 400, height: 700 } });
  for (let i = 0; i < frames.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    const data = fs.readFileSync(path.join(out, nn + '.jpg')).toString('base64');
    await tp.setContent(`<body style="margin:0"><img id="i" src="data:image/jpeg;base64,${data}" style="width:360px;display:block"></body>`);
    await tp.locator('#i').screenshot({ path: path.join(out, 't' + nn + '.jpg'), type: 'jpeg', quality: 82 });
    thumbs.push(`ig/${spec.id}/t${nn}.jpg`);
  }
  await b.close();
  fs.unlinkSync(tmp);
  const entry = { id: spec.id, kind: spec.format === 'post' ? (frames.length > 1 ? 'carousel' : 'post') : 'stories', title: spec.title, media, thumbs, caption: spec.caption || '', note: spec.note || '', proposedAt: spec.proposedAt || '', series: spec.series || 'Свята і події', event: spec.event || '', created: new Date().toISOString().slice(0, 10) };
  console.log(JSON.stringify(entry, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
