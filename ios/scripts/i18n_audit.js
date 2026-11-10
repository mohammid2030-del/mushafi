// Lists Arabic UI text in the app's scripts that the i18n engine would leave (partly) Arabic.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], lang = process.argv[3] || 'en';
const ctx = { window: {}, document: { documentElement: { classList: { add() {}, remove() {} } } }, localStorage: {}, navigator: { languages: ['en'] }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'i18n.js'), 'utf8') + `
;this.__set=(d)=>{uiDictionary=d;uiLanguage='${lang}';uiPrepareDictionary()};this.__t=(s)=>uiTranslate(s);`, ctx);
ctx.__set(JSON.parse(fs.readFileSync(path.join(dir, 'locales', lang + '.json'), 'utf8')));
const skip = /(^quran|^pages|^tafsir|audio-index|^juzs|^hizbs|-data\.js$|^muslim-library|^devotions-data|^morning-evening|challenge-bank|^adhan|^learn-data|charity-directory|surah-audio|verse-segments|-copy\.js$|i18n\.js$)/;
const arabic = /[ء-ي]/;
const out = new Map();
const urdu = /[\u06c1\u06cc\u06d2\u06ba\u0679\u0688\u0691\u06a9\u06af\u06d4\u0626\u06be]/;
const harakat = s => (s.match(/[\u064b-\u0652]/g) || []).length;
const pairs = new Set();
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !skip.test(f))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/(?:\bch|storyText|challengeText|t)\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*(['"`])/g)) pairs.add(m[2]);
  const literals = src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  for (const lit of literals) {
    if (!arabic.test(lit)) continue;
    const body = lit.slice(1, -1);
    const parts = body.split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/).flatMap(p => p.split(/<[^>]*>/));
    for (let p of parts) {
      p = p.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!arabic.test(p) || p.length < 2 || urdu.test(p) || harakat(p) > 4) continue;
      if (lang === 'en' && pairs.has(body)) continue;
      const t = ctx.__t(p);
      const left = lang === 'ur' ? t.replace(/\s+/g,' ').trim() === p : arabic.test(t);
      if (left) { if (!out.has(p)) out.set(p, f); }
    }
  }
}
for (const [s, f] of out) console.log(f + '\t' + s);
console.error('missing:', out.size);
