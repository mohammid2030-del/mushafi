import json,re,hashlib,pathlib
root=pathlib.Path(__file__).resolve().parents[2]/'assets/stories/hina-saal-alinsan'
raw=(root/'book.json').read_bytes();sha=hashlib.sha256(raw).hexdigest()
assert sha=='c5319ab0c8d1f86c82664f76ad60588fab0989830e7abe8de1dc5032323f5388','Original changed'
source=json.loads(raw)
for lang in ['en','ur','bn','tr']:
 b=json.loads((root/f'book-{lang}.json').read_text());assert b['language']==lang and b['originalSourceSha256']==sha
 assert b['direction']==('rtl' if lang=='ur' else 'ltr') and b['page_count']==60 and len(b['pages'])==60
 for a,p in zip(source['pages'],b['pages']):
  assert a['page']==p['page'] and len(a['content'].split('\n'))==len(p['content'].split('\n'))
  assert re.findall(r'﴿[^﴾]+﴾',a['content'])==re.findall(r'﴿[^﴾]+﴾',p['content']),p['page']
  assert p['title'].strip() and p['content'].strip() and '__MUSHAFI_' not in p['content']
 print('PASS',lang,'60 pages, paragraph boundaries, Arabic quotations, source hash')
