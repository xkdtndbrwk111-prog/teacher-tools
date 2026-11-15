import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MONTHS,parseQuestions,validatePeerChoices,previewCharm} from '../survey/core.mjs';

test('V0.2 nine months retain eight ordered questions',async()=>{
 const q=parseQuestions(await readFile(new URL('../survey/v0.2.md',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(q).map(Number),MONTHS);
 assert.ok(q[3][3].body.includes('다른 친구들의 의견'));
 assert.ok(q[12][7].text.includes('3월의 나에게'));
});
test('peer IDs disallow self, duplicates, outsiders, and excess',()=>{
 const roster=['a','b','c','d'].map(id=>({id}));
 for(const choices of [[{studentId:'a'}],[{studentId:'b'},{studentId:'b'}],[{studentId:'z'}],[{studentId:'b'},{studentId:'c'},{studentId:'d'}]]) assert.throws(()=>validatePeerChoices(choices,'a',roster));
 assert.equal(validatePeerChoices([],'a',roster),true);
});
test('mock survey calculation preserves missing vs zero and original inputs',()=>{
 const roster=['a','b','c','d','e','f'].map(id=>({id}));
 const responses=roster.map((s,i)=>({studentId:s.id,cooperation:[{studentId:i?'a':'b'}],care:[{studentId:i?'a':'b'}],popularity:[{studentId:i?'a':'b'}]}));
 const before=JSON.stringify(responses), result=previewCharm(roster,responses,8);
 assert.equal(result.levels.find(x=>x.studentId==='a').score,1);
 assert.equal(result.levels.find(x=>x.studentId==='a').level,8);
 assert.equal(result.levels.find(x=>x.studentId==='c').level,1);
 assert.equal(JSON.stringify(responses),before);
 responses[0].popularity=null;responses[1].popularity=[];
 assert.equal(previewCharm(roster,responses,4).status,'insufficient');
});
