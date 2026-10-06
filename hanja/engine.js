export const defaults={target:'mixed',direction:'forward',mode:'choice',perStudent:3,choices:4};
export function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function validateEntry(entry){
  if(!['single','word'].includes(entry.type))throw Error('데이터 종류를 확인해 주세요.');
  if(!entry.text || !Array.from(entry.text).every(c=>/^\p{Script=Han}$/u.test(c)))throw Error('한자만 입력해 주세요.');
  if(entry.type==='single'&&Array.from(entry.text).length!==1)throw Error('단일 한자는 저장할 때 한 글자여야 합니다.');
  if(entry.type==='word'&&Array.from(entry.text).length<2)throw Error('한자어는 두 글자 이상 입력해 주세요.');
  if(!entry.reading.trim()||!entry.meaning.trim())throw Error('훈/뜻과 음/읽기를 모두 입력해 주세요.');
  if(!Number.isFinite(entry.weight)||entry.weight<=0||entry.weight>100)throw Error('출제비중은 0 초과 100 이하입니다.');
  return entry;
}
export function validateSettings(s){
  if(!['single','word','mixed'].includes(s.target)||!['forward','reverse','both'].includes(s.direction)||!['choice','manual'].includes(s.mode)||!Number.isInteger(s.perStudent)||s.perStudent<1||s.perStudent>50||!Number.isInteger(s.choices)||s.choices<2||s.choices>6)throw Error('문제 설정을 확인해 주세요.');
  return s;
}
export function eligible(db,s){return db.filter(e=>e.enabled&&(s.target==='mixed'||e.type===s.target))}
export function answerFor(e,direction){return direction==='reverse'?e.text:e.type==='single'?`${e.meaning} ${e.reading}`:e.reading}
export function question(db,s,lastId=null,random=Math.random){
  let pool=eligible(db,s);if(!pool.length)throw Error('출제할 활성 한자/한자어가 없습니다.');
  if(pool.some(e=>e.id!==lastId))pool=pool.filter(e=>e.id!==lastId);
  let n=random()*pool.reduce((sum,e)=>sum+e.weight,0);let entry=pool[pool.length-1];
  for(const e of pool){n-=e.weight;if(n<0){entry=e;break}}
  const direction=s.direction==='both'?(random()<.5?'forward':'reverse'):s.direction;
  const answer=answerFor(entry,direction);
  const distractors=[...new Set(db.filter(e=>e.type===entry.type&&e.id!==entry.id).map(e=>answerFor(e,direction)))].filter(a=>a!==answer);
  const options=shuffle([answer,...shuffle(distractors,random).slice(0,s.choices-1)],random);
  if(s.mode==='choice'&&options.length<2)throw Error('서로 다른 답을 가진 같은 종류의 항목을 2개 이상 등록하거나 수동 모드를 사용해 주세요.');
  return {id:entry.id,prompt:direction==='forward'?entry.text:entry.type==='single'?`${entry.meaning} ${entry.reading}`:entry.reading,answer,options,type:entry.type,meaning:entry.meaning,direction};
}
export function checkReady(db,s){validateSettings(s);const pool=eligible(db,s);if(!pool.length)throw Error('활성 한자/한자어를 등록해 주세요.');if(s.mode==='choice')for(const e of pool)for(const dir of s.direction==='both'?['forward','reverse']:[s.direction])if(new Set(db.filter(x=>x.type===e.type).map(x=>answerFor(x,dir))).size<2)throw Error('객관식은 같은 종류의 서로 다른 답이 2개 이상 필요합니다. 수동 모드를 사용할 수도 있습니다.');}
