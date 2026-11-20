
// System gestures and hardware back share the same in-app navigation contract.
const systemBackParents=new Map();let systemBackRestoring=false;
function systemBackNavigate(action){systemBackRestoring=true;try{return action()}finally{systemBackRestoring=false}}
function systemBackRoute(){
 const group=systemBackDuaGroup;
 if(view==='learn')return ()=>learnHome();
 if(view==='learn-course'){const id=learnCourseId;return ()=>learnCourse(id);}
 if(view==='learn-lesson'){const cid=learnCourseId,lid=learnLessonId;return ()=>learnLesson(cid,lid);}
 const routes={'live-broadcasts':()=>liveBroadcastHome(),'dua-category':()=>duaHome(group),ward:()=>wardHome(),sebha:()=>sebhaHome(),home:()=>home(),more:()=>moreHome(),duas:()=>duaHome(),quran:()=>openQuran(quranTab),library:()=>libraryHome(),about:()=>about(),account:()=>accountHome(),prayer:()=>prayerHome(),khatma:()=>khatmaHome()};
 return (typeof navEntries!=='undefined'&&navEntries[view])||routes[view]||null;
}
const systemBackEnter=enterSection;
enterSection=function(name,tab){if(!systemBackRestoring&&name!==view){const parent=systemBackRoute();if(parent)systemBackParents.set(name,parent);else systemBackParents.delete(name);}return systemBackEnter(name,tab)};
window.handleNativeBack=function(){
 if(document.querySelector('.first-tour')){finishFirstTour();return true;}
 if(activeSheet||selectedVerseKey||document.querySelector('.verse-sheet,.verse-toolbar,.feature-sheet')){systemBackNavigate(()=>handleBack());return true;}
 if(typeof homeRecitationSession!=='undefined'&&homeRecitationSession){systemBackNavigate(()=>handleBack());return true;}
 if(view==='onboarding'&&onboardingState?.step===0)return false;
 if(view==='home')return false;
 // the bottom-bar sections are roots: back from them goes home
 if(['more','duas','mushaf','recitation'].includes(view)){home();return true;}
 if(view==='reader'&&!controlsVisible&&!khatmaReading&&!surahReading&&!smartReading&&systemReaderParent){systemBackNavigate(systemReaderParent);return true;}
 const surahSession=view.startsWith('surah-')&&(surahReading||(typeof homeRecitationSession!=='undefined'&&homeRecitationSession)||!systemBackParents.has(view));
 if(view==='reader'||view==='onboarding'||(view==='khatma-setup'&&(khatmaSetupStep>0||!systemBackParents.has(view)))||surahSession){systemBackNavigate(()=>handleBack());return true;}
 const parent=systemBackParents.get(view);if(parent){systemBackNavigate(parent);return true;}
 const back=app.querySelector('.screen-heading button[data-back],.screen-heading button[aria-label="رجوع"],.screen-heading>button.round-action:first-child');if(back){systemBackNavigate(()=>back.click());return true;}
 systemBackNavigate(()=>handleBack());return true;
};

let systemReaderParent=null;const systemBackShowPage=showPage;showPage=function(...args){if(view!=='reader')systemReaderParent=systemBackRoute();return systemBackShowPage.apply(this,args)};

let systemBackDuaGroup=null;const systemBackDuaHome=duaHome;duaHome=function(group){const result=systemBackDuaHome(group);systemBackDuaGroup=group||null;return result};
