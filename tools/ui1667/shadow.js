(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),round=x=>Math.round(x*10)/10;
function compute(light){
 const w=light?.weather||'unknown',s=light?.sun,m=light?.moon;
 if(!s||!m||!Number.isFinite(s.alt)||!Number.isFinite(m.alt))return {x:0,y:3,blur:12,alpha:.13,source:'diffuse'};
 if(w!=='clear'&&w!=='partly')return {x:0,y:3,blur:w==='thunder'?17:15,alpha:w==='thunder'?.09:.12,source:'diffuse'};
 const day=s.alt>0,body=day?s:m,illum=clamp(Number(light.illum)||0,0,1);
 if(!day&&(s.alt>-6||m.alt<=0||illum<.08))return {x:0,y:3,blur:13,alpha:.1,source:'diffuse'};
 const length=(day?1:.48)*(4+16*(1-Math.sin(clamp(body.alt,0,90)*Math.PI/180)));
 // The scene projects azimuth east to the left and west to the right (60..300 degrees).
 // Use the opposite horizontal direction; downward displacement models elevation on the widget plane.
 const horizontal=clamp((180-body.az)/120,-1,1);
 return {x:round(horizontal*length),y:round(3+length*.35),blur:round(day?9+length*.35:13+length*.25),alpha:round((day?.22:.1+illum*.07)*100)/100,source:day?'sun':'moon'};
}
let previous='';
function refresh(){
 const b=document.body,api=window.ttSkyLook,w=window.ttWeather;
 let light=api?.light?.();
 if(!w||w.stale||w.cur?.code==null)light=null;
 else if(Number(w.cur.code)===1||Number(w.cur.code)===2)light={...light,weather:'partly'};
 let v=compute(light);
 if(!b.classList.contains('tt-scene-on'))v={x:0,y:3,blur:12,alpha:.13,source:'diffuse'};
 const shadow=v.x+'px '+v.y+'px '+v.blur+'px rgba(2,9,21,'+v.alpha+')';
 if(shadow!==previous){previous=shadow;b.style.setProperty('--tt-natural-shadow',shadow);b.dataset.naturalLight=v.source}
 // Keep the bar tint subtle on any theme; evaluate text against both endpoints.
 const ink=window.ttTextRoles,cs=getComputedStyle(b),scene=b.classList.contains('tt-scene-glass');
 if(ink){
  const panel=cs.getPropertyValue('--panel').trim(),fg=cs.getPropertyValue('--tt-ink-panel-primary').trim();
  const raw=cs.getPropertyValue('--tt-glass-rgb').trim().split(',').map(Number);
  const glass=raw.length===3&&raw.every(Number.isFinite)?'#'+raw.map(x=>clamp(x,0,255).toString(16).padStart(2,'0')).join(''):panel;
  const a=Number(cs.getPropertyValue('--tt-ink-glass-alpha'))||1;
  const bgs=scene?[ink.mix('#000000',glass,a),ink.mix('#ffffff',glass,a)]:[panel];
  let opacity=.18;
  while(opacity>.001&&bgs.some(bg=>['#f2a0a0','#f3d46e','#91d7aa'].some(color=>ink.ratio(fg,ink.mix(bg,color,opacity))<4.5)))opacity-=.01;
  const value=String(Math.max(0,opacity).toFixed(2));if(b.style.getPropertyValue('--tt-progress-opacity')!==value)b.style.setProperty('--tt-progress-opacity',value);
 }
}
window.ttNaturalShadow=Object.freeze({compute,refresh});
let queued=false;const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}};
new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class','data-theme']});
new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['style']}); // computed role changes update the progress tint
// Avoid self-induced observer loops: only write changed variables.
setInterval(()=>{if(!document.hidden)refresh()},60000);refresh();
})();