'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');const root=path.resolve(__dirname,'../..');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/assets/quran.js','utf8')+';this.data=chapters',ctx);const verses=new Map(ctx.data.flatMap(c=>c.verses.map(v=>[v.verse_key,{text:v.text_uthmani,name:c.name_arabic}])));
const muslim=new Map(JSON.parse(fs.readFileSync(root+'/assets/muslim-library.json')).entries.map(x=>[x.id,x]));
const bank=fs.readdirSync(root+'/content/challenge').filter(x=>x.endsWith('.json')).flatMap(x=>JSON.parse(fs.readFileSync(root+'/content/challenge/'+x)));
const ids=new Set(),texts=new Set();for(const q of bank){if(ids.has(q.id)||texts.has(q.question)||!/^[a-z0-9-]+$/.test(q.id)||![1,2,3].includes(q.difficulty)||q.options.length!==4||new Set(q.options).size!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||!q.explanation)throw Error('Invalid '+q.id);ids.add(q.id);texts.add(q.question);
 if(q.source.kind==='quran'){q.source.proofs=q.source.keys.map(k=>{const v=verses.get(k);if(!v)throw Error(k);return {label:'سورة '+v.name+' · '+k,text:v.text,url:'https://quran.com/'+k.replace(':','/')};});}
 else if(q.source.kind==='muslim'){const v=muslim.get(q.source.id);if(!v)throw Error(q.source.id);q.source.proofs=[{label:'صحيح مسلم · '+v.id,text:v.text,url:'https://sunnah.com/muslim:'+v.id}];}else throw Error('source');
}
for(const c of ['quran','prophets','sira','sahaba','history','hadith','fiqh','general'])for(const d of [1,2,3])if(bank.filter(q=>q.category===c&&q.difficulty===d).length!==12)throw Error('Coverage '+c+d);
if(process.argv.includes('--check')){if(fs.readFileSync(root+'/assets/challenge-bank.json','utf8')!==JSON.stringify(bank))throw Error('Generated bank is stale');}else fs.writeFileSync(root+'/assets/challenge-bank.json',JSON.stringify(bank));console.log('Validated '+bank.length+' unique questions, four options, canonical citations and balanced categories.');
