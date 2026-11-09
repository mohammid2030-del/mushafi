"""Size the owner's supplied artwork; derive Android's required white alpha glyph.
No redraw or generated substitute. Pillow is used only for technical asset conversion.
"""
from pathlib import Path
from PIL import Image
import shutil
ROOT=Path(__file__).resolve().parents[1]
source=Image.open(ROOT/'tools/branding/mushafi-icon-original.png').convert('RGBA')
art=source.crop(source.getbbox())
size=max(art.size)
square=Image.new('RGBA',(size,size));square.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
native=ROOT/'res/drawable-nodpi';native.mkdir(exist_ok=True)
square.resize((512,512),Image.Resampling.LANCZOS).save(native/'app_icon_art.png',optimize=True)
# Android adaptive layers are 108 dp, with a 72 dp viewport. Keep the supplied
# artwork in that viewport so the moon and star remain inside launcher masks.
adaptive=Image.new('RGBA',(432,432));adaptive.alpha_composite(square.resize((288,288),Image.Resampling.LANCZOS),(72,72));adaptive.save(native/'app_icon_adaptive_art.png',optimize=True)
# Extract only the two gold shapes, excluding the black plate and its blue edge.
mask=Image.new('L',source.size)
mask.putdata([255 if a>0 and r>100 and g>95 and r>b*1.08 and g>b*1.05 else 0 for r,g,b,a in source.getdata()])
glyph=mask.crop(mask.getbbox());extent=max(glyph.size)
# Center without distorting the two original shapes; two dp breathing room.
for density,px in [('mdpi',24),('hdpi',36),('xhdpi',48),('xxhdpi',72),('xxxhdpi',96)]:
 edge=round(px*20/24);w=round(glyph.width*edge/extent);h=round(glyph.height*edge/extent)
 alpha=Image.new('L',(px,px));alpha.paste(glyph.resize((w,h),Image.Resampling.LANCZOS),((px-w)//2,(px-h)//2))
 out=Image.new('RGBA',(px,px),(255,255,255,0));out.putalpha(alpha)
 folder=ROOT/('res/drawable-'+density);folder.mkdir(exist_ok=True);out.save(folder/'ic_prayer_notification.png',optimize=True)
web=ROOT/'assets/images/mushafi-official-icon.png'
shutil.copyfile(native/'app_icon_art.png',web)
print('Prepared fixed approved artwork for app/legacy/adaptive launcher and five notification densities.')
