/* Tafsir as a floating card: the page stays visible behind it, the verse is shown in the
   mushaf script, and moving between verses cross-fades instead of re-opening the sheet. */
(function(){
  if(typeof showTafsir!=='function')return;
  const base=showTafsir;
  const arNum=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  showTafsir=function(key,keepSnap=false){
    base(key,keepSnap);
    const panel=document.querySelector('.tafsir-panel');if(!panel)return;
    panel.classList.add('tafsir-card');
    if(keepSnap)panel.classList.add('tafsir-card-stay');
    const overlay=panel.previousElementSibling;
    if(overlay&&overlay.classList.contains('sheet-overlay'))overlay.classList.add('tafsir-overlay');
    const [c,v]=key.split(':').map(Number);
    const details=panel.querySelector('.tafsir-ayah');
    if(details){
      const verse=document.createElement('div');verse.className='tafsir-verse';verse.setAttribute('lang','ar');verse.setAttribute('dir','rtl');verse.setAttribute('translate','no');
      const text=document.createElement('p');text.className='tafsir-verse-text';
      text.textContent='﴿'+chapters[c-1].verses[v-1].text_uthmani+'﴾';
      const ref=document.createElement('span');ref.className='tafsir-verse-ref';
      ref.textContent=chapters[c-1].name_arabic+' · '+arNum(v);
      verse.append(text,ref);details.replaceWith(verse);
    }
    const scroll=panel.querySelector('.tafsir-scroll');if(scroll)scroll.scrollTop=0;
  };
})();
