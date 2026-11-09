'use strict';
// A scrub previews metadata only. Existing showPage handlers own the single
// committed navigation, main reading anchor, khatma and smart-reader progress.
const readerPositionStates=new WeakMap(),readerPositionNames=new Map();let readerPositionActive=null;
function readerPageIdentity(number){const p=Math.max(1,Math.min(604,Math.round(+number||1))),locale=uiLocale(),key=locale+':'+p;if(readerPositionNames.has(key))return readerPositionNames.get(key);const ids=[...new Set(mushafPages[p].keys.map(k=>+k.split(':')[0]))],names=ids.map(id=>locale==='en'?chapters[id-1].name_simple:['ur','bn','tr'].includes(locale)?uiTranslate(chapters[id-1].name_arabic):chapters[id-1].name_arabic);const identity={page:p,name:(locale==='en'?(ids.length===1?'Surah ':'Surahs '):locale==='tr'?'':locale==='bn'?'সূরা ':locale==='ur'?(ids.length===1?'سورہ ':'سورتیں '):(ids.length===1?'سورة ':'سور '))+names.join(locale==='en'?' · ':'، '),pageText:locale==='tr'?'Sayfa '+p+' / 604':locale==='bn'?'পৃষ্ঠা '+new Intl.NumberFormat('bn',{useGrouping:false}).format(p)+' / ৬০৪':locale==='en'?'Page '+p+' of 604':locale==='ur'?'صفحہ '+p+' از 604':'صفحة '+ar(p)+' من '+ar(604)};readerPositionNames.set(key,identity);return identity;}
function readerPositionValid(s){return view==='reader'&&s.root.isConnected&&s.root===app.querySelector('.mushaf-reader')&&s.request===pageRequest;}
function readerPositionClamp(s,value){return Math.max(+s.range.min||1,Math.min(+s.range.max||604,Math.round(+value||pageNumber)));}
function readerPositionDisplay(s,number,preview){if(!readerPositionValid(s))return;const info=readerPageIdentity(number);s.caption.textContent=info.name;s.jump.value=String(info.page);s.range.setAttribute('aria-valuetext',info.pageText+'، '+info.name);if(preview){s.previewName.textContent=info.name;s.previewPage.textContent=info.pageText;const min=+s.range.min||1,max=+s.range.max||604,fraction=(info.page-min)/Math.max(1,max-min);s.wrapper.style.setProperty('--scrub-position',(1-Math.max(0,Math.min(1,fraction)))*100+'%');s.preview.hidden=false;}}
function readerPositionCancel(s=readerPositionActive,restore=true,suppress=false){if(!s)return;cancelAnimationFrame(s.frame);s.frame=0;s.active=false;s.pointer=false;s.preview.hidden=true;if(suppress)s.cancelUntil=performance.now()+250;if(readerPositionActive===s)readerPositionActive=null;if(restore&&readerPositionValid(s)){s.range.value=String(pageNumber);readerPositionDisplay(s,pageNumber,false);}}
function readerPositionPreview(s){if(!readerPositionValid(s)||performance.now()<s.cancelUntil)return;if(readerPositionActive&&readerPositionActive!==s)readerPositionCancel(readerPositionActive);s.active=true;readerPositionActive=s;s.pending=readerPositionClamp(s,s.range.value);if(s.frame)return;s.frame=requestAnimationFrame(()=>{s.frame=0;if(s.active&&readerPositionValid(s))readerPositionDisplay(s,s.pending,true);});}
function readerPositionCommit(s,e){if(!readerPositionValid(s))return;if(performance.now()<s.cancelUntil){readerPositionCancel(s,true);return}if(s.pointer){readerPositionPreview(s);return}const target=readerPositionClamp(s,s.range.value);readerPositionCancel(s,false);s.range.value=String(target);if(target===pageNumber){readerPositionDisplay(s,pageNumber,false);return}if(s.originalChange)s.originalChange.call(s.range,e);else showPage(target);}
function bindReaderPosition(){const root=app.querySelector('.mushaf-reader'),range=root?.querySelector('.reader-range'),jump=root?.querySelector('#page-jump');if(!root||!range||!jump||![...root.querySelectorAll(':scope>.page-leaf')].some(e=>+e.dataset.page===pageNumber))return;let s=readerPositionStates.get(range);if(s){if(!s.active){s.request=pageRequest;readerPositionDisplay(s,pageNumber,false)}return;}
 const label=jump.closest('label'),position=document.createElement('div'),caption=document.createElement('span');position.className='reader-page-position';caption.className='reader-page-surah';caption.id='reader-page-surah';caption.setAttribute('data-no-translate','');label.before(position);position.append(label,caption);jump.setAttribute('aria-describedby',caption.id);range.dir='rtl';
 const wrapper=document.createElement('div'),preview=document.createElement('div'),name=document.createElement('strong'),page=document.createElement('span');wrapper.className='reader-page-scrub';preview.className='reader-range-preview';preview.id='reader-range-preview';preview.hidden=true;preview.setAttribute('role','tooltip');preview.setAttribute('data-no-translate','');preview.append(name,page);range.before(wrapper);wrapper.append(range,preview);range.setAttribute('aria-describedby',caption.id+' '+preview.id);
 s={root,range,jump,caption,wrapper,preview,previewName:name,previewPage:page,request:pageRequest,frame:0,active:false,pointer:false,pending:pageNumber,cancelUntil:0,originalChange:range.onchange};readerPositionStates.set(range,s);readerPositionDisplay(s,pageNumber,false);
 range.addEventListener('pointerdown',()=>{s.cancelUntil=0;s.pointer=true;readerPositionPreview(s)});
 range.addEventListener('input',()=>readerPositionPreview(s));
 range.addEventListener('pointerup',e=>{s.pointer=false;queueMicrotask(()=>{if(s.active)readerPositionCommit(s,e)})});
 range.addEventListener('pointercancel',()=>readerPositionCancel(s,true,true));
 range.addEventListener('blur',()=>readerPositionCancel(s,true));
 range.addEventListener('keydown',e=>{if(e.key==='Escape'&&s.active){e.preventDefault();e.stopPropagation();readerPositionCancel(s,true,true)}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))s.cancelUntil=0;});
 range.onchange=e=>readerPositionCommit(s,e);
}
const readerPositionAugment=augmentReader;augmentReader=function(...args){const result=readerPositionAugment.apply(this,args);bindReaderPosition();return result;};
const readerPositionShow=showPage;showPage=async function(...args){readerPositionCancel();const result=await readerPositionShow.apply(this,args);if(view==='reader')bindReaderPosition();return result;};
const readerPositionLeave=leaveReading;leaveReading=function(...args){readerPositionCancel();return readerPositionLeave.apply(this,args);};
const readerPositionToggle=toggleControls;toggleControls=function(force){if(force===false||force===undefined&&controlsVisible)readerPositionCancel();return readerPositionToggle(force);};
const readerPositionBack=window.handleNativeBack;window.handleNativeBack=function(...args){if(readerPositionActive){readerPositionCancel(readerPositionActive,true,true);return true}return readerPositionBack.apply(this,args);};
document.addEventListener('pointerdown',e=>{const s=readerPositionActive;if(s&&!s.wrapper.contains(e.target))readerPositionCancel(s,true,true);},{capture:true,passive:true});
window.addEventListener('blur',()=>readerPositionCancel(undefined,true,true));window.addEventListener('resize',()=>readerPositionCancel(undefined,true,true),{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)readerPositionCancel(undefined,true,true);});document.addEventListener('mushafi-language-changed',()=>{readerPositionCancel();bindReaderPosition();});

// The chapter picker stays above the current reader; dismissal never navigates.
function openReaderSurahs(){
 window.AndroidReader?.beginReaderSurahSearch?.();readerPositionCancel();const origin=app.querySelector('.mushaf-reader'),en=uiLocale()==='en',content=featureSheet(en?'Choose a surah':'اختر سورة','reader-surahs');
 content.closest('.feature-sheet').classList.add('reader-surah-sheet');document.querySelector('.sheet-overlay')?.classList.add('reader-surah-overlay');
 content.innerHTML='<div class="reader-surah-search">'+uiIcon('search')+'<input type="search" autocomplete="off" aria-label="'+(en?'Search surahs':'البحث عن سورة')+'" placeholder="'+(en?'Search by name or number':'ابحث باسم السورة أو رقمها')+'"></div><div class="reader-surah-results"></div>';
 const input=content.querySelector('input'),results=content.querySelector('.reader-surah-results');
 const render=()=>{const q=norm(input.value.trim());const found=chapters.filter(c=>!q||norm(c.name_arabic).includes(q)||uiSurahSearch(c,q)||String(c.id)===q||ar(c.id)===q);results.innerHTML=found.length?found.map(c=>'<button type="button" data-reader-surah="'+c.id+'" class="reader-surah-choice '+(c.id===current?'selected':'')+'"><span class="reader-surah-number">'+(en?c.id:ar(c.id))+'</span><span><strong>'+esc(en?c.name_simple:c.name_arabic)+'</strong><small>'+(en?c.verses_count+' verses':ar(c.verses_count)+' آية')+'</small></span><small>'+(en?'Page ':'صفحة ')+(en?chapterPages[c.id]:ar(chapterPages[c.id]))+'</small></button>').join(''):'<p class="reader-surah-empty">'+(en?'No matching surahs':'لا توجد سورة مطابقة')+'</p>';};
 input.oninput=render;results.onclick=async e=>{const button=e.target.closest('[data-reader-surah]');if(!button||readerSurahSelecting||view!=='reader'||app.querySelector('.mushaf-reader')!==origin)return;const id=+button.dataset.readerSurah,p=chapterPages[id],ticket=++readerSurahSelectionTicket;readerSurahSelecting=true;content.setAttribute('aria-busy','true');try{await Promise.all(visiblePageNumbers(p).map(ensurePageFont));if(ticket!==readerSurahSelectionTicket||activeSheet!=='reader-surahs'||!origin.isConnected)return;readerSurahRendering=true;await showPage(p,id+':1');if(ticket!==readerSurahSelectionTicket)return;readerSurahRendering=false;readerSurahSelecting=false;closeFeatureSheet();}catch(error){readerSurahRendering=false;readerSurahSelecting=false;showSmallNotice(uiLocale()==='en'?'Could not load this surah. Try again.':'تعذر تجهيز السورة، حاول مرة أخرى');}finally{content.removeAttribute('aria-busy');if(ticket===readerSurahSelectionTicket)readerSurahSelecting=false;}};render();
}
function bindReaderSurahMenu(){if(view!=='reader'||surahReading||khatmaReading||smartReading)return;const top=app.querySelector('.reader-top'),menu=top?.querySelector('button');if(!menu)return;
 let group=top.querySelector('.reader-index-actions');if(!group){group=document.createElement('div');group.className='reader-index-actions';menu.before(group);group.append(menu);const exit=document.createElement('button');exit.type='button';exit.className='reader-exit';exit.innerHTML=uiIcon('close');exit.setAttribute('aria-label',uiLocale()==='en'?'Exit Quran reader':'الخروج من المصحف');exit.onclick=()=>{closeFeatureSheet();openQuran()};group.append(exit)}
 menu.onclick=openReaderSurahs;menu.setAttribute('aria-label',uiLocale()==='en'?'Surahs and search':'السور والبحث');menu.setAttribute('aria-haspopup','dialog');
}
const readerSurahAugment=augmentReader;augmentReader=function(...args){const result=readerSurahAugment.apply(this,args);bindReaderSurahMenu();return result;};
// One coordinator owns all reader layout refreshes. No independent resize timers.
let readerViewportTimer=0,readerViewportIme=false,readerViewportObserver,readerSurahSelecting=false,readerSurahRendering=false,readerSurahSelectionTicket=0;
function scheduleReaderViewport(){
 clearTimeout(readerViewportTimer);
 readerViewportTimer=setTimeout(()=>{
  if(view!=='reader'){window.readerSurahViewportRestoring=false;window.readerSurahNativePending=false;return;}
  if(activeSheet==='reader-surahs'||readerViewportIme||window.readerSurahNativePending)return;
  window.readerSurahViewportRestoring=false;
  const root=app.querySelector('.mushaf-reader');if(!root)return;
  if(root.classList.contains('spread')!==isSpreadView())showPage(pageNumber,undefined,{remember:false});else requestAnimationFrame(()=>{if(view==='reader'&&root.isConnected)fitPage()});
 },160);
}
function restoreReaderSurahViewport(){scheduleReaderViewport()}
const readerSurahCloseSheet=closeFeatureSheet;closeFeatureSheet=function(...args){
 if(readerSurahRendering&&activeSheet==='reader-surahs')return;
 const restore=activeSheet==='reader-surahs';if(restore){readerSurahSelectionTicket++;readerSurahSelecting=false;document.querySelector('.reader-surah-search input')?.blur();}
 const result=readerSurahCloseSheet.apply(this,args);
 if(restore){document.documentElement.style.removeProperty('--reader-ime-bottom');window.AndroidReader?.restoreReaderViewport?.();if(view==='reader'){window.scrollTo(0,0);app.querySelector('.reader-index-actions>button')?.focus({preventScroll:true});scheduleReaderViewport();}}
 return result;
};
window.onMushafiReaderInsets=(visible,pixels=0)=>{readerViewportIme=visible===true;document.documentElement.style.setProperty('--reader-ime-bottom',readerViewportIme?Math.max(0,pixels/(devicePixelRatio||1))+'px':'0px');if(!readerViewportIme)scheduleReaderViewport()};
window.onMushafiReaderViewportRestored=()=>{readerViewportIme=false;scheduleReaderViewport()};
window.visualViewport?.addEventListener('resize',scheduleReaderViewport,{passive:true});
const readerViewportAugment=augmentReader;augmentReader=function(...args){const result=readerViewportAugment.apply(this,args);const root=app.querySelector('.mushaf-reader');if(root&&!root.dataset.viewportObserved){root.dataset.viewportObserved='1';readerViewportObserver?.disconnect();readerViewportObserver=new ResizeObserver(scheduleReaderViewport);readerViewportObserver.observe(root);}return result;};
const readerViewportLeave=leaveReading;leaveReading=function(...args){clearTimeout(readerViewportTimer);readerSurahRendering=false;readerSurahSelecting=false;readerSurahSelectionTicket++;document.documentElement.style.removeProperty('--reader-ime-bottom');readerViewportObserver?.disconnect();readerViewportIme=false;window.readerSurahNativePending=false;window.readerSurahViewportRestoring=false;return readerViewportLeave.apply(this,args);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&activeSheet==='reader-surahs'){e.preventDefault();e.stopImmediatePropagation();closeFeatureSheet()}},true);
