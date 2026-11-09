import fs from 'node:fs';
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});fs.mkdirSync('dist/drizzle/meta',{recursive:true});
const source=fs.readFileSync('worker/index.js','utf8').replace("import bank from './bank.json' with {type:'json'};",'const bank='+fs.readFileSync('worker/bank.json','utf8')+';');
fs.writeFileSync('dist/server/index.js',source);fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');fs.cpSync('drizzle','dist/drizzle',{recursive:true});
