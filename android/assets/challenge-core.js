'use strict';
/* Pure challenge rules. Persistent progress is independent of Quran/prayer state. */
const ChallengeCore=(()=>{
 const categories=['quran','prophets','sira','sahaba','history','hadith','fiqh','general'];
 const kinds=['solo','daily','review'],own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function rng(seed){let n=2166136261;for(const ch of String(seed))n=Math.imul(n^ch.charCodeAt(0),16777619);return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
 function shuffle(xs,random=Math.random){const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 function select(bank,{category='all',difficulty=1,count=10,seed=Date.now()}={}){if(!['all',...categories].includes(category)||![1,2,3].includes(+difficulty)||![5,10,20].includes(+count))throw Error('Invalid challenge settings');const r=rng(seed),pool=bank.filter(q=>category==='all'||q.category===category),exact=shuffle(pool.filter(q=>q.difficulty===+difficulty),r),near=shuffle(pool.filter(q=>q.difficulty!==+difficulty),r).sort((a,b)=>Math.abs(a.difficulty-difficulty)-Math.abs(b.difficulty-difficulty));const selected=[...exact,...near].slice(0,+count);if(selected.length!==+count)throw Error('Insufficient questions');return shuffle(selected,r).map(q=>({id:q.id,order:shuffle([0,1,2,3],r)}))}
 function day(t=Date.now()){const d=new Date(t);if(!Number.isFinite(d.getTime()))throw Error('Invalid date');return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
 function validDay(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return Number.isFinite(d.getTime())&&day(d)===s}
 function previousDay(s){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()-1);return day(d)}
 function empty(){return {version:1,mastered:{},attempts:{},daily:{},history:[]}}
 const roundId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(id);
 function validate(raw){
  const p=typeof raw==='string'?JSON.parse(raw):raw;
  if(!p||p.version!==1||!Array.isArray(p.history)||p.history.length>100)throw Error('Challenge progress');
  for(const key of ['mastered','attempts','daily'])if(!p[key]||Array.isArray(p[key])||typeof p[key]!=='object'||Object.keys(p[key]).length>12000)throw Error('Challenge map');
  for(const [id,v]of Object.entries(p.mastered))if(!/^[a-z0-9-]{1,80}$/.test(id)||v!==true)throw Error('Mastery');
  for(const [id,v]of Object.entries(p.attempts))if(!/^[a-z0-9-]{1,80}$/.test(id)||!Number.isSafeInteger(v)||v<0||v>1000000)throw Error('Attempts');
  for(const [d,v]of Object.entries(p.daily))if(!validDay(d)||v!==true)throw Error('Daily');
  const ids=new Set();for(const h of p.history){if(!h||!roundId(h.id)||ids.has(h.id)||!Number.isFinite(h.at)||h.at<0||!Number.isInteger(h.total)||h.total<1||h.total>20||!Number.isInteger(h.correct)||h.correct<0||h.correct>h.total||!kinds.includes(h.kind))throw Error('Challenge history');ids.add(h.id)}
  if(JSON.stringify(p).length>180000)throw Error('Progress too large');return p;
 }
 function validItems(items,bank){if(!Array.isArray(items)||!items.length||items.length>20)throw Error('Challenge questions');const known=new Set(bank.map(q=>q.id)),ids=new Set();for(const item of items){if(!item||!known.has(item.id)||ids.has(item.id)||!Array.isArray(item.order)||item.order.length!==4||new Set(item.order).size!==4||item.order.some(n=>!Number.isInteger(n)||n<0||n>3))throw Error('Challenge question');ids.add(item.id)}}
 function validAnswers(answers,count){if(!Array.isArray(answers)||answers.length>count)throw Error('Challenge answers');for(let i=0;i<answers.length;i++)if(!own(answers,i)||!Number.isInteger(answers[i])||answers[i]<-1||answers[i]>3)throw Error('Challenge answer')}
 function validateRound(raw,bank){const r=typeof raw==='string'?JSON.parse(raw):raw;if(!r||r.version!==1||!roundId(r.id)||!kinds.includes(r.kind)||!validDay(r.day)||typeof r.timer!=='boolean'||typeof r.completed!=='boolean'||!Number.isFinite(r.deadline)||r.deadline<0)throw Error('Saved challenge');validItems(r.items,bank);validAnswers(r.answers,r.items.length);if(!Number.isInteger(r.index)||r.index<0||r.index>=r.items.length||r.answers.length<r.index||r.answers.length>r.index+1||r.completed&&(r.index!==r.items.length-1||r.answers.length!==r.items.length)||r.timer&&!r.completed&&r.answers.length===r.index&&r.deadline===0)throw Error('Saved challenge position');for(const key of ['xpEarned','levelBefore','levelAfter'])if(r[key]!==undefined&&(!Number.isSafeInteger(r[key])||r[key]<(key==='xpEarned'?0:1)||r[key]>(key==='xpEarned'?430:1000000)))throw Error('Saved challenge result');if(JSON.stringify(r).length>24000)throw Error('Saved challenge too large');return r}
 function stats(p,bank,t=Date.now()){const known=new Set(bank.map(q=>q.id)),today=day(t),days=Object.keys(p.daily).filter(d=>validDay(d)&&d<=today),mastered=Object.keys(p.mastered).filter(id=>known.has(id)).length,answers=Object.entries(p.attempts).filter(([id])=>known.has(id)).reduce((n,[,v])=>n+v,0),xp=mastered*20+days.length*30,level=Math.floor(xp/500)+1;let streak=0,d=p.daily[today]?today:previousDay(today);while(p.daily[d]){streak++;d=previousDay(d)}const history=p.history.filter(h=>h&&Number.isInteger(h.correct)&&Number.isInteger(h.total)&&h.total>0&&h.correct>=0&&h.correct<=h.total);return {mastered,answers,xp,level,next:500-xp%500,streak,accuracy:history.length?Math.round(100*history.reduce((n,h)=>n+h.correct,0)/history.reduce((n,h)=>n+h.total,0)):0}}
 function complete(p,round,bank,t=Date.now()){
  p=validate(JSON.parse(JSON.stringify(p)));if(!round||!roundId(round.id)||!kinds.includes(round.kind))throw Error('Challenge round');validItems(round.items,bank);validAnswers(round.answers,round.items.length);if(round.answers.length!==round.items.length)throw Error('Incomplete challenge');if(round.kind==='daily'&&(!validDay(round.day)||round.day>day(t)))throw Error('Challenge day');if(p.history.some(h=>h.id===round.id))return p;
  const byId=new Map(bank.map(q=>[q.id,q]));let correct=0;for(let i=0;i<round.items.length;i++){const q=byId.get(round.items[i].id);p.attempts[q.id]=Math.min(1000000,(p.attempts[q.id]||0)+1);if(round.answers[i]===q.correct){correct++;p.mastered[q.id]=true}}
  if(round.kind==='daily')p.daily[round.day]=true;p.history.unshift({id:round.id,at:+new Date(t),correct,total:round.items.length,kind:round.kind});p.history=p.history.slice(0,100);return validate(p);
 }
 return {categories,rng,shuffle,select,empty,validate,validateRound,day,validDay,previousDay,stats,complete};
})();
if(typeof module!=='undefined')module.exports=ChallengeCore;
if(typeof backupKeys!=='undefined'){backupKeys.push('challengeProgress');const previous=parseBackup;parseBackup=function(input){const d=previous(input);if(d.challengeProgress!==undefined)ChallengeCore.validate(d.challengeProgress);return d}}
