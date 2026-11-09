"""Release gate: every UI language must contain the complete catalog and placeholders."""
from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[1]/'assets'/'locales'
source=json.loads((root/'ar.json').read_text())
errors=[]
for language in ['en']:
 path=root/(language+'.json')
 if not path.exists():errors.append(language+': missing catalog');continue
 data=json.loads(path.read_text());missing=set(source)-set(data)
 if missing:errors.append(f'{language}: {len(missing)} missing entries')
 for key in set(source)&set(data):
  if not isinstance(data[key],str) or not data[key].strip():errors.append(language+': empty entry');continue
  if sorted(re.findall(r'\{\d+\}',key))!=sorted(re.findall(r'\{\d+\}',data[key])):errors.append(language+': invalid placeholders in '+key)
if errors:
 print('Localization release blocked:\n'+'\n'.join(errors));sys.exit(1)
print('PASS: Arabic and English UI catalogs complete, with valid placeholders')
