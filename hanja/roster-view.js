// Hanja Manager's read-only view of Classroom Manager students.
// Only the Hanja-specific participation set may change.
export function renderHanjaRoster({root,students,excluded,onToggle,glassesSrc}){
 root.replaceChildren();
 if(!students.length){
  const empty=document.createElement("div");empty.className="hanja-roster-empty";
  const label=document.createElement("span");
  label.textContent="등록된 학생이 없습니다. 교실매니저에서 명단을 등록하면 여기에 표시됩니다.";
  const link=document.createElement("a");link.href="../seating/";link.textContent="교실매니저에서 명단 관리";
  empty.append(label,link);root.append(empty);return;
 }
 students.forEach((student,index)=>{
  const isExcluded=excluded.has(student.id),gender=["male","female"].includes(student.gender)?student.gender:"none";
  const card=document.createElement("div");
  card.className="hanja-student shared-student-card gender-"+gender+(isExcluded?" assignment-excluded":"");
  card.dataset.studentId=student.id;card.dataset.studentName=student.name;card.dataset.studentNumber=String(index+1);
  card.tabIndex=0;card.setAttribute("role","button");
  card.setAttribute("aria-pressed",String(!isExcluded));
  card.setAttribute("aria-label",String(index+1)+"번 "+student.name+(isExcluded?" · 이번 수업 제외":" · 이번 수업 참가")+". 클릭하면 참가 여부 변경");
  const number=document.createElement("span");
  number.className="shared-student-number";number.textContent=String(index+1);
  number.title="교실매니저의 학생 명단 순서 · 한자매니저에서는 번호 변경 불가";
  const sprite=document.createElement("span");
  sprite.className="hanja-sprite shared-student-sprite";
  sprite.style.backgroundImage='url("'+student.sprite+'")';
  sprite.dataset.hanjaGlasses=student.visual?.glasses||"none";
  const glasses=glassesSrc(sprite.dataset.hanjaGlasses);
  sprite.style.setProperty("--student-glasses-image",glasses?'url("'+glasses+'")':"none");
  const name=document.createElement("span");name.className="shared-student-name";name.textContent=student.name;
  const status=document.createElement("button");status.type="button";status.className="shared-student-status";
  status.textContent=isExcluded?"제외":"참가";
  status.setAttribute("aria-label",student.name+(isExcluded?" 수업에 다시 참가":" 수업에서 제외"));
  status.title=isExcluded?"클릭하면 이번 한자 수업에 참가":"클릭하면 이번 한자 수업에서 제외";
  const toggle=()=>onToggle(student.id,card);
  card.onclick=toggle;
  card.onkeydown=event=>{if(event.target!==card)return;if(event.key==="Enter"||event.key===" "){event.preventDefault();toggle()}};
  status.onclick=event=>{event.stopPropagation();toggle()};
  card.oncontextmenu=event=>{event.preventDefault();toggle()};
  card.append(number,sprite,name,status);root.append(card);
 });
}
export function syncHanjaRosterScrollbar(scroller,track,thumb){
 if(!scroller||!track||!thumb)return;
 const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth),overflow=max>1&&scroller.clientWidth>0;
 track.hidden=!overflow;
 if(!overflow){thumb.style.width="100%";thumb.style.transform="translateX(0px)";track.setAttribute("aria-valuenow","0");return}
 const width=track.clientWidth||scroller.clientWidth;
 const thumbWidth=Math.max(52,Math.min(width,width*scroller.clientWidth/scroller.scrollWidth));
 const fraction=Math.max(0,Math.min(1,scroller.scrollLeft/max));
 thumb.style.width=thumbWidth+"px";
 thumb.style.transform="translateX("+fraction*(width-thumbWidth)+"px)";
 track.setAttribute("aria-valuenow",String(Math.round(fraction*100)));
 track.setAttribute("aria-valuetext",Math.round(fraction*100)+"퍼센트 이동");
}
// Mirrors the Classroom Manager roster's mouse-wheel-to-horizontal-scroll behavior.
// Keep wheel events native when there is no overflow or no horizontal movement.
export function bindHanjaRosterWheel(scroller){
 if(!scroller||scroller.dataset.wheelBound==="1")return;
 scroller.dataset.wheelBound="1";
 scroller.addEventListener("wheel",event=>{
  if(scroller.scrollWidth<=scroller.clientWidth)return;
  const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
  if(!delta)return;
  const before=scroller.scrollLeft;
  scroller.scrollLeft+=delta;
  if(scroller.scrollLeft!==before)event.preventDefault();
 },{passive:false});
}
export function bindHanjaRosterScrollbar(scroller,track,thumb){
 if(!scroller||!track||!thumb||track.dataset.bound==="1")return;
 track.dataset.bound="1";
 bindHanjaRosterWheel(scroller);
 let pointer=null,offset=0,originalBehavior="",pending=false;
 const maxScroll=()=>Math.max(0,scroller.scrollWidth-scroller.clientWidth);
 const sync=()=>syncHanjaRosterScrollbar(scroller,track,thumb);
 const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;sync()})};
 const setAt=x=>{
  if(track.hidden)return;
  const rect=track.getBoundingClientRect(),distance=Math.max(1,rect.width-thumb.offsetWidth);
  scroller.scrollLeft=Math.max(0,Math.min(1,(x-rect.left-offset)/distance))*maxScroll();sync();
 };
 track.addEventListener("pointerdown",event=>{
  if(track.hidden||(event.pointerType==="mouse"&&event.button!==0))return;
  event.preventDefault();
  const rect=thumb.getBoundingClientRect();
  offset=thumb.contains(event.target)?event.clientX-rect.left:rect.width/2;
  originalBehavior=scroller.style.scrollBehavior;scroller.style.scrollBehavior="auto";
  pointer=event.pointerId;track.setPointerCapture?.(event.pointerId);setAt(event.clientX);
 });
 track.addEventListener("pointermove",event=>{if(pointer===event.pointerId)setAt(event.clientX)});
 const end=event=>{if(pointer!==event.pointerId)return;pointer=null;scroller.style.scrollBehavior=originalBehavior;sync()};
 track.addEventListener("pointerup",end);track.addEventListener("pointercancel",end);
 track.addEventListener("lostpointercapture",()=>{if(pointer!==null){pointer=null;scroller.style.scrollBehavior=originalBehavior;sync()}});
 track.addEventListener("keydown",event=>{
  const max=maxScroll();if(!max)return;
  let next=scroller.scrollLeft;
  switch(event.key){
   case "ArrowLeft":next-=Math.max(45,scroller.clientWidth*.12);break;
   case "ArrowRight":next+=Math.max(45,scroller.clientWidth*.12);break;
   case "PageUp":next-=scroller.clientWidth*.85;break;
   case "PageDown":next+=scroller.clientWidth*.85;break;
   case "Home":next=0;break;
   case "End":next=max;break;
   default:return;
  }
  event.preventDefault();scroller.scrollLeft=Math.max(0,Math.min(max,next));sync();
 });
 scroller.addEventListener("scroll",sync,{passive:true});
 if(window.ResizeObserver){const resize=new ResizeObserver(schedule);resize.observe(scroller);resize.observe(track)}
 window.addEventListener("resize",schedule);schedule();
}
