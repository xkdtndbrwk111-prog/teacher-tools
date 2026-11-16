import {validatePublicSurveyUrl} from './life-public-url.mjs';
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Error('학생 발표 자료 형식이 올바르지 않습니다.')};
const str=(v,max=128)=>{if(typeof v!=='string'||!v||v.length>max)fail();return v};
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail();return v};
const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v};
const unique=v=>{if(new Set(v).size!==v.length)fail()};
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fail();
const spritePattern=/\/(boy1|boy2|girl|trav|prin)_(brown|black)_(green|blue|red|yellow|purple|orange)\.png$/;
// Both producer and offline consumer use the same path and only shipped sprites.
function sprite(v,base){
 const u=new URL(str(v,512),base);const match=u.pathname.match(spritePattern);
 if(!match||u.search||u.hash||u.username||u.password||!u.pathname.includes('/shared/assets/students/'))fail();
 const allowed=new Set([new URL(base).origin,'https://xkdtndbrwk111-prog.github.io','http://127.0.0.1:4188','http://localhost:4188','http://127.0.0.1:4192','http://localhost:4192']);
 if(!allowed.has(u.origin))fail();return '../shared/assets/students/'+match[0].slice(1);
}
const id=v=>str(v,128);
const avatar=v=>{
 if(!obj(v)||!['male','female'].includes(v.gender))fail();
 const out={gender:v.gender};for(const [k,max] of Object.entries({skin:3,eyes:2,hair:5,hairColor:2,glasses:10,beard:8,outfit:6}))out[k]=integer(v[k],0,max);
 // Known avatar configuration bounds: a malformed payload must not crash rendering.
 return out;
};
export function normalizePresentation(data,base){
 if(!obj(data)||!obj(data.payload))fail();const p=data.payload;
 if(data.kind==='life-qr'){
  const validated=validatePublicSurveyUrl(p);
  return {kind:'life-qr',payload:{url:validated.url,year:p.year,month:p.month,className:str(p.className||'우리 반',100),open:p.open===true}};
 }
 if(data.kind==='pe'){
  const teams=array(p.teams,6);if(teams.length<2)fail();
  const clean=teams.map(group=>{const members=array(group,80);if(!members.length)fail();return members.map(m=>({id:id(m.id),name:str(m.name,100),src:sprite(m.src,base)}))});
  unique(clean.flat().map(s=>s.id));return {kind:'pe',payload:{teams:clean,surface:p.surface==='dirt'?'dirt':'grass',showLines:p.showLines===true}};
 }
 if(data.kind!=='seating'||!obj(p.layout))fail();
 const rows=integer(p.layout.rows,2,12),cols=integer(p.layout.cols,2,12),cells=array(p.layout.cells,144).map(cell=>({
  id:id(cell.id),row:integer(cell.row,0,rows-1),col:integer(cell.col,0,cols-1),type:['seat','male','female','aisle','unused'].includes(cell.type)?cell.type:fail()
 }));
 unique(cells.map(x=>x.id));unique(cells.map(x=>x.row+':'+x.col));if(cells.length!==rows*cols)fail();
 const seats=new Set(cells.filter(x=>['seat','male','female'].includes(x.type)).map(x=>x.id));
 const students=array(p.students,80).map(s=>({id:id(s.id),name:str(s.name,100),visual:sprite(s.visual,base),glasses:['none','red','black','brown','navy','pink','gray'].includes(s.glasses)?s.glasses:'none'}));
 const ids=new Set(students.map(s=>s.id));if(ids.size!==students.length||!students.length)fail();
 const assignments=array(p.assignments,80).map(x=>({studentId:id(x.studentId),seatId:id(x.seatId)}));
 if(assignments.length!==students.length||assignments.some(x=>!ids.has(x.studentId)||!seats.has(x.seatId)))fail();
 unique(assignments.map(x=>x.studentId));unique(assignments.map(x=>x.seatId));
 const previousAssignments=array(p.previousAssignments||[],80).filter(x=>ids.has(x.studentId)&&seats.has(x.seatId)).map(x=>({studentId:id(x.studentId),seatId:id(x.seatId)}));
 unique(previousAssignments.map(x=>x.studentId));unique(previousAssignments.map(x=>x.seatId));
 const groups=array(p.groups||[],80).map(g=>({id:id(g.id),name:str(g.name,100),color:color(g.color),seatIds:array(g.seatIds,384).map(id).filter(x=>seats.has(x))}));
 const pairReactions=array(p.pairReactions||[],80).map(r=>({seatIds:array(r.seatIds,2).map(id),line:str(r.line,100)})).filter(r=>r.seatIds.length===2&&r.seatIds.every(s=>seats.has(s)));
 return {kind:'seating',payload:{layout:{rows,cols,cells},students,assignments,groups,pairReactions,historyTransition:p.historyTransition===true,previousAssignments,previousRound:Number.isInteger(p.previousRound)?p.previousRound:null,teacherAvatar:avatar(p.teacherAvatar),className:str(p.className||'우리 반',100)}};
}
export const encodePresentation=value=>{
 const bytes=new TextEncoder().encode(JSON.stringify(value));if(bytes.length>180000)fail();let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
};
