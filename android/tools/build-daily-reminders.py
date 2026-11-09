import json,os
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[1])
s=Path('assets/devotions-data.js').read_text();items=json.loads(s[s.index('['):].rstrip(';'));by={d['id']:d for d in items}
qids=['quran-2-201','quran-3-8','quran-7-23','quran-14-41','quran-18-10','quran-20-114','quran-21-83','quran-21-87','quran-25-74','quran-28-24','quran-59-10','quran-taha']
sids=['worry','guidance','healing','pardon','sayyid','prayer-help']
extra=[('mercy-provision','المغفرة والعافية والرزق','اللَّهُمَّ اغْفِرْ لِي وَارْحَمْنِي وَاهْدِنِي وَعَافِنِي وَارْزُقْنِي','صحيح مسلم ٢٦٩٧b','https://sunnah.com/muslim:2697b'),('wellbeing','دوام النعمة والعافية','اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ زَوَالِ نِعْمَتِكَ وَتَحَوُّلِ عَافِيَتِكَ وَفُجَاءَةِ نِقْمَتِكَ وَجَمِيعِ سَخَطِكَ','صحيح مسلم ٢٧٣٩','https://sunnah.com/muslim:2739'),('religion-life','صلاح الدين والدنيا والآخرة','اللَّهُمَّ أَصْلِحْ لِي دِينِيَ الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي، وَأَصْلِحْ لِي آخِرَتِي الَّتِي فِيهَا مَعَادِي، وَاجْعَلِ الْحَيَاةَ زِيَادَةً لِي فِي كُلِّ خَيْرٍ، وَاجْعَلِ الْمَوْتَ رَاحَةً لِي مِنْ كُلِّ شَرٍّ','صحيح مسلم ٢٧٢٠','https://sunnah.com/muslim:2720'),('deeds','الاستعاذة من شر العمل','اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ شَرِّ مَا عَمِلْتُ وَمِنْ شَرِّ مَا لَمْ أَعْمَلْ','صحيح مسلم ٢٧١٦a','https://sunnah.com/muslim:2716a')]
sunna=[by[i] for i in sids]+[dict(id=i,title=t,text=text,reference=ref,url=url,kind='sunnah',grade='في صحيح مسلم',note='') for i,t,text,ref,url in extra]
pool=[]
for i in range(12):
 pool.append(by[qids[i]])
 if i<len(sunna):pool.append(sunna[i])
pool=[{k:d.get(k,'') for k in ['id','title','text','reference','url','kind','grade','note']} for d in pool]
s=Path('assets/quran.js').read_text();chapters=json.loads(s[s.index('['):].rstrip(';\n '));verse=chapters[32]['verses'][55]['text_uthmani']
guide=[dict(title='أكثر من الصلاة على النبي ﷺ',body='الصلاة على النبي ﷺ مشروعة، ومن صلى عليه مرة صلى الله عليه بها عشرًا.',reference='صحيح مسلم ٤٠٨',url='https://sunnah.com/muslim:408'),dict(title='اقرأ سورة الكهف',body='اجعل لك وقتًا لقراءة سورة الكهف يوم الجمعة؛ وقت قراءتها في اليوم واسع.',reference='فتاوى ابن باز · قراءة سورة الكهف يوم الجمعة',url='https://binbaz.org.sa/fatwas/9398/تحديد-قراءة-سورة-الكهف-يوم-الجمعة'),dict(title='استعد لصلاة الجمعة',body='الاغتسال والنظافة والسواك، والطيب للرجال، والتبكير إلى المسجد، وعدم التفريق بين الجالسين، والإنصات للخطبة من آداب الجمعة.',reference='صحيح البخاري ٨٨٠، ٨٨١، ٨٨٣',url='https://sunnah.com/bukhari:883'),dict(title='النظافة من الفطرة',body='قص الأظافر عند الحاجة من سنن الفطرة، ولا يختص بالجمعة. لا تُترك هذه الخصال أكثر من أربعين ليلة.',reference='صحيح مسلم ٢٥٨ · فتوى الشيخ سعد الخثلان',url='https://saadalkhathlan.com/fatwas/5147'),dict(title='أكثر من الدعاء',body='يُرجى تحري ساعة الإجابة بعد العصر إلى غروب الشمس. تنبيه ربع الساعة موعد تذكير تختاره، وليس تحديدًا شرعيًا لساعة الإجابة.',reference='فتاوى ابن باز · وقت تحري ساعة الإجابة',url='https://binbaz.org.sa/fatwas/5153/وقت-تحري-ساعة-الاجابة-من-يوم-الجمعة')]
data=dict(version=1,pool=pool,salawat=dict(text=verse,reference='الأحزاب ٥٦',url='https://quran.com/33/56'),fridayGuide=guide)
Path('assets/daily-reminders.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(pool),'unique prayers and full Quran 33:56')
