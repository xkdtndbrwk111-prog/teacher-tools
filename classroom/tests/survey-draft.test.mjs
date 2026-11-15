import test from 'node:test';import assert from 'node:assert/strict';
import {applyDraftValues,createDraftCipher,draftKey,draftOwner} from '../survey/draft-store.mjs';

test('draft key isolates year, class, student, month and survey version',()=>{
 const base={ownerId:'teacher-a',year:2026,classId:'class-a',studentId:'student-a',month:5,version:'V0.2'};
 const keys=[draftKey(base),draftKey({...base,ownerId:'teacher-b'}),draftKey({...base,year:2025}),draftKey({...base,classId:'class-b'}),draftKey({...base,studentId:'student-b'}),draftKey({...base,month:6}),draftKey({...base,version:'V0.3'})];
 assert.equal(new Set(keys).size,keys.length);assert.deepEqual(draftOwner(base),base);
});

test('draft owner rejects malformed scope',()=>{
 assert.throws(()=>draftKey({ownerId:'t',year:2026,classId:'',studentId:'s',month:5,version:'V0.2'}));
 assert.throws(()=>draftKey({ownerId:'t',year:2026,classId:'c',studentId:'s',month:8,version:'V0.2'}));
});

test('draft response values use fresh salt and nonce and only the same student code decrypts them',async()=>{const scope={ownerId:'teacher-a',year:2026,classId:'class-a',studentId:'student-a',month:5,version:'V0.2'},values={'1':'선택','3':'가상 서술'};const cipher=await createDraftCipher(scope,'synthetic-student-code-a'),first=await cipher.seal(values),second=await cipher.seal(values);assert.doesNotMatch(JSON.stringify(first),/가상 서술/);assert.notEqual(first.salt,second.salt);assert.notEqual(first.iv,second.iv);assert.deepEqual(await cipher.open(first),values);assert.deepEqual(await cipher.open(second),values);const other=await createDraftCipher(scope,'synthetic-student-code-b');await assert.rejects(()=>other.open(first))});

test('new six digit code can protect an encrypted draft while malformed short codes are rejected',async()=>{const scope={ownerId:'teacher-a',year:2026,classId:'class-a',studentId:'student-a',month:5,version:'V0.2'},values={'1':'선택'};const cipher=await createDraftCipher(scope,'004281'),sealed=await cipher.seal(values);assert.deepEqual(await cipher.open(sealed),values);await assert.rejects(()=>createDraftCipher(scope,'12345'))});

test('draft values do not restore unknown select options',()=>{
 const select={name:'peer-4-0',tagName:'SELECT',type:'select-one',disabled:false,value:'',options:[{value:''},{value:'student-a'}]},textarea={name:'3',tagName:'TEXTAREA',type:'textarea',disabled:false,value:''},form={elements:[select,textarea]};
 assert.equal(applyDraftValues(form,{'peer-4-0':'student-outside','3':'가상 답변'}),true);assert.equal(select.value,'');assert.equal(textarea.value,'가상 답변');
});
