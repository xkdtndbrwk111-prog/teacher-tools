import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=rel=>readFile(join(root,rel),'utf8');
test('반 관리: 기존 반 목록·일괄 추가·중앙 모달',async()=>{
 const js=await read('host/class-ui.js'),css=await read('host/class-ui.css');
 assert.match(js,/id='tt-class-modal'/);
 assert.match(js,/id="tt-class-existing"/);
 assert.match(js,/id="tt-class-names"/);
 assert.match(js,/namesInput.value.split/);
 assert.match(js,/tt-class-generate/);
 assert.match(js,/createButton.addEventListener/);
 assert.match(css,/\.tt-class-modal\{position:fixed;inset:0;z-index:/);
 assert.match(css,/align-items:center;justify-content:center/);
});
test('중복 이름 및 30개 제한·반 삭제 시 성적/좌석 삭제 경고',async()=>{
 const js=await read('host/class-ui.js');
 assert.match(js,/new Set\(names.map\(norm\)\).size/);
 assert.match(js,/active.length\+added.length>30/);
 assert.match(js,/tt-class-delete-final/);
 assert.match(js,/classStore\.commit/);
 assert.match(js,/guardSnapshot\(\)/);
});
test('공통 작업공간·우측 패널·하단 학생목록은 화면 내용이 적어도 고정 격자',async()=>{
 const host=await read('host/grade-mount.css'),grade=await read('grades/mount-guard.css');
 assert.match(host,/#teacherScreen>\.studio\{display:grid!important;flex:1 1 auto!important;height:auto!important/);
 assert.match(host,/grid-template-columns:minmax\(0,1fr\) 340px!important;grid-template-rows:minmax\(0,1fr\) 158px!important/);
 assert.match(host,/\.student-strip\{grid-column:1\/-1!important;grid-row:2!important;height:158px!important/);
 assert.match(host,/\.student-collapsed>\.student-strip\{height:42px!important/);
 assert.match(grade,/#app\.teacher-screen\{display:flex!important;flex-direction:column!important;height:100%!important/);
 assert.match(grade,/#app>\.studio>\.workspace-column>\.workspace\{flex:1 1 auto!important;height:0!important/);
 assert.match(grade,/#app>\.studio>\.tool-dock>\.dock-body\{flex:1 1 auto!important;height:0!important/);
});
