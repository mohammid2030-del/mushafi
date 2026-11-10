// Extracts short adhkar for the iOS widgets from the app's own reviewed data.
import fs from 'fs';
const [src, out] = process.argv.slice(2);
const devotions = new Function(fs.readFileSync(src, 'utf8') + ';return devotions;')();
const groups = ['morning', 'evening', 'sleep', 'prayer', 'daily', 'sunnah', 'quran'];
const items = devotions
  .filter(x => x.text && x.text.length <= 230 && (x.groups || []).some(g => groups.includes(g)))
  .map(x => ({ id: x.id, title: x.title, text: x.text.trim(), reference: x.reference || '', count: x.count || 0,
               groups: x.groups.filter(g => groups.includes(g)) }));
fs.writeFileSync(out, JSON.stringify({ items }));
for (const g of groups) console.log(g, items.filter(i => i.groups.includes(g)).map(i => i.id).join(' '));
