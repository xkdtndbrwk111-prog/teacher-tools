/* HojaBoard V1.66.19 design contract: exact base palette from runtime-src/system/dashboard.html.
   Custom colors use the same mix ratios as board vars(t). No student data, CSS strings or executable input. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TTHojaTheme=api})(globalThis,()=>{
 'use strict';
 const VERSION=1;
 const PRESETS=Object.freeze(Object.fromEntries(Object.entries({
  "dark": {
    "bg": "#151a2b",
    "panel": "#242c40",
    "surface": "#1d2538",
    "border": "#45516b",
    "text": "#f0f3fa",
    "sub": "#b7c3d8",
    "accent": "#697be0",
    "today": "#303b5b",
    "current": "#6176cb",
    "control": "#364058",
    "control-text": "#ffffff"
  },
  "sky": {
    "bg": "#e4f3f0",
    "panel": "#fbfffd",
    "surface": "#eff8f5",
    "border": "#b4d8d2",
    "text": "#1b4546",
    "sub": "#567b7e",
    "accent": "#287e8b",
    "today": "#d6eeed",
    "current": "#2f8493",
    "control": "#d8eeea",
    "control-text": "#19484c"
  },
  "pink": {
    "bg": "#fff1eb",
    "panel": "#fffdfa",
    "surface": "#fff6f0",
    "border": "#ebc9bf",
    "text": "#583c39",
    "sub": "#8a6864",
    "accent": "#c66e66",
    "today": "#ffe4d6",
    "current": "#bc615d",
    "control": "#f5e0d8",
    "control-text": "#613934"
  },
  "green": {
    "bg": "#e9f3ec",
    "panel": "#fffefd",
    "surface": "#f1f8f2",
    "border": "#b8d4c4",
    "text": "#234b40",
    "sub": "#5f8072",
    "accent": "#398272",
    "today": "#d7eadc",
    "current": "#347968",
    "control": "#dcefe2",
    "control-text": "#1f4f3f"
  },
  "black": {
    "bg": "#101214",
    "panel": "#1f2226",
    "surface": "#181a1e",
    "border": "#4f5961",
    "text": "#f5f5f1",
    "sub": "#b8c1c4",
    "accent": "#8ca5b7",
    "today": "#333e47",
    "current": "#657e93",
    "control": "#343b42",
    "control-text": "#ffffff"
  }
}).map(([k,v])=>[k,Object.freeze(v)])));
 const NAMES=Object.freeze({"pink":"복숭아","black":"먹빛","green":"솔바람","dark":"달그늘","sky":"물빛"});
 const DEFAULT=Object.freeze({version:VERSION,theme:'dark',font:''});
 const isHex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const toHex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
 const mix=(a,b,t)=>toHex(hex(a).map((v,i)=>v+(hex(b)[i]-v)*t));
 const lum=h=>{const c=hex(h).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const ink=(bg,preferred)=>contrast(bg,preferred)>=4.5?preferred:contrast(bg,'#000000')>=contrast(bg,'#ffffff')?'#000000':'#ffffff';
 const fontOK=v=>typeof v==='string'&&v.length<60&&/^[\p{L}\p{N} ._()-]*$/u.test(v);
 function normalize(v){
  if(!v||v.version!==VERSION||!fontOK(v.font)||!(Object.hasOwn(PRESETS,v.theme)||v.theme==='custom'))return null;
  const out={version:VERSION,theme:v.theme,font:v.font};
  if(v.theme==='custom'){
   if(!v.custom||!['bg','panel','text','accent','modal'].every(k=>isHex(v.custom[k])))return null;
   out.custom=Object.fromEntries(['bg','panel','text','accent','modal'].map(k=>[k,v.custom[k].toLowerCase()]));
  }
  return out;
 }
 function resolve(v){
  const theme=normalize(v);if(!theme)throw Error('invalid theme');
  if(theme.theme!=='custom')return {...PRESETS[theme.theme],modal:PRESETS[theme.theme].panel};
  const {bg,panel,text,accent,modal}=theme.custom;
  return{bg,panel,surface:mix(panel,bg,.5),border:mix(panel,text,.2),text,sub:mix(text,panel,.35),accent,today:mix(accent,panel,.75),current:accent,control:mix(panel,text,.12),'control-text':text,modal};
 }
 function tokens(v){
  const p=resolve(v),out=Object.fromEntries(Object.entries(p).map(([k,value])=>['--cm-'+k,value]));
  // Retain the original palette, but readable role-specific ink is required for management text.
  for(const [role,bg] of Object.entries({body:p.bg,panel:p.panel,surface:p.surface,modal:p.modal,control:p.control,accent:p.accent,today:p.today})){
   out['--cm-'+role+'-ink']=ink(bg,role==='control'?p['control-text']:p.text);
   out['--cm-'+role+'-sub']=ink(bg,p.sub);
  }
  out['--cm-font']=v.font?'"'+v.font+'", system-ui, "Malgun Gothic", sans-serif':'system-ui, "Malgun Gothic", sans-serif';
  return out;
 }
 function apply(doc,value){
  const v=normalize(value);if(!v)return false;
  const root=doc.documentElement;
  for(const [k,x] of Object.entries(tokens(v)))root.style.setProperty(k,x);
  root.dataset.cmTheme=v.theme;root.classList.add('tt-manager-theme');return true;
 }
 return Object.freeze({VERSION,PRESETS,NAMES,DEFAULT,normalize,resolve,tokens,apply,contrast});
});
