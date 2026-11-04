const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const menu = $('.menu-toggle');
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); $('.header nav').classList.toggle('open', open); menu.textContent = open ? '×' : '☰'; });
$$('.header nav a').forEach(a => a.addEventListener('click', () => { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu'); $('.header nav').classList.remove('open'); menu.textContent = '☰'; }));

const scenes = [
 { label: '01 / FIND THE FOCUS', caption: 'Every great thing starts here.', html: `<div class="brief-art"><div class="art-meta"><span>STACKUP / DISCOVERY</span><span>01</span></div><h4>A little<br>clarity.<br><em>A big idea.</em></h4><div class="art-line"></div><div class="art-line short"></div><div class="art-checks"><span>Your goals</span><span>Your people</span><span>Our direction</span></div><div class="art-sticker">✳</div></div>` },
 { label: '02 / GIVE IT CHARACTER', caption: 'A little structure. A lot of possibility.', html: `<div class="design-art"><div class="art-browser-bar"><span>● ● ●</span><span>DESIGN / EXPLORATION</span></div><div class="design-body"><div><div class="art-meta">YOUR NEXT CHAPTER</div><h4>Build<br>what’s<br>next.</h4><div class="art-line"></div><div class="art-line short"></div><div style="background:var(--acid);width:45px;height:12px;margin-top:15px"></div></div><div class="mini-visual">✳</div><div class="design-swatch"><i></i><i></i><i></i></div></div></div>` },
 { label: '03 / BRING IT TO LIFE', caption: 'Where the idea becomes real.', html: `<div class="develop-art"><div class="art-browser-bar"><span>● ● ●</span><span>BUILD / IN PROGRESS</span></div><pre><em>&lt;YourNextChapter</em>\n  design=<b>"considered"</b>\n  experience=<b>"seamless"</b>\n  responsive=<b>{true}</b>\n<em>/&gt;</em>\n\n<span style="color:#7e8971">// Good things take shape.</span></pre><div class="develop-bottom">✓ COMPILED WITH CARE <span style="float:right">100%</span></div></div>` },
 { label: '04 / OUT INTO THE WORLD', caption: 'This is just the beginning. ↗', html: `<div class="launch-art"><div class="art-meta"><span>STACKUP / DEPLOY</span><span>04</span></div><div class="launch-icon">↗</div><h4>Hello,<br><span class="serif">world.</span></h4><p>From a spark to something real.</p><div class="launch-url">● YOUR NEXT CHAPTER IS LIVE</div></div>` }
];
let activeStep = 0, sceneTimer;
function renderStep(index, animate = true) {
 activeStep = index;
 $$('.step').forEach((el,i) => { el.classList.toggle('active', i === index); el.setAttribute('aria-expanded', String(i === index)); el.querySelector('.step-indicator').textContent = i === index ? '−' : '+'; });
 const scene = scenes[index], content = $('.scene-content');
 clearTimeout(sceneTimer);
 const update = () => { $('.process-scene').dataset.scene = String(index); $('.chip-one').textContent = ['THE BIG IDEA', 'MAKE IT MATTER', 'BUILDING…', 'WE ARE LIVE'][index]; $('.chip-two').textContent = ['CONNECT THE DOTS', 'DESIGN IN MOTION', 'PIXELS → PRODUCT', 'HELLO, WORLD'][index]; content.innerHTML = scene.html; $('.scene-label').textContent = scene.label; $('.scene-caption').textContent = scene.caption; content.classList.remove('changing'); };
 if(animate && !reduced) { content.classList.add('changing'); sceneTimer = setTimeout(update,180); } else update();
}
$$('.step').forEach((step,index) => { step.addEventListener('click',()=>selectStep(index)); step.addEventListener('keydown',e=>{ if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault(); const next = e.key==='Home'?0:e.key==='End'?3:(index+(e.key==='ArrowDown'?1:3))%4; $$('.step')[next].focus();selectStep(next); }}); });
renderStep(0,false);

const projects = {
 reelly:{name:'Reelly',category:'REAL ESTATE PLATFORM',img:'assets/work-reelly.webp',url:'https://reelly.io/',description:'An AI ecosystem for real estate sellers in the UAE: the largest broker community in the GCC, off-plan projects and a mobile property search, all in one clear, confident entry point.'},
 trustmont:{name:'Trustmont Capital',category:'WEBINAR LANDING',img:'assets/work-trustmont.webp',url:'https://lana234555.github.io/trustmont-webinar/',description:'A landing page for the Trustmont Capital × Wyndham Hotels & Resorts webinar on hotel real estate. An editorial dark look, a ticket-style hero and a short registration flow that turns interest into signed-up investors.'},
 lina:{name:'Lina’s Studio',category:'MUSIC STUDIO WEBSITE',img:'assets/work-lina.webp',url:'https://linasmusicgroup.org/',description:'A website for a music studio in Warsaw: vocal, guitar and piano lessons, live concerts and a creative community. Concert photography sets the mood, and a trial lesson is one tap away, in several languages.'},
 agency:{name:'Reelly Ambassadors',category:'REFERRAL PLATFORM',img:'assets/work-reelly-agency.webp',url:'https://reelly.io/agency-leaders',description:'A landing page for Reelly’s referral programme: partners bring investors to UAE real estate and follow every deal to payout. A clean white layout with a line-drawn Dubai skyline, a six-step process and a tour of the ambassador cabinet.'},
 money24:{name:'Money24 Estate',category:'INVESTMENT REAL ESTATE',img:'assets/work-money24.webp',url:'https://money24-estate.webflow.io/',description:'A website for an agency that invests in property abroad. A dark, confident layout, a bold orange promise of returns and a lead form that puts the client in touch with a manager in one step.'},
 blissful:{name:'Blissful Birthing',category:'ONLINE COURSE PLATFORM',img:'assets/work-blissful.webp',url:'https://courses.blissfulbirthing.com/',description:'A course platform for expectant mothers. Warm photography, golden script typography and a calm sales page that turns a sensitive topic into an invitation.'}
};
const dialog = $('.project-dialog');
$$('[data-project]').forEach(btn=>btn.addEventListener('click',()=>{const key = btn.dataset.project, p=projects[key];$('.dialog-body').innerHTML=`<span class="mono">SELECTED WORK / ${p.category}</span><h2>${p.name}<span class="serif">.</span></h2><img src="${p.img}" alt="${p.name} website"><div class="dialog-bottom"><p>${p.description}</p><a href="#contact" class="dialog-contact">Let’s build something like this ↗</a></div>${p.url?`<a class="dialog-note" href="${p.url}" target="_blank" rel="noopener">Visit the live site ↗</a>`:''}`; dialog.showModal();$('.dialog-contact').addEventListener('click',()=>dialog.close());}));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{ if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();} });
$$('[data-service]').forEach(link=>link.addEventListener('click',()=>{const n=$('.contact-form input[name="name"]');if(n)setTimeout(()=>n.focus({preventScroll:true}),900);}));
$('.contact-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.currentTarget);const subject=`A new spark — ${data.get('name')}`;const body=`Hi STACKUP,\n\nName: ${data.get('name')}\nEmail: ${data.get('email')}\nPhone: ${data.get('phone')}\n\nI’d love to talk about a new project.`;window.location.href=`mailto:hello@stackup.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;$('.form-status').textContent='Your email draft is ready to open in your mail app. Review it and press send there. The address should be confirmed before launch.';});

const observer = new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');observer.unobserve(e.target);}}),{threshold:.12});
$$('.section-heading,.why-intro,.benefits article,.process-layout,.contact-intro,.contact-form').forEach(el=>{el.classList.add('reveal');observer.observe(el);});observer.observe($('footer'));observer.observe($('.why'));


// Native scrolling drives the scenes. No wheel interception or scroll locking.
function clamp(n,a=0,b=1){return Math.min(b,Math.max(a,n));}
function smooth(n){const t=clamp(n);return t*t*(3-2*t);}
const liteFx=matchMedia('(max-width:700px)').matches;
const diveTrack=$('.dive-track'), hero=$('.dive-pin .hero'), depth=$('.dive-depth'), manifesto=$('.manifesto');
const arrival=$('.work-arrival'), cloud=$('.cloud-field'), workHeading=$('.work-arrival .section-heading');
const processTrack=$('.process-track'), wayfinder=$('.wayfinder');
const lines=$$('.word-line');
function wrapWords(node){
 [...node.childNodes].forEach(child=>{
  if(child.nodeType===Node.TEXT_NODE){const frag=document.createDocumentFragment();child.textContent.split(/(\s+)/).forEach(part=>{if(!part)return;if(/^\s+$/.test(part)){frag.append(document.createTextNode(part));}else{const word=document.createElement('span');word.className='word';word.textContent=part;word.setAttribute('aria-hidden','true');frag.append(word);}});child.replaceWith(frag);}
  else if(child.nodeType===Node.ELEMENT_NODE)wrapWords(child);
 });
}
lines.forEach(wrapWords);
const words=$$('.reveal-words .word');
let metrics={},ticking=false,resizeTimer;
function measure(){
 const top=el=>el.getBoundingClientRect().top+window.scrollY;
 metrics={diveTop:top(diveTrack),diveRange:diveTrack.offsetHeight-innerHeight,arrivalTop:top(arrival),arrivalRange:arrival.offsetHeight-innerHeight,processTop:top(processTrack)};
 updateScroll();
}
function selectStep(index){
 renderStep(index);
 resetPlayback(9000);
}
function updateScroll(){
 const sy=window.scrollY,vh=window.innerHeight,max=document.documentElement.scrollHeight-vh;
 $('.scroll-progress').style.width=`${max?sy/max*100:0}%`;
 if(!reduced){
  const d=clamp((sy-metrics.diveTop)/Math.max(1,metrics.diveRange));
  const sink=smooth((d-.025)/.39), entry=smooth((d-.31)/.17);
  hero.style.transform=`translate3d(0,${-sink*vh*.12}px,0) scale(${1-sink*.16})`;
  hero.style.filter=liteFx?'none':`blur(${sink*15}px)`;
  hero.style.opacity=1-smooth((d-.16)/.25);
  hero.style.pointerEvents=d>.31?'none':'';
  hero.inert=d>.39;
  depth.style.opacity=smooth((d-.015)/.39);
  depth.style.setProperty('--depth-scale',.1+sink*1.5);
  depth.style.setProperty('--depth-cloud',Math.sin(sink*Math.PI));
  manifesto.style.opacity=entry;
  manifesto.style.transform=`translate3d(0,${(1-entry)*vh*.07}px,0) scale(${1.08-entry*.08})`;
  manifesto.style.filter=liteFx?'none':`blur(${(1-entry)*10}px)`;
  manifesto.inert=d<.32;
  const reveal=clamp((d-.43)/.45);
  words.forEach((word,i)=>{const lit=smooth((reveal*(words.length+1)-i)/2);const c=[71,76,64].map((v,j)=>Math.round(v+((word.closest('em')?[206,255,49]:[249,250,244])[j]-v)*lit));word.style.color=`rgb(${c.join(',')})`;});
  const a=clamp((sy-metrics.arrivalTop)/Math.max(1,metrics.arrivalRange));
  const approach=clamp((sy+vh-metrics.arrivalTop)/(vh+Math.max(1,metrics.arrivalRange)));
  const immersion = clamp((sy-(metrics.arrivalTop-vh*.9))/(vh*.9+Math.max(1,metrics.arrivalRange)));
  cloud.style.opacity=Math.sin(smooth(immersion)*Math.PI)*.96;
  cloud.style.visibility=immersion>0&&immersion<1?'visible':'hidden';
  const ground = smooth(immersion);
  $('main').style.setProperty('--work-ground', `rgb(${Math.round(246-12*ground)},${Math.round(246-10*ground)},${Math.round(240-13*ground)})`);
  const flow=smooth(immersion); 
  const layers=cloud.children;
  layers[0].style.transform=`translate3d(${-flow*75}%,${-flow*20}%,0) scale(${1+flow*.5})`;
  layers[1].style.transform=`translate3d(${flow*75}%,${-flow*35}%,0) scale(${1+flow*.7})`;
  layers[2].style.transform=`translate3d(0,${flow*85}%,0) scale(${1+flow*.6})`;
  const clear=smooth((sy+vh-metrics.arrivalTop-vh*.15)/(vh*.5));
  workHeading.style.opacity=.2+clear*.8;
  workHeading.style.filter=`blur(${(1-clear)*12}px)`;
  workHeading.style.transform=`translate3d(0,${(1-clear)*40}px,0) scale(${.88+clear*.12})`;
  const phase=sy/(vh*1.8), y=Math.sin(phase)*vh*.18;
  wayfinder.style.transform=`translate3d(${-Math.sin(phase*.7)*6}px,${y}px,0) rotate(${Math.sin(phase)*13}deg)`;
  wayfinder.style.opacity=sy<metrics.diveRange?.28+entry*.6:.75;
 }
 ticking=false;
}
window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(updateScroll);}},{passive:true});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(measure,120);});
window.addEventListener('load',measure);document.fonts.ready.then(measure);measure();
$('a[href="#manifesto"]').addEventListener('click',e=>{if(!reduced){e.preventDefault();window.scrollTo({top:metrics.diveTop+metrics.diveRange*.47,behavior:'smooth'});}});
$$('.service-card').forEach(card=>{
 card.addEventListener('pointermove',e=>{if(reduced||e.pointerType==='touch')return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;card.style.setProperty('--mx',`${x*100}%`);card.style.setProperty('--my',`${y*100}%`);card.style.setProperty('--rx',`${(y-.5)*-8}deg`);card.style.setProperty('--ry',`${(x-.5)*9}deg`);});
 card.addEventListener('pointerleave',()=>{card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');});
});
function chooseMotion(value){document.body.dataset.motion=value;$$('[data-motion]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.motion===value)));try{localStorage.setItem('stackup-motion',value);}catch{}}
$$('[data-motion]').forEach(button=>button.addEventListener('click',()=>chooseMotion(button.dataset.motion)));
try{chooseMotion(localStorage.getItem('stackup-motion')==='orbit'?'orbit':'spark');}catch{chooseMotion('spark');}
// Pause the decorative loops when the Process scene is outside the viewport.
new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('motion-visible',entry.isIntersecting)),{threshold:.05}).observe($('.process-scene'));

// Process advances on a clock; scrolling always moves normally past this section.
let playbackVisible=false, playbackPaused=reduced, playbackElapsed=0, playbackDuration=6000, playbackFrame=0, lastPlaybackTime=0;
const playButton=$('.process-autoplay');
function updatePlaybackUI(){
 const label=playbackPaused?'Play automatic process slides':'Pause automatic process slides';
 if(playButton.getAttribute('aria-label')!==label||!playButton.dataset.ready){
  playButton.setAttribute('aria-pressed',String(playbackPaused));playButton.setAttribute('aria-label',label);
  playButton.innerHTML=playbackPaused?'▶ <span>PLAY SEQUENCE</span>':'Ⅱ <span>AUTO PLAY</span>';playButton.dataset.ready='true';
 }
 const count=`0${activeStep+1} / 04`;if($('.process-count').textContent!==count)$('.process-count').textContent=count;
 $('.process-progress i').style.width=`${playbackElapsed/playbackDuration*100}%`;
 $$('.step').forEach((el,i)=>el.style.setProperty('--step-progress',i===activeStep?`${playbackElapsed/playbackDuration*100}%`:'0%'));
}
function resetPlayback(duration=6000){playbackElapsed=0;playbackDuration=duration;lastPlaybackTime=0;updatePlaybackUI();}
function playbackTick(time){
 playbackFrame=0;
 if(!playbackVisible||playbackPaused||document.hidden){lastPlaybackTime=0;return;}
 if(lastPlaybackTime)playbackElapsed+=Math.min(200,time-lastPlaybackTime);
 lastPlaybackTime=time;
 if(playbackElapsed>=playbackDuration){renderStep((activeStep+1)%4);resetPlayback();}
 updatePlaybackUI();playbackFrame=requestAnimationFrame(playbackTick);
}
function startPlayback(){if(!playbackFrame&&playbackVisible&&!playbackPaused&&!document.hidden)playbackFrame=requestAnimationFrame(playbackTick);}
playButton.addEventListener('click',()=>{playbackPaused=!playbackPaused;lastPlaybackTime=0;updatePlaybackUI();startPlayback();});
new IntersectionObserver(entries=>{playbackVisible=entries[0].isIntersecting;lastPlaybackTime=0;startPlayback();},{threshold:.2}).observe($('.process-scene'));
document.addEventListener('visibilitychange',()=>{lastPlaybackTime=0;startPlayback();});
updatePlaybackUI();

// Small editorial marks belong to the page, rather than to a fixed overlay.
const accentSets=[
 ['.services',[[3,13,'star'],[95,33,'cross'],[4,78,'dots']]],
 ['.why',[[52,9,'star'],[96,87,'cross']]],
 ['.work',[[4,9,'star'],[96,33,'dots'],[3,65,'cross'],[95,91,'star']]],
 ['.process',[[95,11,'star'],[3,83,'cross']]],
 ['.contact',[[47,13,'star'],[4,84,'dots'],[95,69,'cross']]],
 ['footer',[[49,15,'star'],[6,61,'cross']]]
];
accentSets.forEach(([selector,marks])=>{const container=document.createElement('div');container.className='ambient-marks';container.setAttribute('aria-hidden','true');marks.forEach(([x,y,kind],i)=>{const mark=document.createElement('span');mark.className=`ambient-mark mark-${kind}`;mark.style.left=x+'%';mark.style.top=y+'%';mark.style.setProperty('--delay',(-i*2.3)+'s');mark.innerHTML=kind==='star'?'<svg viewBox="0 0 40 40"><path d="M20 0Q22 18 40 20Q22 22 20 40Q18 22 0 20Q18 18 20 0Z"/></svg>':kind==='cross'?'+':'···';container.append(mark);});$(selector).prepend(container);});
new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('marks-visible',e.isIntersecting)),{threshold:.05}).observe($('.services'));
$$('.ambient-marks').forEach(marks=>new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('marks-visible',e.isIntersecting)),{threshold:.01}).observe(marks));

// The system pointer stays visible; the lightweight halo is only for precise pointers.
if(matchMedia('(hover: hover) and (pointer: fine)').matches&&!reduced){
 const aura=$('.cursor-aura');let targetX=0,targetY=0,auraX=0,auraY=0,cursorFrame=0,cursorSeen=false;
 function cursorColor(){
  const hit=document.elementFromPoint(targetX,targetY);if(!hit)return;
  const dark=hit.closest('footer,.service-card.black,.bl-reelly,.bl-trustmont,.bl-agency,.code-card,.develop-art')||(scrollY<metrics.diveRange&&scrollY/metrics.diveRange>.3);
  let color=dark?'#f6f6f0':'#a6c82f';
  if(!dark){if(hit.closest('.services'))color='#a4bc40';else if(hit.closest('.why'))color='#aaa0cf';else if(hit.closest('.work'))color='#70a892';else if(hit.closest('.process'))color='#78a8c8';}
  aura.style.setProperty('--cursor-color',color);
  aura.classList.toggle('cursor-link',!!hit.closest('a,button,input,textarea,label'));
 }
 function cursorTick(){auraX+=(targetX-auraX)*.22;auraY+=(targetY-auraY)*.22;aura.style.transform=`translate3d(${auraX}px,${auraY}px,0)`;if(Math.abs(targetX-auraX)+Math.abs(targetY-auraY)>.15)cursorFrame=requestAnimationFrame(cursorTick);else cursorFrame=0;}
 document.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;targetX=e.clientX;targetY=e.clientY;if(!cursorSeen){auraX=targetX;auraY=targetY;cursorSeen=true;}aura.classList.add('cursor-visible');cursorColor();if(!cursorFrame)cursorFrame=requestAnimationFrame(cursorTick);},{passive:true});
 window.addEventListener('scroll',cursorColor,{passive:true});
 document.addEventListener('pointerdown',()=>aura.classList.add('cursor-down'));
 document.addEventListener('pointerup',()=>aura.classList.remove('cursor-down'));
 document.documentElement.addEventListener('pointerleave',()=>aura.classList.remove('cursor-visible'));
 window.addEventListener('blur',()=>aura.classList.remove('cursor-visible'));
}

// Keep the address clean on the home page: stackup.studio, without #section.
document.addEventListener('click',e=>{
 const a=e.target.closest('a[href^="#"]'); if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
 const id=a.getAttribute('href').slice(1), el=id?document.getElementById(id):null; if(!el)return;
 e.preventDefault();
 el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 if(location.hash)history.replaceState(null,'',location.pathname.replace(/index\.html$/,'')+location.search);
});
if(location.hash||/index\.html$/.test(location.pathname)){const h=location.hash.slice(1);history.replaceState(null,'',location.pathname.replace(/index\.html$/,'')+location.search);if(h){const el=document.getElementById(h);if(el)requestAnimationFrame(()=>el.scrollIntoView({block:'start'}));}}


// Project covers: on hover (or while in view on touch screens) flip through the extra screenshots.
$$('.project-image').forEach(btn=>{
 const imgs=[...btn.querySelectorAll('.shots img')]; if(imgs.length<2)return;
 const dots=document.createElement('span'); dots.className='shot-dots'; dots.setAttribute('aria-hidden','true');
 dots.innerHTML=imgs.map((_,i)=>'<i'+(i?'':' class="on"')+'></i>').join(''); btn.append(dots);
 let i=0,t=null;
 const show=n=>{i=n;imgs.forEach((im,k)=>im.classList.toggle('on',k===n&&k>0));[...dots.children].forEach((d,k)=>d.classList.toggle('on',k===n));};
 const start=()=>{if(t||matchMedia('(prefers-reduced-motion: reduce)').matches)return;btn.classList.add('playing');show((i+1)%imgs.length);t=setInterval(()=>show((i+1)%imgs.length),1500);};
 const stop=()=>{clearInterval(t);t=null;btn.classList.remove('playing');show(0);};
 btn.addEventListener('mouseenter',start);btn.addEventListener('mouseleave',stop);btn.addEventListener('focus',start);btn.addEventListener('blur',stop);
 if(matchMedia('(hover: none)').matches)new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.intersectionRatio>.6?start():stop()),{threshold:[0,.6]}).observe(btn);
});


// Selected work rail: arrows, counter, progress, mouse drag, and a slide-in when the section arrives.
(()=>{
 const rail=document.querySelector('.work-stack'); if(!rail)return;
 const cards=[...rail.querySelectorAll('.project')], prev=document.querySelector('.work-prev'), next=document.querySelector('.work-next');
 const count=document.querySelector('.work-count b'), bar=document.querySelector('.work-bar i');
 document.documentElement.classList.add('js-rail');
 cards.forEach((c,i)=>c.style.setProperty('--i',i));
 const step=()=>cards[1]?cards[1].offsetLeft-cards[0].offsetLeft:rail.clientWidth;
 const update=()=>{const max=rail.scrollWidth-rail.clientWidth, x=rail.scrollLeft;
  const i=Math.min(cards.length-1,Math.round(x/step())); count.textContent=String(i+1).padStart(2,'0');
  const vis=rail.clientWidth/rail.scrollWidth; bar.style.width=(vis*100)+'%'; bar.style.transform=`translateX(${max>0?(x/max)*(1/vis-1)*100:0}%)`;
  prev.disabled=x<=4; next.disabled=x>=max-4;};
 prev.addEventListener('click',()=>rail.scrollBy({left:-step(),behavior:'smooth'}));
 next.addEventListener('click',()=>rail.scrollBy({left:step(),behavior:'smooth'}));
 rail.addEventListener('scroll',update,{passive:true}); addEventListener('resize',update); update();
 // mouse drag (touch and trackpads scroll natively)
 let down=null,moved=false;
 rail.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button)return;down={x:e.clientX,l:rail.scrollLeft};moved=false;});
 addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down.x;if(!moved&&Math.abs(dx)>6){moved=true;rail.classList.add('dragging');}if(moved)rail.scrollLeft=down.l-dx;});
 addEventListener('pointerup',()=>{if(!down)return;down=null;if(moved){rail.classList.remove('dragging');const i=Math.round(rail.scrollLeft/step());rail.scrollTo({left:i*step(),behavior:'smooth'});}});
 rail.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
 rail.addEventListener('dragstart',e=>e.preventDefault());
 // keyboard
 rail.tabIndex=0; rail.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();next.click();}if(e.key==='ArrowLeft'){e.preventDefault();prev.click();}});
 // autoplay: one card every 3.5 s, loops; pauses while hovered, dragged, touched, focused or off-screen
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let hover=false,visible=false,touchUntil=0;
 rail.addEventListener('mouseenter',()=>hover=true); rail.addEventListener('mouseleave',()=>hover=false);
 rail.addEventListener('touchstart',()=>touchUntil=Date.now()+8000,{passive:true});
 rail.addEventListener('wheel',()=>touchUntil=Date.now()+6000,{passive:true});
 [prev,next].forEach(b=>b.addEventListener('click',()=>touchUntil=Date.now()+8000));
 if(!reduce)setInterval(()=>{if(hover||down||!visible||document.hidden||Date.now()<touchUntil||rail.contains(document.activeElement))return;
  const max=rail.scrollWidth-rail.clientWidth; rail.scrollTo({left:rail.scrollLeft>=max-4?0:rail.scrollLeft+step(),behavior:'smooth'});},3500);
 if('IntersectionObserver' in window)new IntersectionObserver(es=>es.forEach(en=>visible=en.isIntersecting&&en.intersectionRatio>.35),{threshold:[0,.35,.7]}).observe(rail);
 // slide-in on arrival
 if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){rail.classList.add('in');io.disconnect();}}),{threshold:.15});io.observe(rail);}else rail.classList.add('in');
})();


// Selected work blinds: hover or tap opens a strip; it cycles through its shots; strips advance on their own until the visitor takes over.
(()=>{
 const box=document.querySelector('.work-blinds'); if(!box)return;
 const strips=[...box.querySelectorAll('.bl')]; let on=0,hover=false,touched=0,seen=false,shotT=null;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 document.documentElement.classList.add('js-blinds'); strips.forEach((el,i)=>el.style.setProperty('--i',i));
 if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{if(es.some(en=>en.isIntersecting)){box.classList.add('in');io.disconnect();}},{threshold:.2});io.observe(box);}else box.classList.add('in');
 const SHOT=2400; let tick=null;
 const set=i=>{on=i;strips.forEach((el,j)=>el.classList.toggle('on',j===i));
  clearTimeout(tick);strips.forEach(el=>el.querySelectorAll('img').forEach(im=>im.classList.remove('cur')));
  const ims=[...strips[i].querySelectorAll('img')];let k=0;ims[0].classList.add('cur');
  const step=()=>{tick=setTimeout(()=>{
    if(k<ims.length-1&&!reduce){ims[k].classList.remove('cur');k++;ims[k].classList.add('cur');return step();}
    if(!hover&&!reduce&&seen&&Date.now()-touched>9000)return set((on+1)%strips.length);
    if(ims.length>1&&!reduce){ims[k].classList.remove('cur');k=0;ims[0].classList.add('cur');}
    step();},SHOT);};
  step();};
 box.addEventListener('mouseover',e=>{const el=e.target.closest('.bl');if(el&&matchMedia('(hover:hover)').matches){const i=strips.indexOf(el);if(i!==on)set(i);}});
 box.addEventListener('mouseenter',()=>hover=true);box.addEventListener('mouseleave',()=>hover=false);
 box.addEventListener('click',e=>{const el=e.target.closest('.bl');if(el&&!el.classList.contains('on')){e.preventDefault();touched=Date.now();set(strips.indexOf(el));}});
 if('IntersectionObserver' in window){new IntersectionObserver(es=>es.forEach(en=>seen=en.isIntersecting),{threshold:.3}).observe(box);}else seen=true;
 set(0);
})();
