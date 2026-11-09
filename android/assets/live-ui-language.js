// Localize only the app-owned broadcast wrapper. The official iframe is untouched.
window.applyMushafiLiveEnglish=function(dictionary,language='en'){
 document.documentElement.lang=language;document.documentElement.dir=language==='ur'?'rtl':'ltr';
 function update(root){if(root.nodeType===3){const value=root.nodeValue,key=value.trim();if(dictionary[key])root.nodeValue=dictionary[key];return}if(root.nodeType!==1||root.matches('script,style'))return;if(root.matches('iframe')){if(dictionary[root.title])root.title=dictionary[root.title];return;}Array.from(root.childNodes).forEach(update)}
 const caption=document.title.split(' | ')[0];if(dictionary[caption])document.title=dictionary[caption]+' | Mushafi';update(document.body);const frame=document.querySelector('#official-player');if(frame&&dictionary[frame.title])frame.title=dictionary[frame.title];
 if(window.mushafiLiveLanguageObserver)window.mushafiLiveLanguageObserver.disconnect();window.mushafiLiveLanguageObserver=new MutationObserver(records=>records.forEach(r=>{if(r.type==='characterData')update(r.target);else r.addedNodes.forEach(update)}));window.mushafiLiveLanguageObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
};
