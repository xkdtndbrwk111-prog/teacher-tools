import assert from 'node:assert/strict';
import {question,defaults,shuffle,validateEntry,checkReady} from '../hanja/engine.js';
import {readStudents} from '../shared/student-registry.js';
const db=[{id:'1',type:'single',text:'山',reading:'산',meaning:'메',weight:1,enabled:true},{id:'2',type:'single',text:'水',reading:'수',meaning:'물',weight:3,enabled:true},{id:'3',type:'word',text:'山水',reading:'산수',meaning:'산과 물',weight:1,enabled:true},{id:'4',type:'word',text:'火山',reading:'화산',meaning:'불 산',weight:1,enabled:false}];
for(const e of db)validateEntry(e);
assert.throws(()=>validateEntry({...db[0],text:'山水'}));assert.throws(()=>validateEntry({...db[0],weight:0}));assert.throws(()=>checkReady([db[0]],defaults));
let last=null;const directions=new Set(),orders=new Set();for(let i=0;i<300;i++){const q=question(db,{...defaults,direction:'both'},last);assert.notEqual(q.id,last);last=q.id;assert(q.options.includes(q.answer));assert.equal(new Set(q.options).size,q.options.length);directions.add(q.direction);if(q.type==='word')assert(!q.options.includes('메 산'));orders.add(shuffle([1,2,3]).join())}assert.equal(directions.size,2);assert(orders.size>1);
assert.equal(question(db,{...defaults,target:'single'},null,()=>.9).id,'2');assert.equal(question([db[0]],{...defaults,mode:'manual'},'1').id,'1');
let writes=0;const students=readStudents({getItem:()=>JSON.stringify({students:[{id:'s1',name:'학생',gender:'male'}]}),setItem:()=>writes++});assert.equal(writes,0);assert(Object.isFrozen(students));assert(Object.isFrozen(students[0]));assert.deepEqual(Object.keys(students[0]),['id','name','sprite']);console.log('PASS engine types, weights, directions, repeats, insufficient choices, shuffle, read-only registry');
