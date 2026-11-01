import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=p=>readFile(join(root,p),'utf8');
test('대시보드 본문: 중복 학급 생성 CTA와 학급 관리 링크 제거',async()=>{
 const html=await read('grades/index.html');
 const overview=html.split('data-view="overview"')[1].split('data-view="classes"')[0];
 assert.doesNotMatch(overview,/첫 학급 만들기|우리 반 평가, 바로 시작하기|학급 관리 →|get-started/);
 assert.match(overview,/id="overview-classes"/);
 assert.match(overview,/id="overview-assessments"/);
 assert.match(overview,/id="n-classes"/);
});
test('대시보드 오른쪽: 데이터 관리 탭만 노출, 다른 페이지 도구 기능 유지',async()=>{
 const js=await read('grades/app.mjs'),css=await read('grades/mount-guard.css');
 const start=js.indexOf('function updateDock(){');const end=js.indexOf('function activateDock(',start);
 assert.ok(start>=0 && end>start);
 const method=js.slice(start,end);
 assert.match(method,/if\(page==='overview'\)/);
 assert.match(method,/button\.dataset\.dock!=='data'/);
 assert.match(method,/activateDock\('data'\)/);
 assert.match(method,/tabRow\.classList\.remove\('tt-dashboard-data-only'\)/);
 assert.match(method,/if\(page==='classes'\)activateDock\('classes'\)/);
 assert.match(method,/leavingOverview[\s\S]*activateDock\('grades'\)/);
 assert.match(css,/\.dock-tabs\.tt-dashboard-data-only\{grid-template-columns:minmax\(0,1fr\)!important\}/);
});
test('상단 반 관리와 평가 입력 메뉴는 유지',async()=>{
 const host=await read('host/class-ui.js');const html=await read('grades/index.html');
 assert.match(host,/반 관리/);
 assert.match(html,/data-page="assessments"/);
 assert.match(html,/data-page="grades"/);
 assert.match(html,/data-dock="data"/);
 assert.match(html,/data-dock="grades"/);
});
