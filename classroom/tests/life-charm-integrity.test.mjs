import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual bridge method with an isolated, synthetic commit boundary.
// This is not a browser or IndexedDB end-to-end test.
const source=await readFile(new URL('../../seating/pe-v1.js',import.meta.url),'utf8');
const start=source.indexOf('  async applyApprovedCharm('),end=source.indexOf('\n};\nfunction loadPEState',start);
assert.ok(start>0&&end>start);
for(const scale of [4,8])test(`${scale} levels: one charm update; commit failure preserves data`,async()=>{
  const ids=Array.from({length:25},(_,i)=>`synthetic-${i+1}`),axes=['leadership','intelligence','stamina','charm','initiative'];
  const initial=Object.fromEntries(ids.map((id,i)=>[id,{traits:Object.fromEntries(axes.map((key,j)=>[key,1+(i+j)%scale])),fixedTeam:0}]));
  const other={student:{traits:{leadership:1,intelligence:1,stamina:1,charm:1,initiative:1}}};
  const store=new Map([['class-A',JSON.stringify(initial)],['class-B',JSON.stringify(other)]]);
  let fail=false;
  const ctx={structuredClone,JSON,Set,Array,Date,Error,peState:structuredClone(initial),classState:{students:ids.map(id=>({id}))},PE_KEY:'class-A',mode:'classroom',traitScale:()=>scale,traitSettings:()=>({modes:{charm:'manual'}}),traitLevels:()=>Array.from({length:scale},(_,i)=>i+1),renderStudentInspector:()=>{},renderPE:()=>{},window:{__TT_STAGE031_CLASS:{activeId:'A'},__TT_STORE:{commit:async({put})=>{if(fail)throw Error('synthetic commit failure');for(const [key,value] of put)store.set(key,value)}}}};
  vm.createContext(ctx);
  const bridge=vm.runInContext(`({${source.slice(start,end)}})`,ctx);
  const before=JSON.parse(store.get('class-A')),otherBefore=store.get('class-B'),id=ids[0],expected=before[id].traits.charm,value=expected===scale?1:expected+1;
  await bridge.applyApprovedCharm({classId:'A',scale,changes:[{id,expected,value}]});
  const after=JSON.parse(store.get('class-A'));
  assert.equal(after[id].traits.charm,value);
  for(const studentId of ids)for(const axis of axes)if(studentId!==id||axis!=='charm')assert.equal(after[studentId].traits[axis],before[studentId].traits[axis],`${studentId} ${axis}`);
  assert.equal(store.get('class-B'),otherBefore);
  const committed=store.get('class-A');fail=true;
  await assert.rejects(bridge.applyApprovedCharm({classId:'A',scale,changes:[{id,expected:value,value:expected}]}),/synthetic commit failure/);
  assert.equal(store.get('class-A'),committed);
  assert.equal(ctx.peState[id].traits.charm,value);
});
