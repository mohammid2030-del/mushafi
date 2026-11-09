'use strict';
// Background isolation is owned by accessibility.js, including nested dialogs.
let homeRecitationSession=null,homeRecitationReturn=false;
function openHomeRecitation(stage='readers'){
 if(homeRecitationSession){renderHomeRecitation(stage);return}
 const trigger=document.querySelector('.home-recitation-card'),root=document.createElement('div');root.className='home-recitation-overlay';
 root.innerHTML='<section class="home-recitation-dialog" role="dialog" aria-modal="true" aria-labelledby="home-recitation-title"><div class="home-recitation-heading"><button class="icon" data-home-audio-back aria-label="رجوع">'+uiIcon('arrow')+'</button><div><span class="overline">التلاوة الصوتية</span><h2 id="home-recitation-title">اختر القارئ</h2></div><button class="icon" data-home-audio-close aria-label="إغلاق">'+uiIcon('close')+'</button></div><div class="home-recitation-body"></div></section>';
 homeRecitationSession={root,trigger,scroll:scrollY,overflow:document.body.style.overflow,reader:surahCatalog[surahReader]?surahReader:7,chapter:1,stage};homeRecitationReturn=true;document.body.classList.add('home-recitation-open');document.body.style.overflow='hidden';document.body.append(root);
 root.querySelector('[data-home-audio-close]').onclick=()=>closeHomeRecitation();root.querySelector('[data-home-audio-back]').onclick=homeRecitationBack;root.onclick=e=>{if(e.target===root)closeHomeRecitation()};root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();homeRecitationBack()}if(e.key==='Tab'){const items=[...root.querySelectorAll('button,input')].filter(el=>el.getClientRects().length&&!el.disabled),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 renderHomeRecitation(stage);root.querySelector('[data-home-audio-close]').focus({preventScroll:true});
 surahReady.then(()=>{if(homeRecitationSession?.root===root&&homeRecitationSession.stage!=='player')renderHomeRecitation(homeRecitationSession.stage)});
}
function closeHomeRecitation(restoreFocus=true){const session=homeRecitationSession;if(!session)return;homeRecitationSession=null;session.root.remove();document.body.classList.remove('home-recitation-open');document.body.style.overflow=session.overflow;view='home';clearTimeout(listenIdleTimer);updateFullSurahUI();if(session.refreshPending)home();window.scrollTo(0,session.scroll);const focusTarget=session.trigger?.isConnected?session.trigger:document.querySelector('.home-recitation-card');if(restoreFocus)focusTarget?.focus({preventScroll:true})}
function homeRecitationBack(){const s=homeRecitationSession;if(!s)return;if(s.stage==='readers')closeHomeRecitation();else if(s.stage==='chapters')renderHomeRecitation('readers');else renderHomeRecitation('chapters')}
function renderHomeRecitation(stage='readers'){
 const s=homeRecitationSession;if(!s)return;s.stage=stage;const root=s.root,body=root.querySelector('.home-recitation-body'),title=root.querySelector('h2');root.classList.toggle('home-audio-player',stage==='player');root.querySelector('[data-home-audio-back]').hidden=stage==='readers';title.textContent=stage==='readers'?'اختر القارئ':stage==='chapters'?'اختر سورة':stage==='mode'?'سورة '+chapters[s.chapter-1].name_arabic:'الاستماع';body.scrollTop=0;
 if(stage!=='player'){view='home';updateFullSurahUI()}
 if(stage==='readers'){
 body.innerHTML='<p class="home-audio-intro">اختر القارئ، ثم السورة التي تحب سماعها</p><div class="home-audio-readers">'+audioReaderOrder.filter(id=>surahCatalog[id]).map(id=>`<button class="home-audio-reader ${id===s.reader?'selected':''}" data-home-reader="${id}">${recitationPortrait(id)}<strong>${esc(surahCatalog[id].name)}</strong><small>${esc(surahCatalog[id].style)}</small></button>`).join('')+'</div>';
 body.querySelectorAll('[data-home-reader]').forEach(b=>b.onclick=()=>{s.reader=+b.dataset.homeReader;surahReader=s.reader;localStorage.surahReader=s.reader;renderHomeRecitation('chapters')});
 }else if(stage==='chapters'){
 body.innerHTML=`<button class="home-audio-selected" data-home-change>${recitationPortrait(s.reader)}<strong>${esc(fullReaderName(s.reader))}</strong>${uiIcon('arrow')}</button><label class="search-field">${uiIcon('search')}<input type="search" aria-label="البحث في سور القارئ" placeholder="ابحث عن سورة…"></label><div class="home-audio-chapters"></div>`;
 body.querySelector('[data-home-change]').onclick=()=>renderHomeRecitation('readers');const input=body.querySelector('input'),list=body.querySelector('.home-audio-chapters');const fill=()=>{const q=norm(input.value.trim());list.innerHTML=chapters.filter(c=>norm(c.name_arabic).includes(q)||uiSurahSearch(c,q)||String(c.id)===q||ar(c.id)===q).map(c=>`<button class="surah-track-row" data-home-chapter="${c.id}"><span class="num">${ar(c.id)}</span><span><strong>سورة ${c.name_arabic}</strong><small>${ar(c.verses_count)} آية</small></span>${uiIcon('play')}</button>`).join('')||'<p class="empty">لا توجد سورة مطابقة</p>';list.querySelectorAll('[data-home-chapter]').forEach(b=>b.onclick=()=>{s.chapter=+b.dataset.homeChapter;renderHomeRecitation('mode')});uiLocalize(list)};input.oninput=fill;fill();
 }else if(stage==='mode'){
 body.innerHTML=`<div class="home-audio-mode-portrait">${recitationPortrait(s.reader)}<strong>${esc(fullReaderName(s.reader))}</strong></div><button class="surah-mode-card" data-home-listen>${uiIcon('headphones')}<span><strong>الاستماع فقط</strong><small>يستمر الصوت في الخلفية ومع قفل الشاشة</small></span>${uiIcon('arrow')}</button><button class="surah-mode-card" data-home-mushaf>${uiIcon('book')}<span><strong>الاستماع مع المصحف</strong><small>تحديد الآية المقروءة ومتابعة الصفحات تلقائيًا</small></span>${uiIcon('arrow')}</button>`;
 if(!surahHasVerseTimings(s.reader,s.chapter)){body.querySelector('[data-home-mushaf]').remove();body.insertAdjacentHTML('beforeend','<p class="small-note">تلاوة السور متاحة؛ متابعة الآيات لهذا القارئ غير متاحة حاليًا.</p>')}body.querySelector('[data-home-listen]').onclick=()=>startFullSurah(s.reader,s.chapter,'listen');if(body.querySelector('[data-home-mushaf]'))body.querySelector('[data-home-mushaf]').onclick=()=>{const r=s.reader,c=s.chapter;closeHomeRecitation(false);homeRecitationReturn=false;startFullSurah(r,c,'mushaf')};
 }else{
 view='surah-listen';surahReading=false;s.reader=surahState.reader;s.chapter=surahState.chapter;
 body.innerHTML=`<section class="full-surah-player"><div class="listen-heading"><h1>سورة ${fullSurahName()}</h1><p>${esc(fullReaderName())}</p></div><div class="full-surah-verse-stage"><div class="full-surah-verse-content" data-listening-verse></div></div><div class="listen-controls"><div class="full-surah-status" data-full-status></div>${fullSurahTransport()}<button class="full-open-mushaf" data-home-follow>${uiIcon('book')}المتابعة داخل المصحف</button><button class="home-audio-stop" data-home-stop>إنهاء الاستماع</button></div></section>`;
 body.querySelector('[data-home-follow]').onclick=()=>{closeHomeRecitation(false);homeRecitationReturn=false;openFullSurahMushaf()};body.querySelector('[data-home-stop]').onclick=()=>{stopFullSurah();renderHomeRecitation('chapters')};bindFullSurahTransport(body);updateFullSurahUI();
 }
 uiLocalize(root);
}
let homeRecitationFullscreen=null;
function returnHomeRecitation(){const origin=homeRecitationFullscreen;if(!origin)return;home();window.scrollTo(0,origin.scroll);openHomeRecitation('chapters')}
const homeAudioPlayerPrevious=fullSurahPlayerHome;fullSurahPlayerHome=function(){
 if(homeRecitationSession){homeRecitationFullscreen={scroll:homeRecitationSession.scroll};closeHomeRecitation(false);homeRecitationReturn=false}
 homeAudioPlayerPrevious();
 if(homeRecitationFullscreen){active('n-home');document.getElementById('listen-back').onclick=returnHomeRecitation;document.getElementById('full-player-stop').onclick=()=>{stopFullSurah();returnHomeRecitation()}}
};
const homeAudioIndexPrevious=surahIndex;surahIndex=function(...args){if(homeRecitationFullscreen){returnHomeRecitation();return}homeAudioIndexPrevious(...args)};
const homeAudioBackPrevious=handleBack;handleBack=function(){if(homeRecitationSession&&!activeSheet&&!reciterPicker){homeRecitationBack();return}if(homeRecitationFullscreen&&view==='surah-listen'&&!activeSheet&&!reciterPicker){returnHomeRecitation();return}homeAudioBackPrevious()};
const homeAudioEnterPrevious=enterSection;enterSection=function(...args){if(homeRecitationSession)closeHomeRecitation(false);homeRecitationReturn=false;if(!['home','surah-listen'].includes(args[0]))homeRecitationFullscreen=null;return homeAudioEnterPrevious(...args)};
// Android's gesture dispatcher must consume this overlay before the home exit rule.
const homeAudioNativeBackPrevious=window.handleNativeBack;
window.handleNativeBack=function(){if(homeRecitationSession&&!activeSheet&&!reciterPicker){homeRecitationBack();return true}return homeAudioNativeBackPrevious()};
// Applying account data must not navigate away from an active home chooser.
const homeAudioRefreshPrevious=home;
home=function(...args){if(homeRecitationSession&&cloudApplying){homeRecitationSession.refreshPending=true;return}return homeAudioRefreshPrevious(...args)};
