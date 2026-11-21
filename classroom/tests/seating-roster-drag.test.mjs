import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../seating/app.js',import.meta.url),'utf8');
const first=source.indexOf('function bindRosterDrag(card){');
const last=source.indexOf('\n/* Same name keeps its student ID.',first);
assert.ok(first>=0&&last>first,'Unified pointer-drag function must be present');
const drag=source.slice(first,last);
const createDrag=new Function(
  'document','window','$','groupEdit','usableCells','renderStudentStrip',
  'setAssignmentStatus','assignFixedSeat','reorderStudentsByIds','setTimeout','historyView',
  drag+'\nreturn bindRosterDrag'
);
function classes(initial=[]){
 const values=new Set(initial);
 return{add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};
}
function simulate(kind){
 const actions=[],nodes=[],listeners={};
 const seat={dataset:{seatId:'S1'},classList:classes(),closest:selector=>selector==='.layout-cell'?seat:null};
 const container={
  querySelectorAll:()=>nodes,
  getBoundingClientRect:()=>({left:0,right:400,top:300,bottom:400}),
  insertBefore(node,next){
   const old=nodes.indexOf(node);if(old>=0)nodes.splice(old,1);
   const index=next?nodes.indexOf(next):nodes.length;
   nodes.splice(index<0?nodes.length:index,0,node);
  },
  scrollLeft:0
 };
 const document={
  body:{classList:classes(),append(){}},hidden:false,
  elementFromPoint:(x,y)=>y<250&&x<300?seat:null,
  addEventListener(){},removeEventListener(){},
  createElement:()=>({
   className:'',textContent:'',style:{},classList:classes(),
   append(){},setAttribute(){},remove(){},
   getBoundingClientRect:()=>({width:150,height:65})
  })
 };
 const window={
  addEventListener:(name,callback)=>{listeners[name]=callback},
  removeEventListener:(name,callback)=>{if(listeners[name]===callback)delete listeners[name]}
 };
 const cardFor=id=>({
  dataset:{studentId:id},classList:classes(id==='A'&&kind==='excluded'?['assignment-excluded']:[]),events:{},
  addEventListener(name,callback){this.events[name]=callback},
  querySelector:selector=>({textContent:selector.includes('number')?'1':'학생 '+id}),
  setPointerCapture(){this.captured=true},
  hasPointerCapture(){return !!this.captured},
  releasePointerCapture(){this.captured=false},
  getBoundingClientRect(){return{left:nodes.indexOf(this)*100,width:100}},
  get nextSibling(){return nodes[nodes.indexOf(this)+1]||null},
  get isConnected(){return true}
 });
 const a=cardFor('A');nodes.push(a,cardFor('B'),cardFor('C'));
 const grid={contains:element=>element===seat};
 const bind=createDrag(
  document,window,id=>id==='studentCards'?container:id==='layoutGrid'?grid:null,{active:false},
  ()=>[{id:'S1'}],()=>actions.push(['restore']),message=>actions.push(['message',message]),
  (id,seatId)=>actions.push(['pin',id,seatId]),
  ids=>{actions.push(['order',...ids]);return true},()=>0,null
 );
 bind(a);
 const event=(x,y)=>({
  clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:1,
  isPrimary:true,target:{closest:()=>null},preventDefault(){}
 });
 a.events.pointerdown(event(45,350));
 const [x,y]=kind==='seat'||kind==='excluded'?[160,100]
  :kind==='roster'?[285,350]:kind==='cancel'?[490,200]:[46,352];
 if(kind!=='click')listeners.pointermove(event(x,y));
 const moving=a.classList.contains('roster-moving');
 listeners.pointerup(event(x,y));
 return{moving,actions};
}
test('student card drags immediately to a valid seat',()=>{
 assert.deepEqual(simulate('seat').actions,[['pin','A','S1']]);
});
test('student card dropped inside student strip changes attendance order',()=>{
 assert.deepEqual(simulate('roster').actions,[['order','B','C','A']]);
});
test('dropping outside roster and seats cancels without changing data',()=>{
 assert.deepEqual(simulate('cancel').actions,[['restore']]);
});
test('a simple click must not start dragging or change stored data',()=>{
 const result=simulate('click');assert.equal(result.moving,false);assert.deepEqual(result.actions,[]);
});
test('excluded student cannot be assigned to a fixed seat',()=>{
 const actions=simulate('excluded').actions;
 assert.equal(actions.some(action=>action[0]==='pin'),false);
 assert.equal(actions.some(action=>action[0]==='message'),true);
});
test('visible fixed-seat unpin and owner safety guard remain wired',()=>{
 assert.match(source,/class="seat-unpin"/);
 assert.match(source,/unpin\.onclick=event/);
 assert.match(source,/const owner=classState\.students\.find/);
 assert.doesNotMatch(source,/bindRosterLongPress|card\.ondragstart=event/);
});
