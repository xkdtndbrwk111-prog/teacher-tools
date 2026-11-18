// Exercise the actual separate public window. No synthetic visibility toggles.
const assert=require('node:assert/strict');
async function openStudent(p,kind='seating'){
 const pending=p.waitForEvent('popup');
 await p.click('#openPlayback');
 const s=await pending;
 await s.setViewportSize(p.viewportSize()||{width:1920,height:1080});
 await s.locator(kind==='pe'?'#pePitchReveal.is-open':'#playbackScreen:not(.hidden)').waitFor({state:'visible'});
 await s.waitForFunction(()=>!document.getElementById('tt-student-wait'));
 assert.equal(await s.evaluate(()=>window.opener===null),true);
 assert.equal(await s.locator('#teacherScreen').isVisible(),false);
 assert.equal(await s.locator('#backToTeacher,#simpleBackToTeacher,#pePitchBack').count(),0);
 await p.waitForFunction(()=>window.__TT_STUDENT_POPUP?.isPresenting());
 return s;
}
module.exports={openStudent};
