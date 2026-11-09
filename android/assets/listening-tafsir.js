'use strict';
let listeningTafsirSession=null;
function listeningTafsirInfo(key){
 const text=tafsirMuyassar[key];if(!text||!versePages[key]||+key.split(':')[0]!==surahState.chapter)return null;
 const [chapter,verse]=key.split(':').map(Number),range=tafsirSharedRange(key);
 return {text,reference:range.start===range.end?'الآية '+ar(verse):'الآيات '+ar(range.start)+'–'+ar(range.end),chapter};
}
function renderListeningTafsir(){
 const target=document.querySelector('[data-listening-verse]');if(!target)return;
 target.querySelector('.listening-tafsir')?.remove();const info=listeningTafsirInfo(surahDisplayKey());if(!info)return;
 const section=document.createElement('section');section.className='listening-tafsir';section.setAttribute('aria-label','التفسير الميسر');
 const hidden=localStorage.listenTafsirVisible==='0';
 section.innerHTML='<div class="listening-tafsir-heading"><span></span><button type="button" data-tafsir-visibility></button></div><p class="listening-tafsir-preview"></p><button type="button" class="listening-tafsir-more">عرض التفسير كاملًا</button>';
 section.querySelector('.listening-tafsir-heading span').textContent='التفسير الميسّر'+(info.reference.startsWith('الآيات')?' · '+info.reference:'');
 section.querySelector('.listening-tafsir-preview').textContent=info.text;
 section.classList.toggle('tafsir-collapsed',hidden);const toggle=section.querySelector('[data-tafsir-visibility]');toggle.textContent=hidden?'إظهار التفسير':'إخفاء';toggle.setAttribute('aria-expanded',String(!hidden));
 toggle.onclick=()=>{localStorage.listenTafsirVisible=localStorage.listenTafsirVisible==='0'?'1':'0';renderListeningTafsir()};
 section.querySelector('.listening-tafsir-more').onclick=()=>openListeningTafsir();target.append(section);
}
const listeningTafsirVerseUpdate=updateListeningVerse;
updateListeningVerse=function(){const before=document.querySelector('[data-listening-verse]')?.dataset.displayedKey;listeningTafsirVerseUpdate();const target=document.querySelector('[data-listening-verse]');if(target&&(before!==target.dataset.displayedKey||!target.querySelector('.listening-tafsir')))renderListeningTafsir()};
function fillListeningTafsir(session,key){
 if(activeSheet!=='listening-tafsir'||session.displayedKey===key)return;
 const info=listeningTafsirInfo(key),content=document.querySelector('.listening-tafsir-sheet #sheet-content');if(!info||!content)return;
 content.querySelector('.listening-tafsir-reference').textContent=info.reference;
 content.querySelector('.listening-tafsir-full').textContent=info.text;
 content.querySelector('.listening-tafsir-full').removeAttribute('aria-busy');session.displayedKey=key;
}
function finishListeningTafsir(){
 const session=listeningTafsirSession;if(!session)return;
 if(view!=='surah-listen'||surahState.reader!==session.reader||surahState.chapter!==session.chapter){listeningTafsirSession=null;if(activeSheet==='listening-tafsir')closeFeatureSheet();return;}
 if(['stopped','ended','error'].includes(surahState.status)){if(!session.closed)fillListeningTafsir(session,surahState.key||session.key);listeningTafsirSession=null;return;}
 if(surahState.status==='paused'&&!surahState.seeking){session.confirmed=true;if(!session.closed)fillListeningTafsir(session,surahState.key)}
 if(!session.closed)return;
 if(!session.resume){listeningTafsirSession=null;return;}
 if(document.hidden)return;
 if(surahState.status==='paused'&&session.confirmed){listeningTafsirSession=null;resumeFullSurah();}
 else if(session.confirmed){listeningTafsirSession=null;}
}
function openListeningTafsir(){
 if(view!=='surah-listen'||activeSheet==='listening-tafsir')return;
 syncNativeSurah();if(surahSeekPending()){showSmallNotice('انتظر اكتمال الانتقال إلى الآية ثم افتح التفسير');return}const key=surahState.key,info=listeningTafsirInfo(key);if(!info)return;
 const session={reader:surahState.reader,chapter:surahState.chapter,key,resume:['playing','loading'].includes(surahState.status),confirmed:surahState.status==='paused',closed:false};
 const content=featureSheet('التفسير الميسّر · سورة '+chapters[info.chapter-1].name_arabic,'listening-tafsir');
 listeningTafsirSession=session;content.closest('.feature-sheet').classList.add('listening-tafsir-sheet');
 content.innerHTML='<p class="listening-tafsir-reference"></p><div class="listening-tafsir-full"></div><p class="listening-tafsir-return-note"></p><button type="button" class="action primary listening-tafsir-return">العودة إلى الاستماع</button>';
 content.querySelector('.listening-tafsir-full').setAttribute('aria-busy',String(session.resume));
 content.querySelector('.listening-tafsir-full').textContent=session.resume?'جارٍ تثبيت موضع التلاوة…':'';
 if(session.confirmed)fillListeningTafsir(session,key);
 content.querySelector('.listening-tafsir-return-note').textContent=session.resume?'توقفت التلاوة مؤقتًا؛ تُستأنف من موضعها عند العودة.':'التلاوة متوقفة مؤقتًا؛ يمكنك تشغيلها متى أردت.';
 content.querySelector('.listening-tafsir-return').onclick=()=>closeFeatureSheet();
 if(session.resume||surahState.status==='paused')pauseForListeningTafsir();
}
// The pause acknowledgment can arrive after a quick close; resume once it arrives.
const listeningTafsirState=onFullSurahState;
onFullSurahState=function(state){listeningTafsirState(state);finishListeningTafsir()};window.onNativeSurah=onFullSurahState;
const listeningTafsirClose=closeFeatureSheet;
closeFeatureSheet=function(){const closing=activeSheet==='listening-tafsir';listeningTafsirClose();if(closing&&listeningTafsirSession){listeningTafsirSession.closed=true;finishListeningTafsir();document.querySelector('.full-surah-player')?.listenReveal?.()}};
const listeningTafsirEnter=enterSection;
enterSection=function(name,...args){if(name!=='surah-listen')listeningTafsirSession=null;return listeningTafsirEnter(name,...args)};
const pauseForListeningTafsir=pauseFullSurah;
pauseFullSurah=function(){if(listeningTafsirSession?.closed)listeningTafsirSession=null;return pauseForListeningTafsir()};
const listeningTafsirStop=stopFullSurah;
stopFullSurah=function(){listeningTafsirSession=null;return listeningTafsirStop()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const session=listeningTafsirSession;if(session&&!session.closed&&!session.confirmed&&['playing','loading'].includes(surahState.status))pauseForListeningTafsir();finishListeningTafsir()}});
