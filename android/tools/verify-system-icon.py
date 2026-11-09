"""Verify compiled fixed day/night system identity and owner's exact approved artwork."""
from pathlib import Path
from PIL import Image
import io,re,subprocess,sys,zipfile,hashlib,xml.etree.ElementTree as ET
p=Path(__file__).resolve().parents[1];apk=Path(sys.argv[1]) if len(sys.argv)>1 else p/'Mushafi-3.0.90.apk'
assert hashlib.sha256((p/'tools/branding/mushafi-icon-original.png').read_bytes()).hexdigest()=='fa3fa9805d52dc50d93fb29a56b8020c93035d7ee74105fc409863fe92414b2a'
resources=subprocess.check_output(['/workspace/android-sdk/build-tools/36.0.0/aapt2','dump','resources',str(apk)],text=True)
assert ' drawable/app_icon_light\n' not in resources and ' drawable/ic_mushafi_monochrome\n' not in resources
def variants(name):
 block=resources.split(' '+name+'\n',1)[1].split('    resource ',1)[0];return re.findall(r'\(file\) (\S+) type=',block)
for day,night in [('res/values/icon-colors.xml','res/values-night/icon-colors.xml'),('res/drawable/icon.xml','res/drawable-night/icon.xml'),('res/drawable/ic_mushafi_foreground.xml','res/drawable-night/ic_mushafi_foreground.xml')]:assert (p/day).read_bytes()==(p/night).read_bytes()
for level in ['','-v26','-v33']:
 day=p/f'res/mipmap-anydpi{level}/ic_launcher.xml';night=p/f'res/mipmap-night-anydpi{level}/ic_launcher.xml';assert day.read_bytes()==night.read_bytes();assert 'monochrome' not in day.read_text()
with zipfile.ZipFile(apk) as z:
 sizes=set()
 for n in variants('drawable/ic_prayer_notification'):
  im=Image.open(io.BytesIO(z.read(n))).convert('RGBA');sizes.add(im.size);assert im.getextrema()[3]==(0,255);assert all((r,g,b)==(255,255,255) for r,g,b,a in im.getdata() if a)
 assert sizes=={(24,24),(36,36),(48,48),(72,72),(96,96)}
 for resource,filename in [('drawable/app_icon_art','app_icon_art.png'),('drawable/app_icon_adaptive_art','app_icon_adaptive_art.png')]:
  expected=Image.open(p/'res/drawable-nodpi'/filename).convert('RGBA')
  for n in variants(resource):
   actual=Image.open(io.BytesIO(z.read(n))).convert('RGBA');assert actual.size==expected.size;assert all(a[3]==b[3] and (a[3]==0 or a==b) for a,b in zip(actual.getdata(),expected.getdata()))
 assert z.read('assets/images/mushafi-official-icon.png')==(p/'res/drawable-nodpi/app_icon_art.png').read_bytes()
 assert len(variants('mipmap/ic_launcher'))>=3
print('PASS: approved source digest, identical day/night launcher resources, fixed full-color adaptive artwork, no themed monochrome substitution, five Android white-alpha notification glyphs and exact in-app asset.')
