const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../runtime-src/system/dashboard.html'),'utf8');
const between=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+1);assert.ok(start>=0&&end>start,a);return html.slice(start,end)};
test('single persistent schedule switch is checked when alerts are enabled',()=>{
 const header=between('<section class="card" data-widget="week">','<div id="week"');
 assert.match(header,/id="lessonAlertEnabled" type="checkbox" role="switch"/);
 assert.equal((html.match(/id="lessonAlertEnabled"/g)||[]).length,1);
 assert.ok(!/lessonAlertMuteToday|lessonAlertMuteDay|오늘만 모든 알림 없음/.test(html));
 const data=new Map();let stopped=0;
 const ctx=vm.createContext({localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},document:{body:{classList:{contains:()=>false}}},alertToggle:{checked:true},alertStatus:{},window:{dispatchEvent:()=>stopped++,ttSound:{refresh(){}}},Event:class{},renderAlertSettings(){},unlockLessonAudio(){}});
 const init=between("const lessonAlertPreferenceKey=","let lessonAudio=");
 vm.runInContext(init,ctx);vm.runInContext(between("function saveAlertSettings()","window.addEventListener('storage'"),ctx);
 vm.runInContext('alertToggle.checked=false;alertToggle.onchange()',ctx);
 assert.equal(JSON.parse(data.get('teacher-lesson-alert-settings')).enabled,false);assert.equal(stopped,1);
 const reload=vm.createContext({localStorage:ctx.localStorage});vm.runInContext(init,reload);assert.equal(vm.runInContext('lessonAlertSettings.enabled',reload),false);
 vm.runInContext('alertToggle.checked=true;alertToggle.onchange()',ctx);assert.equal(JSON.parse(data.get('teacher-lesson-alert-settings')).enabled,true);
});
test('master switch gates audio, effects and character reaction',()=>{
 for(const fragment of ["if(!item||document.hidden||!lessonAlertSettings.enabled","if(!lessonAlertSettings.enabled||document.hidden","if(played!==true||!lessonAlertSettings.enabled)return false","function startFuse(seconds){if(!lessonAlertSettings.enabled)return","function startShower(kind=seasonNow()){if(!lessonAlertSettings.enabled)return","if(kind==='alert')return lessonAlertSettings.enabled","if(!lessonAlertSettings.enabled||e.detail?.lead!==2"])assert.ok(html.includes(fragment),fragment);
});
