(()=>{let theme;try{theme=localStorage.getItem('mushafi-site-theme')}catch{}document.documentElement.dataset.theme=['light','dark'].includes(theme)?theme:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';})();

(()=>{let language='ar';try{language=localStorage.getItem('mushafi-site-language')||'ar'}catch{}const selected=new URLSearchParams(location.search).get('lang');if(['ar','en'].includes(selected))language=selected;language=language==='en'?'en':'ar';document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';})();
