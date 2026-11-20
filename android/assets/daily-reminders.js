'use strict';
let dailyReminderContent=null,dailyFridayTimer=0,dailyForeground=true,browserFridayPending='';
function dailyCivilDay(date){return Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000)}
function dailyDuaSlot(date=new Date()){return dailyCivilDay(date)*2+(date.getHours()<8?-1:date.getHours()<20?0:1)}
function dailyPoolItem(date=new Date()){const pool=dailyReminderContent?.pool;if(!pool?.length)return devotionById.worry;return pool[((dailyDuaSlot(date)%pool.length)+pool.length)%pool.length]}
function dailyFridayWindow(date=new Date()){const minutes=date.getHours()*60+date.getMinutes();return date.getDay()===5&&minutes>=450&&minutes<720}
function dailyDateKey(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
function dailyDuaHomeMarkup(){const item=dailyPoolItem();return `<button class="daily-dua-card" data-daily-id="${esc(item.id)}" onclick="openDailyDua()" aria-label="عرض الدعاء ومصدره"><p translate="no">${esc(item.text)}</p><span class="daily-reference">${esc(item.reference)} ${uiIcon('arrow')}</span></button>`}
function refreshDailyDua(){const card=document.querySelector('.daily-dua-card');if(card&&card.dataset.dailyId!==dailyPoolItem().id){card.outerHTML=dailyDuaHomeMarkup();uiLocalize(document.querySelector('.daily-dua-card'))}}
function dailySource(url){if(window.AndroidReader?.openSourceUrl)AndroidReader.openSourceUrl(url);else window.open(url,'_blank','noopener')}
function openDailyDua(id){const item=dailyReminderContent?.pool.find(x=>x.id===id)||dailyPoolItem();const root=featureSheet('دعاء ومصدره','daily-dua');root.innerHTML=`<article class="daily-prayer-detail"><h3>${esc(item.title)}</h3><p class="daily-prayer-text" translate="no" lang="ar" dir="rtl">${esc(item.text)}</p><p class="daily-prayer-source">${esc(item.reference)}</p><small>${esc(item.grade)}</small><button class="action" data-daily-source>عرض المصدر</button></article>`;root.querySelector('[data-daily-source]').onclick=()=>dailySource(item.url);uiLocalize(root)}
const fridayGuideTopics=[
 {id:'salawat',icon:'heart',title:'الصلاة على النبي ﷺ',sub:'تذكير بالإكثار من الصلاة والسلام عليه',items:[0]},
 {id:'adab',icon:'pillars',title:'آداب صلاة الجمعة',sub:'الاغتسال والتطيب والتبكير والإنصات',items:[2,3]},
 {id:'dua',icon:'duaHands',title:'الدعاء يوم الجمعة',sub:'تذكير بالدعاء وتحري ساعة الإجابة',items:[4]}
];
function fridayGuideHome(root){const g=dailyReminderContent.fridayGuide,kahf=g[1];root.innerHTML=`<div class="fg">
 <div class="fg-intro"><p>تذكير أسبوعي بسنن وآداب الجمعة</p><span class="fg-sun">${uiIcon('sun')}</span></div>
 <section class="fg-kahf"><div class="fg-kahf-head"><span class="fg-ic">${uiIcon('book')}</span><h3>سورة الكهف</h3></div><p>اجعل لك وقتًا لقراءة سورة الكهف يوم الجمعة.</p><button class="fg-cta" data-kahf><span>قراءة سورة الكهف</span>${uiIcon('arrow')}</button><button class="fg-src" data-friday-source="1">${esc(kahf.reference)}</button></section>
 ${fridayGuideTopics.map(t=>`<button class="fg-row" data-fg-topic="${t.id}"><span class="fg-ic">${uiIcon(t.icon)}</span><span class="fg-row-text"><strong>${t.title}</strong><small>${t.sub}</small></span><span class="fg-chev">${uiIcon('chevron')}</span></button>`).join('')}
 <p class="fg-note">الضغط على أي بطاقة يفتح الشرح والدليل الشرعي الخاص بها.</p></div>`;
 root.querySelector('[data-kahf]').onclick=()=>{closeFeatureSheet();showPage(versePages['18:1'],'18:1')};
 root.querySelectorAll('[data-fg-topic]').forEach(b=>b.onclick=()=>fridayGuideTopic(root,b.dataset.fgTopic));
 root.querySelectorAll('[data-friday-source]').forEach(b=>b.onclick=()=>dailySource(g[+b.dataset.fridaySource].url));
 uiLocalize(root)}
function fridayGuideTopic(root,id){const t=fridayGuideTopics.find(x=>x.id===id),g=dailyReminderContent.fridayGuide;if(!t)return;root.innerHTML=`<div class="fg">
 <button class="fg-back" data-fg-back>${uiIcon('back')}<span>جمعتك، ذكر وطمأنينة</span></button>
 <div class="fg-topic-head"><span class="fg-ic lg">${uiIcon(t.icon)}</span><h3>${t.title}</h3></div>
 ${t.items.map(i=>`<article class="fg-detail"><h4>${esc(g[i].title)}</h4><p>${esc(g[i].body)}</p><button class="fg-src" data-friday-source="${i}">${uiIcon('scroll')}<span>${esc(g[i].reference)}</span>${uiIcon('arrow')}</button></article>`).join('')}</div>`;
 root.querySelector('[data-fg-back]').onclick=()=>fridayGuideHome(root);
 root.querySelectorAll('[data-friday-source]').forEach(b=>b.onclick=()=>dailySource(g[+b.dataset.fridaySource].url));
 uiLocalize(root);root.closest('.feature-sheet')?.scrollTo?.(0,0)}
function showFridayGuide(force){if(!dailyReminderContent||(!force&&!dailyFridayWindow()))return;if(typeof iconPaths==='object'&&!iconPaths.chevron)iconPaths.chevron='<path d="m15 6-6 6 6 6"/>';const root=featureSheet('جمعتك، ذكر وطمأنينة','friday-guide');fridayGuideHome(root);clearTimeout(dailyFridayTimer);const end=new Date();end.setHours(12,0,0,0);if(!force)dailyFridayTimer=setTimeout(checkDailyFridayExpiry,Math.max(1,+end-Date.now()))}
function checkDailyFridayExpiry(){if(activeSheet==='friday-guide'&&!dailyFridayWindow())closeFeatureSheet()}
function dailyBrowserEnter(date=new Date()){if(!dailyFridayWindow(date))return;const day=dailyDateKey(date),stored=readJSON('dailyFridayVisits',{}),count=stored.day===day?(stored.count||0)+1:1;saveJSON('dailyFridayVisits',{day,count});browserFridayPending=(count-1)%3===0?day:''}
function maybeFridayGuide(){checkDailyFridayExpiry();if(document.hidden||!dailyReminderContent||view==='onboarding'||activeSheet||document.querySelector('.first-tour')||localStorage.mushafiFirstTourPending==='1'||(!window.AndroidReader?.consumeFridayReminder&&localStorage.dailyReminderConsent==='0'))return;if(!dailyFridayWindow())return;let show=false;if(window.AndroidReader?.consumeFridayReminder)show=AndroidReader.consumeFridayReminder();else if(browserFridayPending===dailyDateKey()){show=true;browserFridayPending=''}if(show)showFridayGuide()}
window.openDailyReminderFromNotification=async function(){if(view==='onboarding'||localStorage.mushafiFirstTourPending==='1')return;await dailyReminderReady;const data=JSON.parse(window.AndroidReader?.consumeDailyReminderOpen?.()||'{}');if(!data.kind)return;closeFeatureSheet();if(data.kind==='dua'||data.kind==='fridayDua')openDailyDua(data.id);else if(data.kind==='salawat'){const root=featureSheet('الصلاة على النبي ﷺ','salawat-reminder');root.innerHTML=`<p class="daily-prayer-text" translate="no" lang="ar" dir="rtl">${esc(dailyReminderContent.salawat.text)}</p><p class="small-note">الأحزاب ٥٦</p><p>اللهم صل وسلم على نبينا محمد.</p>`;uiLocalize(root)}else if(data.kind==='morning'||data.kind==='evening')duaHome(data.kind);else{const root=featureSheet('ذكرك وقراءتك قبل النوم','night-reminder');root.innerHTML='<p>اختر ما تبدأ به، وتابع أذكارك وقراءتك بهدوء.</p><div class="daily-reminder-actions"><button class="action" data-night-dhikr>أذكار اليوم</button><button class="action" data-night-mulk>قراءة سورة الملك</button></div>';root.querySelector('[data-night-dhikr]').onclick=()=>{closeFeatureSheet();duaHome()};root.querySelector('[data-night-mulk]').onclick=()=>{closeFeatureSheet();showPage(versePages['67:1'],'67:1')};uiLocalize(root)}};
const dailyHome=home;home=function(...args){dailyHome(...args);refreshDailyDua();setTimeout(async()=>{await window.openDailyReminderFromNotification();maybeFridayGuide()},300)};
const dailyFinishTour=finishFirstTour;finishFirstTour=function(...args){dailyFinishTour(...args);Promise.resolve(window.openDailyReminderFromNotification()).then(()=>maybeFridayGuide())};
const dailyReminderReady=fetch('daily-reminders.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{dailyReminderContent=data;refreshDailyDua();return data}).catch(()=>null);
if(!window.AndroidReader?.consumeFridayReminder)dailyBrowserEnter();
document.addEventListener('visibilitychange',async()=>{if(document.hidden){dailyForeground=false;return}if(!dailyForeground){dailyForeground=true;if(!window.AndroidReader?.consumeFridayReminder)dailyBrowserEnter()}refreshDailyDua();checkDailyFridayExpiry();await window.openDailyReminderFromNotification();maybeFridayGuide()});
setInterval(()=>{if(document.hidden)return;refreshDailyDua();checkDailyFridayExpiry();maybeFridayGuide()},30000);
function commitDailyReminderConsent(enabled){if(window.AndroidReader?.setDailyReminderConsent&&AndroidReader.setDailyReminderConsent(enabled)===false)throw Error('reminder consent');localStorage.dailyReminderConsent=enabled?'1':'0';localStorage.removeItem('dailyReminderSettings')}
if(localStorage.mushafiWelcomeCompleted==='1')window.AndroidReader?.initializeDailyReminderConsent?.();
