import pathlib,sys
p=pathlib.Path('runtime-src/system/dashboard.html');s=p.read_bytes().decode('utf-8')
def fix(a,b):
 global s
 assert s.count(a)==1,(a,s.count(a))
 s=s.replace(a,b)
fix("q.clearRect(0,band,10,32-band);q.clearRect(20,band,12,32-band);o.speed=.5;","q.clearRect(19,band,13,32-band);o.speed=.5;")
# Keep every visible overview, including the larger grape preview, theme-native.
fix('#podoDetail,.podo-sheet,.podo-preview{','#podoDetail,.podo-sheet,#podoDetail .podo-preview{')
# Correct reduced motion on the immediate HUD draw, too.
fix('wxSize(hc);wxDraw(hc,wxFrame)','wxSize(hc);wxDraw(hc,wxCalm.matches?0:wxFrame)')
# Partial clouds keep a softer, shorter directional shadow.
fix("weather:window.ttWeather?.stale||window.ttWeather?.cur?.code==null?'unknown':weatherKind()","weather:window.ttWeather?.stale||window.ttWeather?.cur?.code==null?'unknown':Number(window.ttWeather.cur.code)===2?'partly':weatherKind()")
fix("if(w!=='clear')return {x:0,y:4,blur:16,alpha:w==='rain'?.11:.14};","if(w!=='clear'&&w!=='partly')return {x:0,y:4,blur:16,alpha:w==='rain'?.11:.14};")
fix("const strength=day?1:clamp(s.illum,.12,1)*.55,alt=","const strength=(day?1:clamp(s.illum,.12,1)*.55)*(w==='partly'?.6:1),alt=")
fix("alpha:day?.22:.10+.07*strength","alpha:day?(w==='partly'?.15:.22):.10+.07*strength")
p.write_bytes(s.encode())
