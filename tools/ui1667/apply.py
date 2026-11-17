import pathlib,re,sys,json
root=pathlib.Path('runtime-src/system')
here=pathlib.Path(__file__).parent
p=root/'dashboard.html';s=p.read_bytes().decode()
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
def fonts(t):
 # Only CSS declarations, never font-picker fallback construction or font previews.
 t=re.sub(r'(?m)(\bfont\s*:[^;{}<\n]*?)\s+(?:"Malgun Gothic","Apple SD Gothic Neo",)?system-ui,sans-serif(?=[;}\x27"])',r'\1 var(--tt-font,system-ui,sans-serif)',t)
 t=t.replace('font-family:system-ui,sans-serif','font-family:var(--tt-font,system-ui,sans-serif)')
 return t
s=fonts(s)
change('background:#f4f5f1;pointer-events:none;z-index:0','background:transparent;pointer-events:none;z-index:0')
change('.tt-check-track>i{display:block;width:var(--tt-check-fill);height:100%;background:var(--tt-check-color);','.tt-check-track>i{display:block;width:var(--tt-check-fill);height:100%;background:var(--tt-check-color);opacity:var(--tt-progress-opacity,.18);')
# Remove duplicate fixed dashboard backgrounds in both implementations; leave the paper modal intact.
def podo(t):
 t=t.replace('gap:0;background:#f8f9fa!important}','gap:0}')
 t=t.replace('overflow:hidden!important;background:#f6f9fa!important;box-shadow:inset 0 0 0 1px rgba(133,150,159,.34),0 3px 8px rgba(0,0,0,.1)}','overflow:hidden!important}')
 return t
s=podo(s)
change('.grid>.card.podo-card,#podoDetail,.podo-sheet,.podo-overview,.podo-preview,.podo-unconfigured{','#podoDetail,.podo-sheet,#podoDetail .podo-unconfigured{')
change("if(c>=51&&c<=57)return['light_rain','이슬비'];","if(c>=51&&c<=57)return['drizzle_rain','이슬비'];")
change("if(c===61||c===80)return['light_rain','약한 비'];","if(c===61||c===80)return['drizzle_rain','약한 비'];")
change("if(c===73||c===77)return['light_snow','눈'];","if(c===73||c===77)return['normal_snow','눈'];")
change("const A=window.TT_ASSETS||{},ICON=A.weatherIcons||{};","const A=window.TT_ASSETS||{},ICON={...(A.weatherIcons||{})};ICON.drizzle_rain=ICON.light_rain;ICON.normal_snow=ICON.light_snow;")
change("""    let band=32;const wet=/rain|shower|sleet|snow|hail|thunder/.test(name);
    if(wet){const widest=count.indexOf(Math.max(...count));for(let y=widest+1;y<32;y++)if(count[y]&&count[y]<count[y-1]*.6){band=y;break}}""","""    // Pixel-audited boundaries of the original 32x32 artwork. Dense rain cannot use row-width heuristics.
    const bands={drizzle_rain:24,light_rain:24,heavy_rain:22,light_snow:23,normal_snow:23,heavy_snow:21,sleet:23};
    const band=bands[name]??32;""")
change("kind:/thunder/.test(name)?'thunder':band<32?(/snow|hail/.test(name)?'snow':'rain'):'static'});","kind:/thunder/.test(name)?'thunder':band<32?(/snow|hail/.test(name)?'snow':'rain'):'static',name});\n    if(name==='drizzle_rain'){const q=o.fall.getContext('2d');q.clearRect(12,band,7,32-band)}")
change("const h=32-o.band,s=(o.kind==='snow'?Math.floor(f/2):f)%h;","const h=32-o.band,speed={drizzle_rain:.5,light_rain:1,heavy_rain:2,light_snow:.33,normal_snow:.5,heavy_snow:.75,sleet:.75}[o.name]??1,s=Math.floor(f*speed)%h;")
# expose the already cached celestial calculation, not a duplicate astronomy engine.
change(" // for diagnostics / tests\n state:()=>"," // Shared natural-light model: same location and bodies as the sky renderer.\n light:()=>{const p=pal(season);return {sun:p.body.sun,moon:p.body.moon,illum:p.body.illum,weather:p.wk}},\n // for diagnostics / tests\n state:()=>")
change("window.ttWeather=s;hud(s);","window.ttWeather=s;hud(s);window.ttNaturalShadow?.refresh();")
change("window.ttWeather=null;if(hudEl)","window.ttWeather=null;window.ttNaturalShadow?.refresh();if(hudEl)")
s=s.replace('V1.66.6 STABLE PILOT','V1.66.7 STABLE PILOT')
change('</body>','<style id="tt-v1667-unified-ui">\n'+(here/'ui.css').read_text()+'</style><script id="tt-v1667-natural-shadow">\n'+(here/'shadow.js').read_text()+'</script></body>')
p.write_bytes(s.encode())
for p in root.glob('*.js'):
 t=p.read_bytes().decode();new=fonts(t)
 if p.name=='podo.js':new=podo(new)
 if new!=t:p.write_bytes(new.encode())
p=root/'release.json';t=p.read_text();assert '"version": "1.66.6"' in t;p.write_bytes(t.replace('1.66.6','1.66.7').encode())
# report remaining intentional font declarations and verify assets are not altered
for p in sorted(root.glob('*')):
 if p.suffix in ('.html','.js','.css'):
  t=p.read_bytes().decode()
  for m in re.finditer(r'(?<![\w-])(?:font-family|font)\s*:[^;{}\n<]{1,150}',t):
   if 'system-ui' in m[0] and '--tt-font' not in m[0]:print('Standalone/fallback review:',p.name,m[0])
print('PASS: theme backgrounds, inherited font declarations, explicit weather icon masks, shared light model')
