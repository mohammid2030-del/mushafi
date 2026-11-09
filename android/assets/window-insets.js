'use strict';
let mushafiWindowInsets={top:0,bottom:0};
function applyMushafiWindowInsets(value){try{const data=typeof value==='string'?JSON.parse(value):value;if(!data||typeof data!=='object')return;const density=Number(data.density);if(!Number.isFinite(density)||density<=0||density>16)return;const top=Number(data.top),bottom=Number(data.bottom);if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<0||bottom<0||top>4096||bottom>4096)return;mushafiWindowInsets={top:top/density,bottom:bottom/density};const root=document.documentElement;root.style.setProperty('--native-safe-top',mushafiWindowInsets.top+'px');root.style.setProperty('--native-safe-bottom',mushafiWindowInsets.bottom+'px');root.classList.add('native-window-insets');}catch{}}
window.onMushafiWindowInsets=applyMushafiWindowInsets;
function mushafiSafeArea(){return document.body.classList.contains('reading')||document.body.classList.contains('story-reading')?{top:0,bottom:0}:{...mushafiWindowInsets};}
try{if(window.AndroidReader?.appWindowInsets)applyMushafiWindowInsets(AndroidReader.appWindowInsets())}catch{}
