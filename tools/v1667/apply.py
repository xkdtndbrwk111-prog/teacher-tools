"""V1.66.7: source migration, preserve installed assets and saved settings."""
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]);p=root/'dashboard.html';s=p.read_bytes().decode('utf-8')
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
# Use actual theme background on both small widgets; separate paper dialog.
change('background:#f4f5f1;pointer-events:none;z-index:0','background:transparent;pointer-events:none;z-index:0')
change('background:var(--tt-check-color);transition:width','background:color-mix(in srgb,var(--tt-check-color) 24%,transparent);transition:width')
change('gap:0;background:#f8f9fa!important}','gap:0}')
change('overflow:hidden!important;background:#f6f9fa!important;box-shadow:inset 0 0 0 1px rgba(133,150,159,.34),0 3px 8px rgba(0,0,0,.1)}','overflow:hidden!important}')
change('width:min(85%,250px);border-radius:16px;background:#dce5e9;overflow:hidden;border:1px solid #cbd5da','width:min(85%,250px);border-radius:16px;background:var(--surface);overflow:hidden;border:1px solid var(--border)')
change('.grid>.card.podo-card,#podoDetail,.podo-sheet,.podo-overview,.podo-preview,.podo-unconfigured{','#podoDetail,.podo-sheet,.podo-preview{')
# Preserve the same text ink over tinted progress by choosing a small, contrast-safe
# progress accent below the text instead of a full opaque fill.
change('background:color-mix(in srgb,var(--tt-check-color) 24%,transparent);transition:width','background:var(--tt-check-color);height:5px;position:absolute;bottom:0;left:0;transition:width')
# Text font shorthands keep sizes, weight, line height, only family changes.
pat=re.compile(r'(?<![\w-])font\s*:\s*([^;{}]*?)\s+(?:"Malgun Gothic","Apple SD Gothic Neo",)?system-ui,sans-serif(?=[;}])')
def fontfix(t):return pat.sub(lambda m:'font:'+m.group(1)+' var(--tt-font,system-ui,sans-serif)',t)
s=fontfix(s)
# Build light direction from existing sky calculation, only once per minute / weather change.
change("state:()=>{const p=pal(season);return","light:()=>{const now=seoulNow(),p=pal(season),b=p.body;return {sun:b.sun,moon:b.moon,illum:b.illum,weather:window.ttWeather?.stale||window.ttWeather?.cur?.code==null?'unknown':weatherKind(),minute:now.date+'-'+now.minute}},\n state:()=>{const p=pal(season);return")
# Heavy rain has drops touching the bottom edge of the cloud. Separate the exact
# rain palette on rows 20..21, reconstruct those obscured cloud pixels; rows 22..31
# belong entirely to precipitation. All untouched cloud pixels remain original.
change("   const part=(y0,y1)=>{","    const fixedBands={light_rain:24,heavy_rain:22,light_snow:23,heavy_snow:23,sleet:23};\n    if(fixedBands[name])band=fixedBands[name];\n    const part=(y0,y1)=>{")
change("   if(o.kind==='thunder'){","""    if(name==='heavy_rain'){
     const top=o.top.getContext('2d'),fall=o.fall.getContext('2d'),tp=top.getImageData(0,0,32,32),fp=fall.getImageData(0,0,32,32);
     for(let y=20;y<22;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4,r=d[i],g=d[i+1],b=d[i+2];
      if((r===74&&g===168&&b===255)||(r===38&&g===51&&b===85)){
       fp.data.set(d.subarray(i,i+4),i);tp.data.set(y===20?[55,55,83,255]:[36,38,66,255],i);
      }
     }
     top.putImageData(tp,0,0);fall.putImageData(fp,0,0);o.band=20;o.speed=2;
    }
    if(o.kind==='thunder'){""")
# Keep normal rain unchanged; distinct intensity cadence, not integer wrap alias.
change("const h=32-o.band,s=(o.kind==='snow'?Math.floor(f/2):f)%h;","const h=32-o.band,s=(o.kind==='snow'?Math.floor(f/(o.heavy?2:3)):Math.floor(f*(o.speed||1)))%h;")
change("kind:/thunder/.test(name)?'thunder':band<32?(/snow|hail/.test(name)?'snow':'rain'):'static'","heavy:name==='heavy_snow',kind:/thunder/.test(name)?'thunder':band<32?(/snow|hail/.test(name)?'snow':'rain'):'static'")
# Explicit light rain cadence for weather code 51..61 / 80, shared source canvas.
change("if(c>=51&&c<=57)return['light_rain','이슬비'];","if(c>=51&&c<=57)return['drizzle','이슬비'];")
change("if(c===61||c===80)return['light_rain','약한 비'];","if(c===61||c===80)return['drizzle','약한 비'];")
change("const A=window.TT_ASSETS||{},ICON=A.weatherIcons||{};","const A=window.TT_ASSETS||{},ICON={...(A.weatherIcons||{})};ICON.drizzle=ICON.light_rain;")
change("light_rain:24,heavy_rain:22","drizzle:24,light_rain:24,heavy_rain:22")
change("    if(name==='heavy_rain'){","""    if(name==='drizzle'){
     const q=o.fall.getContext('2d');q.clearRect(0,band,10,32-band);q.clearRect(20,band,12,32-band);o.speed=.5;
    }
    if(name==='heavy_rain'){""")
# Motion preferences and no flashes in reduced motion.
change("let wxFrame=0;\n setInterval(()=>{if(document.hidden)return;wxFrame++;","let wxFrame=0;const wxCalm=matchMedia('(prefers-reduced-motion: reduce)');\n setInterval(()=>{if(document.hidden)return;if(!wxCalm.matches)wxFrame++;")
change("wxDraw(cv,wxFrame)}},110);","wxDraw(cv,wxCalm.matches?0:wxFrame)}},110);")
# Shared CSS shadow: only normal dashboard cards, not modals or edit state.
style='''
<style id="tt-v1667-common">
body{--tt-widget-shadow:0 4px 12px rgba(2,9,21,.16)}
body:not(.layout-editing) .grid>.card:not(.tt-check-complete):not(.tt-flash){box-shadow:var(--tt-widget-shadow)!important}
.grid>.card.podo-card{border-color:var(--border)}
.grid>.card.podo-card:focus-visible{outline-color:var(--accent)}
body.tt-scene-glass .grid>.card.podo-card{border-color:rgba(var(--tt-glass-border-rgb),.43)!important}
body .grid>.card .podo-overview,body .grid>.card .podo-unconfigured{color:var(--text-primary);background:transparent}
body .grid>.card .podo-overview-tiny-title,body .grid>.card .podo-overview-tiny,body .grid>.card .podo-overview-count,.photo-card[data-photo-frame="pola"] .photo-frame::after{font-family:var(--tt-font,system-ui,sans-serif)}
</style>
<script id="tt-v1667-natural-light">
(()=>{
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),rad=Math.PI/180;
function shadow(s){
 const w=s?.weather||'unknown',sun=s?.sun,moon=s?.moon;
 if(w==='thunder')return {x:0,y:2,blur:17,alpha:.08};
 if(w!=='clear')return {x:0,y:4,blur:16,alpha:w==='rain'?.11:.14};
 const day=sun&&sun.alt>0,light=day?sun:moon;
 if(!light||light.alt<=0||(!day&&s.illum<.12))return {x:0,y:3,blur:14,alpha:.12};
 const strength=day?1:clamp(s.illum,.12,1)*.55,alt=clamp(light.alt,0,90);
 const length=clamp(4+12*(1-Math.sin(alt*rad)),4,16)*strength;
 // Match existing museum sky projection: azimuth east=left, west=right.
 // A light on screen-left casts a rightward shadow and vice versa.
 const x=clamp(-((light.az-180)/120)*length,-16,16),y=clamp(length*.65,2,11);
 return {x,y,blur:day?Math.round(8+4*(1-Math.sin(alt*rad))):15,alpha:day?.22:.10+.07*strength};
}
window.ttWidgetShadow=shadow;let last='';
function update(){
 const s=window.ttSkyLook?.light?.(),v=shadow(s);
 const key=[s?.minute,s?.weather,v.x,v.y,v.blur,v.alpha].join('|');if(key===last)return;last=key;
 document.body.style.setProperty('--tt-widget-shadow',''+v.x.toFixed(1)+'px '+v.y.toFixed(1)+'px '+v.blur+'px rgba(2,9,21,'+v.alpha.toFixed(3)+')');
}
update();setInterval(()=>{if(!document.hidden)update()},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
})();
</script>
'''
change('</body>',style+'</body>')
s=s.replace('V1.66.6 STABLE PILOT','V1.66.7 STABLE PILOT')
p.write_bytes(s.encode())
for name in ['podo.js','coins-ui.js','presentation-board.css','presentation-board.js','update-ui.js','seating-inbox.html']:
 p=root/name;t=p.read_bytes().decode('utf-8');v=fontfix(t)
 if name=='podo.js':
  v=v.replace('gap:0;background:#f8f9fa!important}','gap:0}')
 if name=='seating-inbox.html':
  # Standalone receiver status has no dashboard font setting; retain its own fallback.
  v=t
 if t!=v:p.write_bytes(v.encode())
p=root/'release.json';t=p.read_bytes().decode('utf-8');assert '1.66.6' in t;p.write_bytes(t.replace('1.66.6','1.66.7').encode())
print('V1.66.7 source migration applied')
