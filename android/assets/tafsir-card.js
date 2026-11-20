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
      // the verse sizes itself to its length; a long verse shows its opening lines and opens in place, never in a scroll box of its own
      const words=chapters[c-1].verses[v-1].text_uthmani.split(/\s+/).length;
      verse.style.setProperty('--tv-add',(words<=14?7:words<=28?4:words<=48?2:0)+'px');
      verse.dataset.len=words<=14?'short':words<=48?'mid':'long';
      ref.textContent='سورة '+chapters[c-1].name_arabic+' · الآية '+arNum(v);
      verse.append(text);details.replaceWith(verse);
      if(words>30){verse.classList.add('is-collapsed');const more=document.createElement('button');more.type='button';more.className='tafsir-verse-more';const label=()=>more.textContent=verse.classList.contains('is-collapsed')?'عرض الآية كاملة':'إخفاء';label();more.onclick=()=>{verse.classList.toggle('is-collapsed');label();try{uiLocalize(more)}catch(e){}};verse.append(more);try{uiLocalize(more)}catch(e){}}
    }
    const scroll=panel.querySelector('.tafsir-scroll');if(scroll)scroll.scrollTop=0;
  };
})();
