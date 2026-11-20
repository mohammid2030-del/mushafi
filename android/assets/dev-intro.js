'use strict';
/* The first thing a new user sees: a short, quiet letter from the developer, then the welcome. */
const devIntroLines=['أهلًا بك في «مصحفي»','صنعته ليكون رفيقًا هادئًا لك مع كتاب الله؛ بلا إعلانات، ولا تتبّع، ولا اشتراكات.','وجعلته مجانيًا للجميع، صدقةً جاريةً بإذن الله.','أسأل الله أن ينفعك به، ولا تنسني من دعائك.'];
let devIntroTimers=[];
function diT(k){try{if(uiLocale()!=='ar'&&typeof uiDictionary!=='undefined'&&uiDictionary&&uiDictionary[k])return uiDictionary[k]}catch(e){}return k}
function devIntroDue(){if(localStorage.mushafiDevIntroSeen==='1'||localStorage.mushafiWelcomeCompleted==='1')return false;try{const d=JSON.parse(localStorage.mushafiWelcomeDraft||'null');if(d&&(d.step>0||(+d.introPage||0)>0))return false}catch(e){}return true}
function devIntroWords(text,start,gap){return diT(text).split(/\s+/).filter(Boolean).map((w,i)=>`<span class="di-w" style="--d:${(start+i*gap).toFixed(2)}s">${esc(w)}</span>`).join(' ')}
function devIntroMarkup(){
 let t=1.55;const lines=devIntroLines.map((line,i)=>{const n=diT(line).split(/\s+/).length,html=`<p class="di-line${i?'':' di-hello'}">${devIntroWords(line,t,i?.055:.11)}</p>`;t+=n*(i?.055:.11)+(i?.35:.45);return html}).join('');
 const sig=t+.1,cta=sig+1.5;
 return `<div class="dev-intro" role="dialog" aria-modal="true" aria-label="${esc(diT('رسالة من المطوّر'))}" data-no-translate style="--sig:${sig.toFixed(2)}s;--cta:${cta.toFixed(2)}s">
  <div class="di-glow" aria-hidden="true"></div><div class="di-pattern" aria-hidden="true"></div>
  <button type="button" class="di-skip">${esc(diT('تخطي'))}</button>
  <div class="di-stage">
   <div class="di-emblem" aria-hidden="true"><svg class="di-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56"/></svg>${mushafiBrandIcon()}</div>
   <span class="di-kicker">${esc(diT('رسالة من المطوّر'))}</span>
   <div class="di-letter" dir="${['ar','ur'].includes(uiLocale())?'rtl':'ltr'}">${lines}</div>
   <footer class="di-sig"><span class="di-av" aria-hidden="true">م</span><span class="di-sig-txt"><b>${esc(diT('محمد المغربي'))}</b><small>${esc(diT('مطوّر مصحفي'))}</small></span><span class="di-hand" aria-hidden="true">محمد</span></footer>
  </div>
  <button type="button" class="di-cta primary">${esc(diT('لنبدأ'))}${uiIcon('arrow')}</button>
 </div>`}
function devIntroShow(){
 const host=document.createElement('div');host.innerHTML=devIntroMarkup();const root=host.firstElementChild;document.body.append(root);
 const finish=()=>{if(root.classList.contains('leaving'))return;devIntroTimers.forEach(clearTimeout);localStorage.mushafiDevIntroSeen='1';root.classList.add('leaving');document.querySelector('.welcome-shell')?.classList.add('welcome-enter');try{window.AndroidReader?.haptic?.(0)}catch(e){}setTimeout(()=>{root.remove();document.querySelector('.welcome-shell')?.classList.remove('welcome-enter');document.querySelector('.welcome-shell h1')?.focus?.({preventScroll:true})},1300)};
 const reveal=()=>{root.classList.add('di-done')};
 root.querySelector('.di-cta').onclick=e=>{e.stopPropagation();finish()};
 root.querySelector('.di-skip').onclick=e=>{e.stopPropagation();finish()};
 // A tap while the letter is still being written completes it at once.
 root.addEventListener('click',()=>{if(!root.classList.contains('di-done'))reveal()});
 const cta=parseFloat(root.style.getPropertyValue('--cta'))||8;devIntroTimers=[setTimeout(reveal,(cta+.8)*1000)];
 requestAnimationFrame(()=>root.querySelector('.di-cta').focus({preventScroll:true}));
}
const devIntroStartWelcome=startWelcome;
startWelcome=function(...args){const due=devIntroDue();devIntroStartWelcome.apply(this,args);if(due&&!document.querySelector('.dev-intro'))try{devIntroShow()}catch(e){document.querySelector('.dev-intro')?.remove()}};
const devIntroBack=window.handleNativeBack;window.handleNativeBack=function(){const r=document.querySelector('.dev-intro:not(.leaving)');if(r){r.querySelector('.di-cta').click();return true}return devIntroBack?devIntroBack():false};
