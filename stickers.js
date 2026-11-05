/* Stackup stickers.
   Each sticker is slapped onto its section when it scrolls into view, drifts a little with the cursor,
   can be dragged around (mouse/trackpad) and flips when tapped or double clicked.
   d = desktop placement, m = mobile placement (≤560px); m:null hides it on mobile, d:null shows it on mobile only. */
(()=>{
const S='assets/stickers/';
const list=[
  // hero
  {host:'#hero-scene',src:'s5-00',rot:-8,depth:.9,d:{w:'96px',r:'16%',t:'54%'},m:{w:'52px',r:'7%',t:'56px'}},
  {host:'#hero-scene',src:'s2-21',rot:6,depth:.5,d:{w:'150px',r:'12%',b:'17%'},m:null},
  // 01 services
  {host:'#services',src:'s2-01',rot:-10,depth:.6,d:{w:'118px',l:'49%',t:'72px'},m:{w:'74px',r:'6%',t:'44px'}},
  // 02 why
  {host:'#why',src:'s3-00',rot:-6,depth:.8,d:{w:'92px',l:'25%',t:'520px'},m:null},
  {host:'#why',src:'s4-21',rot:5,depth:.4,d:{w:'168px',l:'8%',t:'640px'},m:{w:'124px',r:'5%',t:'50px'}},
  // 03 work
  {host:'.work-arrival-pin',src:'s4-13',rot:12,depth:.7,d:{w:'132px',l:'58%',t:'22%'},m:{w:'66px',r:'5%',t:'34px'}},
  {host:'.work-arrival-pin',src:'s2-12',rot:-7,depth:.5,d:{w:'150px',l:'47%',t:'58%'},m:null},
  {host:'.work-arrival-pin',src:'s2-10',rot:4,depth:.9,d:{w:'130px',l:'60%',t:'66%'},m:null},
  // 04 about
  {host:'#about',src:'s4-20',rot:-6,depth:.5,d:{w:'160px',r:'5%',t:'150px'},m:{w:'112px',r:'5%',t:'54px'}},
  {host:'#about',src:'s5-01',rot:8,depth:.8,d:{w:'104px',l:'40%',t:'120px'},m:null},
  // 05 process
  {host:'#process-panel',src:'s2-00',rot:-5,depth:.5,d:{w:'150px',l:'44%',t:'12%'},m:null},
  {host:'#process-panel',src:'s5-11',rot:9,depth:.8,d:{w:'110px',l:'38%',b:'15%'},m:{w:'76px',r:'4%',t:'48px'}},
  // 06 contact
  {host:'#contact',src:'s2-22',rot:-8,depth:.6,d:{w:'124px',r:'4%',t:'38px'},m:{w:'90px',r:'5%',t:'40px'}},
  {host:'#contact',src:'s5-23',rot:10,depth:.9,d:{w:'104px',l:'36%',b:'90px'},m:null},
  // footer
  {host:'footer',src:'s4-01',rot:-4,depth:.4,d:{w:'160px',r:'5%',t:'110px'},m:{w:'118px',r:'5%',t:'160px'}},
];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover: hover) and (pointer: fine)').matches;
const els=[];
list.forEach((s,i)=>{
  const host=document.querySelector(s.host);if(!host)return;
  const el=document.createElement('span');
  el.className='stk'+(s.m?'':' d-only')+(s.d?'':' m-only');
  el.setAttribute('aria-hidden','true');
  const d=s.d||s.m,m=s.m||{};
  const set=(k,v)=>v&&el.style.setProperty(k,v);
  set('--w',d.w);set('--l',d.l);set('--r',d.r);set('--t',d.t);set('--b',d.b);
  set('--mw',m.w);set('--ml',m.l);set('--mr',m.r);set('--mt',m.t);set('--mb',m.b);
  el.style.setProperty('--rot',s.rot+'deg');
  el.style.setProperty('--spin',(s.rot>0?22:-22)+'deg');
  el.style.setProperty('--peel',s.rot>0?'100% 0%':'0% 0%');
  el.style.setProperty('--src',`url(${S}${s.src}.webp)`);
  el.innerHTML=`<span class="stk-in"><img src="${S}${s.src}.webp" alt="" loading="lazy" decoding="async" draggable="false"></span>`;
  el._depth=s.depth||.5;
  host.appendChild(el);els.push(el);
});
if(reduced){els.forEach(el=>el.classList.add('ready'));return;}

// slap on when the sticker scrolls into view; stickers in the same section land one after another
const seen=new Map();
const io=new IntersectionObserver(entries=>entries.forEach(e=>{
  if(!e.isIntersecting)return;const el=e.target,host=el.parentElement;
  const n=seen.get(host)||0;seen.set(host,n+1);
  el.style.setProperty('--delay',(.15+n*.22)+'s');el.style.setProperty('--glint',(.75+n*.22)+'s');
  el.classList.add('slapped');
  el.querySelector('.stk-in').addEventListener('animationend',ev=>{if(ev.animationName==='stkSlap')el.classList.add('ready');});
  io.unobserve(el);
}),{threshold:.6});
els.forEach(el=>io.observe(el));

// flip on tap / double click
const flip=el=>{el.classList.remove('flip');void el.offsetWidth;el.classList.add('flip');};
els.forEach(el=>el.addEventListener('animationend',e=>{if(e.animationName==='stkFlip')el.classList.remove('flip');}));

if(!fine){els.forEach(el=>el.addEventListener('click',()=>flip(el)));return;}

// cursor parallax: each sticker drifts against the cursor by its depth
let mx=0,my=0,raf=0;
addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5;if(!raf)raf=requestAnimationFrame(()=>{raf=0;
  els.forEach(el=>{if(el.classList.contains('dragging'))return;el.style.setProperty('--px',(-mx*18*el._depth).toFixed(1)+'px');el.style.setProperty('--py',(-my*14*el._depth).toFixed(1)+'px');});});},{passive:true});

// drag: peel it off, move it, it tilts with the swing and lands with a new angle
els.forEach(el=>{
  let sx=0,sy=0,ox=0,oy=0,lx=0,moved=false;
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();el.setPointerCapture(e.pointerId);
    sx=e.clientX;sy=e.clientY;lx=e.clientX;ox=parseFloat(el.style.getPropertyValue('--dx'))||0;oy=parseFloat(el.style.getPropertyValue('--dy'))||0;moved=false;el.classList.add('dragging');});
  el.addEventListener('pointermove',e=>{if(!el.classList.contains('dragging'))return;
    const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
    el.style.setProperty('--dx',(ox+dx)+'px');el.style.setProperty('--dy',(oy+dy)+'px');
    const v=Math.max(-14,Math.min(14,(e.clientX-lx)*.9));lx=e.clientX;el.style.setProperty('--tilt',v+'deg');});
  const end=()=>{if(!el.classList.contains('dragging'))return;el.classList.remove('dragging');
    if(moved){const r=(parseFloat(el.style.getPropertyValue('--rot'))||0)+(parseFloat(el.style.getPropertyValue('--tilt'))||0)*.6;
      el.style.setProperty('--rot',Math.max(-18,Math.min(18,r)).toFixed(1)+'deg');el.classList.remove('land');void el.offsetWidth;el.classList.add('land');setTimeout(()=>el.classList.remove('land'),400);}
    el.style.setProperty('--tilt','0deg');};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('dblclick',()=>flip(el));
});
})();
