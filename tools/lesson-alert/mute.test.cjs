const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../runtime-src/system/dashboard.html'),'utf8');
const between=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+1);assert.ok(start>=0&&end>start,a);return html.slice(start,end)};
test('temporary mute uses Seoul dates, survives reload, expires next day and can be undone',()=>{
 const data=new Map();let date='2026-11-19',stopped=0,render=0;
 const ctx=vm.createContext({localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},seoulClock:()=>({date}),alertMuteToday:{checked:false},window:{dispatchEvent:()=>stopped++,ttSound:{refresh(){}}},Event:class{},renderAlertSettings:()=>render++,alertStatus:{},lessonAlertSettings:{enabled:false}});
 const code=between("const lessonAlertMuteDayKey=","let lessonAlertSettings=");
 const handler=between("alertMuteToday.onchange=()=>{","window.addEventListener('storage'");
 // The source declares its regular preferences below the mute helpers.
 vm.runInContext(code,ctx);vm.runInContext(handler,ctx);
 assert.equal(vm.runInContext('lessonAlertsMutedToday()',ctx),false);
 vm.runInContext('alertMuteToday.checked=true;alertMuteToday.onchange()',ctx);
 assert.equal(data.get('teacher-lesson-alert-mute-day'),date);
 assert.equal(vm.runInContext('lessonAlertsMutedToday()',ctx),true);assert.equal(stopped,1);
 vm.runInContext("lessonAlertMuteDay=localStorage.getItem(lessonAlertMuteDayKey)",ctx);
 date='2026-11-20';assert.equal(vm.runInContext('lessonAlertsMutedToday()',ctx),false);
 vm.runInContext('syncLessonAlertMute()',ctx);assert.equal(ctx.alertMuteToday.checked,false);
 vm.runInContext('alertMuteToday.checked=true;alertMuteToday.onchange();alertMuteToday.checked=false;alertMuteToday.onchange()',ctx);
 assert.equal(data.has('teacher-lesson-alert-mute-day'),false);
});
test('all automatic lesson alert entry points consult the date override',()=>{
 for(const fragment of ['if(!item||document.hidden||lessonAlertsMutedToday()','if(muted||!lessonAlertSettings.enabled','if(played!==true||lessonAlertsMutedToday())return false','function startFuse(seconds){if(lessonAlertsMutedToday())return','function startShower(kind=seasonNow()){if(lessonAlertsMutedToday())return','if(kind===\'alert\')return !lessonAlertsMutedToday()','if(lessonAlertsMutedToday()||e.detail?.lead!==2'])assert.ok(html.includes(fragment),fragment);
 assert.ok(html.includes('teacher-lesson-alert-mute-day'));assert.ok(!html.match(/(?:backupKeys|fullKeys|reusableKeys)=\[[^\]]*teacher-lesson-alert-mute-day/));
});
