import {applyDraftValues,createDraftCipher,deleteDraft,draftValues,loadDraft,purgeExpiredDrafts,saveDraft} from './draft-store.mjs';

const $=id=>document.getElementById(id),months=[3,4,5,6,7,9,10,11,12];
let token=null,surveyObserver=null,monthRequest=0,draftTimer=null,draftCredential=null,activeDraftFlush=null;
const query=new URLSearchParams(location.search),requestedMonth=months.includes(Number(query.get('month')))?Number(query.get('month')):null;
const publicScope={ownerId:query.get('owner')||'',year:Number(query.get('year')),classId:query.get('class')||''};
const validPublicScope=()=>Boolean(publicScope.ownerId&&publicScope.classId&&Number.isInteger(publicScope.year)&&publicScope.year>=2000&&publicScope.year<=2100);

async function api(path,{method='GET',data,credential=token}={}){
 let response;
 try{response=await fetch(path,{method,headers:{...(credential?{Authorization:`Bearer ${credential}`}:{}) ,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})}
 catch{throw Error('학급생활 설문 서버에 연결할 수 없습니다.')}
 let value=null;try{if((response.headers.get('content-type')||'').includes('application/json'))value=await response.json()}catch{}
 if(!response.ok)throw Error(value?.error||'학급생활 설문 서버가 준비되지 않았습니다.');
 if(!value)throw Error('학급생활 설문 서버 응답을 확인할 수 없습니다.');
 return value;
}

function status(message){$('status').textContent=message;$('status').className=/(실패|확인 필요|골라 주세요|선택할 수 없어요)/.test(message)?'is-error':'is-info'}
function flushPending(){clearTimeout(draftTimer);draftTimer=null;return activeDraftFlush?.()}
function clear(){monthRequest++;void flushPending();activeDraftFlush=null;draftCredential=null;surveyObserver?.disconnect();surveyObserver=null;$('login').hidden=false;token=null;$('surveys').hidden=true;$('logout').hidden=true;$('form').replaceChildren()}

addEventListener('pagehide',()=>{void flushPending()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushPending()});

$('login').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;clear();
 try{if(!validPublicScope())throw Error('설문 접속 주소가 올바르지 않습니다. 선생님이 안내한 QR 또는 주소를 다시 확인하세요.');const data=new FormData(form),code=String(data.get('code')),result=await api('/api/v2/login',{method:'POST',credential:null,data:{...publicScope,number:Number(data.get('number')),code}});token=result.token;draftCredential=code;void purgeExpiredDrafts();form.elements.code.value='';form.hidden=true;$('surveys').hidden=false;$('logout').hidden=false;status(requestedMonth?`${requestedMonth}월 설문을 불러오고 있습니다.`:'로그인했습니다. 월을 선택하세요.');if(requestedMonth)await openMonth(requestedMonth)}
 catch(error){status(`로그인 실패: ${error.message}`)}
});

$('logout').addEventListener('click',async()=>{try{await api('/api/v2/student/logout',{method:'POST'});clear();status('로그아웃했습니다.')}catch(error){clear();status(`기기 화면은 닫았지만 서버 로그아웃 확인에 실패했습니다: ${error.message}`)}});

for(const month of months){const button=document.createElement('button');button.type='button';button.textContent=`${month}월`;button.addEventListener('click',()=>openMonth(month));$('months').append(button)}

if(!validPublicScope()){const submit=$('login').querySelector('button[type=submit]');submit.disabled=true;status('설문 접속 주소가 올바르지 않습니다. 선생님이 안내한 QR 또는 주소를 사용하세요.');}

async function openMonth(month){
 const request=++monthRequest;await flushPending();activeDraftFlush=null;surveyObserver?.disconnect();surveyObserver=null;$('form').replaceChildren();status(`${month}월 설문을 불러오고 있습니다.`);
 try{
  const survey=await api(`/api/v2/student/survey?month=${month}`);if(request!==monthRequest)return;
  const scope={ownerId:survey.ownerId,year:survey.year,classId:survey.classId,studentId:survey.studentId,month:survey.month,version:survey.version||'unopened'};
  if(survey.submitted){await deleteDraft(scope).catch(()=>{});status(`${month}월 설문을 이미 제출했습니다.`);return}
  if(!survey.open){status(`${month}월 설문은 열리지 않았습니다.`);return}
  status(`${month}월 설문 · ${survey.version}`);await render(survey,request);
 }catch(error){if(request===monthRequest)status(`설문 조회 실패: ${error.message}`)}
}

function peerSelect(roster,name){const select=document.createElement('select');select.name=name;select.add(new Option('선택 안 함',''));for(const student of roster)select.add(new Option(student.name,student.id));return select}

async function render(survey,request){
 const scope={ownerId:survey.ownerId,year:survey.year,classId:survey.classId,studentId:survey.studentId,month:survey.month,version:survey.version};
 const cipher=await createDraftCipher(scope,draftCredential),form=document.createElement('form'),progress=document.createElement('p');
 progress.className='survey-progress';progress.textContent='문항 1 / 8 · 답하고 싶은 질문부터 선택하세요.';form.append(progress);
 form.addEventListener('focusin',event=>{const field=event.target.closest('fieldset');if(field){const index=[...form.querySelectorAll('fieldset')].indexOf(field)+1;progress.textContent=`문항 ${index} / 8 · 답하고 싶은 질문부터 선택하세요.`}});
 for(const question of survey.questions){
  const field=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=`${question.number}. ${question.text}`;field.append(legend);
  const options=[...question.body.matchAll(/^- (.+)$/gm)].map(match=>match[1]);
  if([3,8].includes(question.number)){const area=document.createElement('textarea');area.name=String(question.number);area.placeholder='한두 문장으로 적어 주세요';field.append(area)}
  else if([4,5].includes(question.number))for(let index=0;index<2;index++){const row=document.createElement('div'),peer=peerSelect(survey.roster,`peer-${question.number}-${index}`),behavior=document.createElement('select');peer.setAttribute('aria-label',`${question.number}번 친구 ${index+1}`);behavior.setAttribute('aria-label',`${question.number}번 행동 ${index+1}`);behavior.name=`behavior-${question.number}-${index}`;behavior.add(new Option('행동 선택',''));for(const option of options)behavior.add(new Option(option,option));row.append(peer,behavior);field.append(row)}
  else if([3,9].includes(survey.month)&&[6,7].includes(question.number)){const mode=document.createElement('select');mode.name=`mode-${question.number}`;mode.setAttribute('aria-label',`${question.number}번 응답 방식`);for(const [label,value] of [['응답하지 않음',''],['친구 선택','selected'],['아직 잘 모르겠어요','unknown'],['선택하고 싶지 않아요','declined']])mode.add(new Option(label,value));field.append(mode,peerSelect(survey.roster,`relation-${question.number}-0`),peerSelect(survey.roster,`relation-${question.number}-1`))}
  else for(const option of options){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name=String(question.number);radio.value=option;label.append(radio,document.createTextNode(option));field.append(label)}
  form.append(field);
 }
 const submit=document.createElement('button'),review=document.createElement('section');submit.type='submit';submit.textContent='응답 확인하기';review.hidden=true;review.className='survey-review';form.append(submit,review);
 function clearReview(){if(!review.hidden){review.hidden=true;review.replaceChildren();submit.hidden=false;progress.textContent='답변을 수정해 주세요 · 총 8문항'}}
 if('IntersectionObserver' in window){surveyObserver=new IntersectionObserver(()=>{if(!review.hidden)return;const fields=[...form.querySelectorAll('fieldset')],visible=fields.findIndex(field=>{const rect=field.getBoundingClientRect();return rect.bottom>window.innerHeight*.25&&rect.top<window.innerHeight*.7});if(visible>=0)progress.textContent=`문항 ${visible+1} / 8 · 답하고 싶은 질문부터 선택하세요.`},{threshold:[0,.3,.6]});form.querySelectorAll('fieldset').forEach(field=>surveyObserver.observe(field))}
 async function persistDraft(){try{const values=draftValues(form);if(!Object.values(values).some(Boolean))return;await saveDraft(scope,values,cipher);status('이 기기에 임시 저장됨')}catch(error){status(`임시 저장 실패: ${error.message}`)}}
 activeDraftFlush=persistDraft;
 function queueDraft(){clearTimeout(draftTimer);status('작성 중 · 잠시 후 이 기기에 임시 저장됩니다.');draftTimer=setTimeout(()=>{draftTimer=null;void persistDraft()},700)}
 form.addEventListener('change',()=>{clearReview();queueDraft()});form.addEventListener('input',()=>{clearReview();queueDraft()});
 function collect(){const data=new FormData(form),answers={};for(const question of survey.questions){const number=question.number;if([4,5].includes(number)){const choices=[];for(let index=0;index<2;index++){const studentId=data.get(`peer-${number}-${index}`),behavior=data.get(`behavior-${number}-${index}`);if(studentId){if(!behavior)throw Error(`${number}번에서 선택한 친구의 행동을 골라 주세요.`);if(choices.some(choice=>choice.studentId===studentId))throw Error(`${number}번에서 같은 친구를 두 번 선택할 수 없어요.`);choices.push({studentId,behavior})}}if(choices.length)answers[number]=choices}else if([3,9].includes(survey.month)&&[6,7].includes(number)){const kind=data.get(`mode-${number}`);if(kind){answers[number]={kind};if(kind==='selected'){const ids=[0,1].map(index=>data.get(`relation-${number}-${index}`)).filter(Boolean);if(!ids.length)throw Error(`${number}번에서 친구를 선택하거나 다른 응답 방식을 골라 주세요.`);if(new Set(ids).size!==ids.length)throw Error(`${number}번에서 같은 친구를 두 번 선택할 수 없어요.`);answers[number].choices=ids.map(studentId=>({studentId}))}}}else{const value=data.get(String(number));if(value)answers[number]=value}}return answers}
 function summary(answer){if(!answer)return '미응답';const names=choices=>choices.map(choice=>`${survey.roster.find(student=>student.id===choice.studentId)?.name||'확인할 수 없는 학생'}${choice.behavior?' · '+choice.behavior:''}`).join(' / ');if(Array.isArray(answer))return names(answer)||'선택 없음';if(typeof answer==='object')return answer.kind==='unknown'?'아직 잘 모르겠어요':answer.kind==='declined'?'선택하고 싶지 않아요':names(answer.choices||[])||'선택 없음';return String(answer)}
 function showDone(message){const done=document.createElement('section'),heading=document.createElement('h2'),text=document.createElement('p');heading.textContent='제출을 완료했어요';text.textContent=message;done.className='survey-done';done.append(heading,text);surveyObserver?.disconnect();surveyObserver=null;form.replaceChildren(done)}
 form.addEventListener('submit',async event=>{
  event.preventDefault();let answers;try{answers=collect()}catch(error){status(error.message);return}
  if(review.hidden){review.replaceChildren();const heading=document.createElement('h2');heading.textContent='제출 전 응답 확인';review.append(heading);for(const question of survey.questions){const row=document.createElement('p'),label=document.createElement('strong'),value=document.createElement('span');label.textContent=`${question.number}. ${question.text}`;value.textContent=summary(answers[question.number]);row.append(label,value);review.append(row)}const back=document.createElement('button'),confirm=document.createElement('button');back.type='button';back.textContent='답변 수정';back.onclick=clearReview;confirm.type='submit';confirm.textContent='확인하고 제출';review.append(back,confirm);review.hidden=false;submit.hidden=true;progress.textContent='제출 전 응답 확인 · 총 8문항';heading.scrollIntoView({block:'start'});return}
  const confirm=review.querySelector('button[type=submit]');confirm.disabled=true;status('제출 중 · 서버 저장 상태를 확인하고 있습니다.');
  try{
   const latest=await api(`/api/v2/student/survey?month=${survey.month}`);
   if(!latest.submitted)await api('/api/v2/student/submit',{method:'POST',data:{month:survey.month,answers}});
   clearTimeout(draftTimer);draftTimer=null;activeDraftFlush=null;
   const removed=await deleteDraft(scope).then(()=>true,()=>false);showDone(`${survey.month}월 설문이 서버에 저장되었습니다. 참여해 주어 고마워요.`);
   status(removed?`${survey.month}월 설문을 제출했습니다.`:'제출 완료 · 이 기기의 임시 저장 삭제에 실패했습니다. 브라우저 데이터를 정리해 주세요.');
  }catch(error){confirm.disabled=false;status(`제출 확인 필요: ${error.message} 임시 답변은 이 기기에 유지됩니다.`)}
 });
 const draft=await loadDraft(scope,cipher).catch(error=>{status(`임시 저장을 불러오지 못했습니다: ${error.message}`);return null});
 if(request!==monthRequest)return;
 if(draft&&applyDraftValues(form,draft.values))status(`${survey.month}월 설문 · 이전 작성 내용이 복원됨`);
 $('form').replaceChildren(form);
}
