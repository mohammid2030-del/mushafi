from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
p=Path(__file__).resolve().parents[1]
f=TTFont(p/'assets/ui-arabic.ttf');mapping=f.getBestCmap()
for table in f['cmap'].tables:
 if table.isUnicode():
  for j in range(10):
   table.cmap[0x660+j]=mapping[48+j];table.cmap[0x6f0+j]=mapping[48+j]
options=subset.Options();options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*'];sub=subset.Subsetter(options=options);sub.populate(unicodes=list(range(48,58))+list(range(0x660,0x66a))+list(range(0x6f0,0x6fa))+[32,45,58,0x2212,0x200e,0x200f]);sub.subset(f)
for record in f['name'].names:
 if record.nameID in [1,2,3,4,6,16,17]:
  value='Regular' if record.nameID in [2,17] else 'MushafiWidgetDigits-Regular' if record.nameID in [3,6] else 'Mushafi Widget Digits';record.string=value.encode(record.getEncoding())
f.save(p/'res/font/widget_countdown_latin.ttf')
f=TTFont(p/'res/font/widget_countdown_latin.ttf');m=f.getBestCmap();assert all(m[48+j]==m[0x660+j]==m[0x6f0+j] for j in range(10))
unit=f['head'].unitsPerEm
asc=int(.9*unit);desc=int(.25*unit)
f['hhea'].ascent=asc;f['hhea'].descent=-desc;f['hhea'].lineGap=0
for key,value in {'sTypoAscender':asc,'sTypoDescender':-desc,'sTypoLineGap':0,'usWinAscent':asc,'usWinDescent':desc}.items():setattr(f['OS/2'],key,value)
f.save(p/'res/font/widget_countdown_latin.ttf')
