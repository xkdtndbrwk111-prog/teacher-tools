import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,addClass,addStudent,addAssessment,setGrade,getGrade,validateWorkspace,roster,levelsOf,classAssessmentDistribution} from '../grades/model.mjs';
import {encodeTables,decodeTables} from '../grades/sheet-codec.mjs';
import {parseAiAnswer,aiPrompt,filterGrade,subjectOf,readPlanFile} from '../grades/plan-reader.mjs';
import {schoolCodeFromUrl,relay} from '../grades/plan-relay.mjs';

function ws(){
 const m=fresh(2026),c=addClass(m,'우리 반');for(let i=0;i<6;i++)addStudent(m,c.id,'학생'+i);
 const a=addAssessment(m,{title:'2. 올바른 문장으로 글을 써요',subject:'국어',criterion:'호응 관계',gradeType:'level',classIds:[c.id],customLevels:['상','중','하'],levelNotes:{상:'잘 쓴다',중:'쓴다',하:'간단히 쓴다'},plan:{code:'[6국04-04]',period:'10월',method:['서술·논술형 평가'],school:'시험초등학교'}});
 return {m,c,a,people:roster(m,c.id)};
}
test('학교 단계 이름으로 평가를 만들고 그 이름으로만 입력된다',()=>{
 const {m,a,people}=ws();const c=m.criteria.find(x=>x.assessmentId===a.id);
 assert.deepEqual(levelsOf(c),['상','중','하']);assert.equal(c.levelNotes.상,'잘 쓴다');assert.equal(c.plan.code,'[6국04-04]');
 setGrade(m,a.id,people[0].id,'상');assert.equal(getGrade(m,a.id,people[0].id),'상');
 assert.throws(()=>setGrade(m,a.id,people[1].id,'잘함'),/상·중·하/);
 assert.equal(validateWorkspace(m),true);
 ['상','중','하','상','중','하'].forEach((v,i)=>setGrade(m,a.id,people[i].id,v));
 const d=classAssessmentDistribution(m,a.id,people[0].classId);assert.equal(d.status,'ok');assert.ok(d.records[0].z>d.records[2].z);
 assert.throws(()=>addAssessment(m,{title:'x',subject:'x',gradeType:'level',classIds:[people[0].classId],customLevels:['상','상','하']}),/단계 이름/);
});
test('구글 시트로 저장하고 다시 읽어도 단계 이름·설명·평가 정보가 남는다 (시트 열은 그대로)',()=>{
 const {m,a,people}=ws();setGrade(m,a.id,people[0].id,'중');
 const back=decodeTables(encodeTables(m,'sub-1','rev-12345'),2026,'sub-1').workspace;
 const c=back.criteria.find(x=>x.assessmentId===a.id);
 assert.equal(c.custom,true);assert.deepEqual(c.levels,['상','중','하']);assert.equal(c.levelNotes.하,'간단히 쓴다');assert.equal(c.plan.period,'10월');
 assert.equal(getGrade(back,a.id,people[0].id),'중');
});
test('AI 답 읽기: 앞뒤 설명이 붙어도 JSON만 읽고, 잘못된 단계는 알려 준다',()=>{
 const items=parseAiAnswer('여기 결과입니다\n{"format":"tt.plan.v1","items":[{"subject":"","code":"[6수 03-02]","unit":"3. 합동과 대칭","element":"대칭 그리기","levels":[{"name":"잘함","note":"a"},{"name":"보통","note":"b"},{"name":"노력요함","note":"c"}]}]}\n끝');
 assert.equal(items[0].subject,'수학');assert.equal(items[0].code,'[6수03-02]');
 assert.throws(()=>parseAiAnswer('{"items":[{"levels":[{"name":"상"}]}]}'),/단계/);
 assert.throws(()=>parseAiAnswer('없음'),/JSON/);
 assert.match(aiPrompt({grade:'5',semester:'2'}),/5학년 2학기/);
 assert.equal(subjectOf('[5과함께환경01-01]'),'과함께환경');assert.equal(subjectOf('[5과함께환경01-01]','환경과 함께하는 우리(5학년) 교수학습 및 평가 계획'),'환경과 함께하는 우리(5학년)');
 assert.deepEqual(filterGrade([{code:'[6국01-01]'},{code:'[4국01-01]'},{code:''}],5).map(x=>x.code),['[6국01-01]','']);
});
test('학교알리미 주소에서 학교 코드를 꺼내고, 첫 중계가 죽으면 두 번째로 넘어간다',async()=>{
 assert.equal(schoolCodeFromUrl('https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?HG_CD=C100000644&x=1'),'C100000644');
 assert.equal(schoolCodeFromUrl('…SHL_IDF_CD=f62c7c1b-5b4c-43a2-843c-22206c787473'),'f62c7c1b-5b4c-43a2-843c-22206c787473');
 assert.equal(schoolCodeFromUrl('https://example.com'),'');
 const calls=[];const real=globalThis.fetch;
 globalThis.fetch=async url=>{calls.push(String(url));if(String(url).startsWith('https://a'))return new Response('{"error":"RELAY_FAILED"}',{status:502});return new Response('{"files":[]}',{status:200});};
 try{assert.deepEqual(await relay({action:'plans',code:'C100000644'},{relays:['https://a/x','https://b/x']}),{files:[]});assert.equal(calls.length,2);
  calls.length=0;globalThis.fetch=async()=>new Response('{"error":"CODE"}',{status:400});
  await assert.rejects(relay({action:'plans',code:'bad'},{relays:['https://a/x','https://b/x']}),/학교 코드/);
 }finally{globalThis.fetch=real;}
});
test('PDF·압축 파일은 이유를 알려 주고 AI 정리로 넘긴다',async()=>{
 const pdf=await readPlanFile('a.pdf',new TextEncoder().encode('%PDF-1.7 ...'));assert.equal(pdf.kind,'pdf');assert.match(pdf.reason,/PDF/);
 const zip=await readPlanFile('a.zip',new Uint8Array([0x50,0x4b,3,4]));assert.equal(zip.kind,'zip');
});
test('평가마다 학기를 저장하고, 학기 열이 없던 예전 시트도 그대로 읽는다',async()=>{
 const {inSemester}=await import('../grades/model.mjs');
 const {m,c}=ws();
 const a1=addAssessment(m,{title:'1단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[c.id],semester:'1'});
 assert.equal(a1.semester,'1');assert.equal(inSemester(a1,'2'),false);assert.equal(inSemester({},'2'),true,'학기 미정은 두 학기 모두');
 assert.throws(()=>addAssessment(m,{title:'x',subject:'x',criterion:'점수',maxScore:10,classIds:[c.id],semester:'3'}),/학기/);
 const tables=encodeTables(m,'sub-1','rev-12345');
 assert.deepEqual(tables.TT_ASSESSMENTS[0],['id','title','subject','classIdsJSON','metaJSON']);
 assert.equal(decodeTables(tables,2026,'sub-1').workspace.assessments.find(x=>x.id===a1.id).semester,'1');
 // A sheet saved before the column existed: 4 header cells, rows without the 5th value.
 const old=structuredClone(tables);old.TT_ASSESSMENTS=old.TT_ASSESSMENTS.map(r=>r.slice(0,4));
 const back=decodeTables(old,2026,'sub-1').workspace;assert.equal(back.assessments.length,m.assessments.length);assert.equal(back.assessments[0].semester,undefined);
});
