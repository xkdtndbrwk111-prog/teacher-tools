import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const load=(p)=>readFile(join(root,p),'utf8');
test('공유 학생 목록은 자리배치 실제 DOM 한 개이고 성적 iframe 내부 중복 목록은 숨김',async()=>{
 const host=await load('host/grade-mount.js');const css=await load('host/grade-mount.css');const gradeCss=await load('grades/mount-guard.css');
 assert.match(host,/studio \.student-strip'\)\.before\(panel\)/);
 assert.match(host,/studentCards/);
 assert.match(css,/#teacherScreen>\.studio>\.student-strip/);
 assert.match(gradeCss,/\.student-strip\{display:none!important\}/);
 assert.doesNotMatch(css,/#teacherScreen>\.studio\{display:none/);
});
test('저장 키·상단 학급 선택·수동 백업·원격 차단이 서로 분리',async()=>{
 const ui=await load('host/class-ui.js'),guard=await load('grades/mount-guard.js'),app=await readFile(join(root,'../seating/app.js'),'utf8'),pe=await readFile(join(root,'../seating/pe-v1.js'),'utf8');
 assert.match(ui,/location\.reload\(\)/);assert.match(ui,/crypto\.randomUUID\(\)/);
 assert.match(ui,/guardSnapshot\(\)/);assert.match(ui,/__TT_STAGE031_FLUSH_GRADE/);
 assert.match(app,/__TT_STAGE031_CLASS\.seatingKey/);assert.match(pe,/__TT_STAGE031_CLASS\.peKey/);
 assert.match(guard,/cloud-save/);
});
