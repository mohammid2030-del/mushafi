// Builds the Cloudflare Workers bundle (cf/index.js): inlines the question bank and keeps only
// the default export (Workers treats every named export as an entrypoint).
import fs from 'node:fs';
let src = fs.readFileSync('worker/index.js', 'utf8');
const imp = "import bank from './bank.json' with {type:'json'};";
if (!src.includes(imp)) throw new Error('bank import not found');
src = src.replace(imp, 'const bank=' + fs.readFileSync('worker/bank.json', 'utf8') + ';');
src = src.replace(/^export (async function|function|const|let) /gm, '$1 ');
if (/^export (?!default)/m.test(src)) throw new Error('unexpected named export');
fs.mkdirSync('cf', { recursive: true });
fs.writeFileSync('cf/index.js', src);
console.log('cf/index.js', src.length, 'bytes');
