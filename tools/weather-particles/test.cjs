const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('runtime-src/system/dashboard.html','utf8');
const get=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j)};
let ticks=0,frames=[],draws=[],copies=0,clears=0;const ctx={globalAlpha:1,fillStyle:'',fillRect(x,y,w,h){draws.push({x,y,w,h,ink:this.fillStyle})},clearRect(){clears++;draws=[]},save(){},restore(){this.globalAlpha=1},beginPath(){},moveTo(){},lineTo(){},stroke(){frames.push('bolt')},drawImage(){copies++}};
const c={window:{ttWeather:null},performance:{now:()=>ticks},Math,Number,Array,Object,document:{hidden:false},S:{enabled:true,particles:true},calm:{matches:false},failed:'',W:480,H:270,canvas:{hidden:false,dataset:{}},blackCanvas:{dataset:{}},photoCanvas:{hidden:false,dataset:{}},black:{hidden:false},ctx,blackCtx:{clearRect(){},drawImage(){copies++}},paintPhotoParticles(){copies++},requestAnimationFrame(){},activeSeason:()=>c.season,dots:[],last:0,dotMode:'',stormAt:0,stormBolt:null,particlePainted:false,season:'autumn'};
vm.createContext(c);vm.runInContext(get('window.ttWeatherParticleKind=()=>{','\n };')+'\n };',c);
vm.runInContext(get(' const rand=(a,b)=>a+Math.random()*(b-a);\n const particleMode',' function applyGlass(){')+get(' function paint(ts){\n  requestAnimationFrame(paint);\n  if(document.hidden||!S.enabled||!S.particles',' function ensureSettings(){'),c);
function step(code,stale=false){c.window.ttWeather=code==null?null:{cur:{code},stale};ticks+=100;vm.runInContext('paint('+ticks+')',c);return c.canvas.dataset.particleKind}
function kind(k){assert.equal(c.canvas.dataset.particleKind,k);assert.equal(c.blackCanvas.dataset.particleKind,k);assert.equal(c.photoCanvas.dataset.particleKind,k)}
assert.equal(step(null),'autumn');kind('autumn');assert.equal(c.dots.length,30);
for(const code of [51,53,55,56,57,61,63,65,66,67,80,81,82]){assert.equal(step(code),'rain');kind('rain');assert.equal(c.dots.length,84);assert(draws.every(d=>['#34516e','#c9e7fa'].includes(d.ink)))}
for(const code of [95,96,99]){assert.equal(step(code),'thunder');kind('thunder');assert.equal(c.dots.length,126)}
let start=c.stormAt;ticks=start+100;vm.runInContext('paint('+ticks+')',c);ticks+=150;vm.runInContext('paint('+ticks+')',c);assert(frames.length>0);assert(c.stormAt>=start+18000);
assert.equal(step(0),'autumn');assert.equal(c.dots.length,30);assert.equal(c.stormBolt,null);
assert.equal(step(63,true),'autumn');assert.equal(step(73),'autumn');assert.equal(step(999),'autumn');
c.season='winter';assert.equal(step(0),'winter');assert.equal(c.dots.length,55);assert.equal(step(63),'rain');assert.equal(step(null),'winter');
c.calm.matches=true;step(95);assert.equal(c.canvas.hidden,true);assert.equal(c.photoCanvas.hidden,true);assert.equal(c.particlePainted,false);
c.calm.matches=false;assert.equal(step(95),'thunder');c.S.enabled=false;step(95);assert(c.canvas.hidden);assert(!c.particlePainted);assert(copies>0);
assert(s.includes("const effective=window.ttWeatherParticleKind?.()?'summer':shower.kind"));
console.log('PASS: 13 rain and 3 thunder codes, seasonal transitions, stale/unknown, no retained lightning, all three surfaces, reduced motion, background off, alert shower priority');
