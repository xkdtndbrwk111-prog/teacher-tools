(()=>{'use strict';
const K='#000000',W='#ffffff',names=['primary','secondary','accent','alert'];
function rgb(s){s=String(s).trim();if(/^#[\da-f]{3}$/i.test(s))s='#'+[...s.slice(1)].map(c=>c+c).join('');if(/^#[\da-f]{6}$/i.test(s))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const m=s.match(/^(?:rgb\()?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?$/);return m?m.slice(1).map(Number):[0,0,0]}
const hex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>hex(rgb(a).map((x,i)=>x*(1-t)+rgb(b)[i]*t));
const lum=c=>rgb(c).reduce((sum,x,i)=>{const v=x/255;return sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)},0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const score=(c,bgs)=>Math.min(...bgs.map(bg=>ratio(c,bg)));
function ink(c,bgs){if(score(c,bgs)>=4.5)return c;let best=null;for(const end of [K,W]){if(score(end,bgs)<4.5)continue;for(let i=1;i<=100;i++){const x=mix(c,end,i/100);if(score(x,bgs)>=4.5){if(!best||i<best.i)best={c:x,i};break}}}return best?best.c:score(K,bgs)>=score(W,bgs)?K:W}
const fill=bg=>ratio(K,bg)>=ratio(W,bg)?K:W;
function glass(bg,alpha){let a=Math.max(.45,Math.min(1,Number(alpha)||.78));for(;a<1;a+=.01){const bgs=[mix(K,bg,a),mix(W,bg,a)];if(Math.max(score(K,bgs),score(W,bgs))>=4.5)return {a,bgs}}return {a:1,bgs:[bg]}}
window.ttTextRoles=Object.freeze({ratio,ink,fill,glass,mix});
const body=document.body;let prev='',pending=false;
function refresh(){pending=false;const cs=getComputedStyle(body),v=(k,f)=>cs.getPropertyValue(k).trim()||f;
const bg=v('--bg','#151a2b'),panel=v('--panel',bg),surface=v('--surface',panel),modal=v('--tt-modal-panel',panel),primary=v('--text',W),secondary=v('--sub',primary),accent=v('--accent',primary),control=v('--control',panel),current=v('--current',accent),today=v('--today',panel),scene=body.classList.contains('tt-scene-glass'),ga=v('--tt-glass-alpha','.78'),ma=v('--tt-modal-alpha','.78'),gp=hex(rgb(v('--tt-glass-rgb',panel))),gm=hex(rgb(v('--tt-glass-modal-rgb',gp))),gi=hex(rgb(v('--tt-glass-inner-rgb',surface)));
const key=JSON.stringify([bg,panel,surface,modal,primary,secondary,accent,control,current,today,scene,ga,ma,gp,gm,gi]);if(key===prev)return;prev=key;
const g=scene?glass(gp,ga):{a:1,bgs:[panel]},m=scene?glass(gm,ma):{a:1,bgs:[modal]},inner=scene?glass(gi,.88):{a:1,bgs:[surface]};
const put=(n,x)=>{x=String(x);if(body.style.getPropertyValue(n)!==x)body.style.setProperty(n,x)};
for(const [name,bgs] of [['body',[bg]],['panel',g.bgs],['modal',m.bgs],['surface',inner.bgs],['input',[surface]],['today',[today]]]){
[primary,secondary,accent,'#b42318'].forEach((c,i)=>put('--tt-ink-'+name+'-'+names[i],ink(c,bgs)))}
put('--tt-ink-control-fill',fill(control));put('--tt-ink-accent-fill',fill(accent));put('--tt-ink-current-fill',fill(current));
put('--tt-ink-glass-alpha',g.a.toFixed(4));put('--tt-ink-modal-alpha',m.a.toFixed(4));put('--tt-ink-inner-alpha',inner.a.toFixed(4));}
refresh();new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(refresh)}}).observe(body,{attributes:true,attributeFilter:['style','class','data-theme']});
})();