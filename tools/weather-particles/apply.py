"""Make real precipitation override seasonal particles, preserving existing layers."""
import pathlib,sys
p=pathlib.Path(sys.argv[1]);s=p.read_bytes().decode('utf-8')
def change(old,new):
 global s
 assert s.count(old)==1,('source mismatch',old[:130],s.count(old))
 s=s.replace(old,new)
# Shared classifier is independent of widget visibility or chosen background season.
change('window.ttWeatherIcons={prep:wxPrep,draw:wxDraw};','''window.ttWeatherIcons={prep:wxPrep,draw:wxDraw};
 // A stale/unknown forecast must not keep a simulated storm running.
 window.ttWeatherParticleKind=()=>{
  const w=window.ttWeather,raw=w?.cur?.code;
  if(!w||w.stale||raw==null||raw===''||!Number.isFinite(Number(raw)))return null;
  const c=Number(raw);
  if([95,96,99].includes(c))return 'thunder';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return 'rain';
  return null;
 };''')
change("let current='',loaded='',failed='',dots=[],last=0,stamp=0;","let current='',loaded='',failed='',dots=[],last=0,stamp=0,dotMode='',stormAt=0,stormBolt=null,particlePainted=false;")
change('  const rand=(a,b)=>a+Math.random()*(b-a);\n function makeDot(s,startAnywhere=true){','  const rand=(a,b)=>a+Math.random()*(b-a);\n const particleMode=()=>window.ttWeatherParticleKind?.()||activeSeason();\n function makeDot(s,startAnywhere=true){') if '  const rand=(a,b)=>a+Math.random()*(b-a);\n function makeDot(s,startAnywhere=true){' in s else change(' const rand=(a,b)=>a+Math.random()*(b-a);\n function makeDot(s,startAnywhere=true){',' const rand=(a,b)=>a+Math.random()*(b-a);\n const particleMode=()=>window.ttWeatherParticleKind?.()||activeSeason();\n function makeDot(s,startAnywhere=true){')
change("  if(s==='spring')return {x,y,vx:rand(.1,.35)","""  if(s==='rain'||s==='thunder'){
   const storm=s==='thunder';
   return {x:rand(-8,W+32),y:startAnywhere?rand(-12,H+12):rand(-22,-5),
    vx:rand(storm?-.98:-.52,storm?-.58:-.25),vy:rand(storm?4.2:3.1,storm?6.2:4.8),
    size:Math.round(rand(storm?7:4,storm?12:8)),alpha:rand(.62,.86)};
  }
  if(s==='spring')return {x,y,vx:rand(.1,.35)""")
change(''' function newDots(){
  const s=activeSeason();const counts={spring:32,summer:15,autumn:30,winter:55};const f=1;
  dots=Array.from({length:Math.round(counts[s]*f)},()=>makeDot(s));
 }''',''' function newDots(s=particleMode()){
  const counts={spring:32,summer:15,autumn:30,winter:55,rain:84,thunder:126};
  dotMode=s;dots=Array.from({length:counts[s]},()=>makeDot(s));
  stormBolt=null;stormAt=s==='thunder'?performance.now()+rand(3500,7500):0;
 }
 // A local, slowly fading pixel lightning bolt in the upper sky, not a full-screen flash.
 // One stroke per 18–32 seconds; the reduced-motion guard above applies to it as well.
 function paintStorm(ts){
  if(ts>=stormAt){
   const x=Math.round(rand(W*.18,W*.82)),points=[[x,3]];let px=x,py=3;
   for(let i=0;i<5;i++){px+=Math.round(rand(i%2?-15:-7,i%2?-4:19));py+=Math.round(rand(9,19));points.push([px,py])}
   stormBolt={points,at:ts};stormAt=ts+rand(18000,32000);
  }
  if(!stormBolt)return;
  const age=ts-stormBolt.at;if(age>=540){stormBolt=null;return}
  const opacity=Math.min(1,age/90)*Math.max(0,1-age/540);
  ctx.save();ctx.globalAlpha=.66*opacity;ctx.strokeStyle='#e9efff';ctx.lineWidth=1.5;
  ctx.beginPath();stormBolt.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore();
 }''')
change("if(document.hidden||!S.enabled||!S.particles||calm.matches||failed){photoCanvas.hidden=true;if(failed)canvas.hidden=true;return;}","""if(document.hidden||!S.enabled||!S.particles||calm.matches||failed){
   photoCanvas.hidden=true;canvas.hidden=true;
   if(particlePainted){ctx.clearRect(0,0,W,H);blackCtx?.clearRect(0,0,W,H);particlePainted=false;}
   dotMode='';stormBolt=null;return;
  }""")
change("ctx.clearRect(0,0,W,H);const s=activeSeason();\n  const step=dt/16.7;","""ctx.clearRect(0,0,W,H);const s=particleMode();
  if(s!==dotMode)newDots(s);
  canvas.dataset.particleKind=s;blackCanvas.dataset.particleKind=s;photoCanvas.dataset.particleKind=s;
  const step=dt/16.7;const wet=s==='rain'||s==='thunder';""")
change("  dots.forEach((p,i)=>{\n   p.phase+=.015*step;", """  dots.forEach((p,i)=>{
   if(wet){
    p.x+=p.vx*step;p.y+=p.vy*step;
    if(p.y>H+12||p.x<-16)dots[i]=p=makeDot(s,false);
    const x=Math.round(p.x),y=Math.round(p.y),len=p.size;
    ctx.globalAlpha=p.alpha*.60;ctx.fillStyle='#34516e';
    for(let k=0;k<len;k++)ctx.fillRect(x-Math.floor(k/4),y+k,1,1);
    ctx.globalAlpha=p.alpha;ctx.fillStyle='#c9e7fa';
    for(let k=0;k<len-1;k++)ctx.fillRect(x+1-Math.floor(k/4),y+k,1,1);
    return;
   }
   p.phase+=.015*step;""")
change("  ctx.globalAlpha=1;\n  paintPhotoParticles();","  ctx.globalAlpha=1;\n  if(s==='thunder')paintStorm(ts);\n  particlePainted=true;\n  paintPhotoParticles();")
change('계절 파티클 표시 범위</label>','계절·날씨 파티클 표시 범위</label>')
change('배경의 계절 효과는 유지합니다. 전체 위젯 위로 선택하면 같은 파티클이 화면 앞쪽을 지나갑니다.','평소에는 계절 효과를 표시하고, 현재 날씨가 비 또는 뇌우이면 빗방울·번개 효과가 대신 표시됩니다. 전체 위젯 위로 선택하면 같은 파티클이 화면 앞쪽을 지나갑니다.')
# Preserve the brief 2-minute notice shower, but never overlay seasonal petals/leaves over real rain.
change("function startShower(kind=seasonNow()){const c=SEASONS[kind];if(!c)return;const parts=[];const n=Math.round(45*Math.min(1.6,W*H/(640*360)));for(let i=0;i<n;i++)parts.push(spawn(c,true));shower={c,parts,t0:performance.now(),dur:10};loop()}","""function startShower(kind=seasonNow()){const effective=window.ttWeatherParticleKind?.()?'summer':kind,c=SEASONS[effective];if(!c)return;const parts=[];const n=Math.round(45*Math.min(1.6,W*H/(640*360)));for(let i=0;i<n;i++)parts.push(spawn(c,true));shower={kind,effective,c,parts,t0:performance.now(),dur:10};loop()}""")
change("   const t=(now-shower.t0)/1000,c=shower.c,fade=","""   const effective=window.ttWeatherParticleKind?.()?'summer':shower.kind;
   if(effective!==shower.effective){shower.effective=effective;shower.c=SEASONS[effective];shower.parts=shower.parts.map(()=>spawn(shower.c,true))}
   const t=(now-shower.t0)/1000,c=shower.c,fade=""")
p.write_bytes(s.encode('utf-8'))
print('PASS: weather overrides and all three existing particle surfaces preserved')
