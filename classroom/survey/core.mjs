// Experimental, isolated survey domain logic. Not wired to the application or a server.
export const MONTHS = [3,4,5,6,7,9,10,11,12];
export function parseQuestions(markdown) {
  const common = markdown.split('## A. 매월 공통 질문 (1~5번)')[1]?.split('\n---')[0];
  if (!common) throw Error('공통 문항이 없습니다');
  const parse = text => [...text.matchAll(/(?:### (\d)\. |\*\*(\d)\. )([^\n]*?)(?:\*\*)?\n([\s\S]*?)(?=\n(?:### \d\. |\*\*\d\. |---)|$)/g)].map(m => ({number:Number(m[1]||m[2]),text:m[3].replace(/\*\*$/,''),body:m[4].trim()}));
  const first = parse(common);
  const result = {};
  for (const month of MONTHS) {
    const part = markdown.split(new RegExp(`## ${month}월 —`))[1]?.split('\n---')[0];
    if (!part) throw Error(`${month}월 문항이 없습니다`);
    result[month] = [...first, ...parse(part)];
    if (result[month].length !== 8 || result[month].some((q,i)=>q.number!==i+1)) throw Error(`${month}월 문항 구성 오류`);
  }
  return result;
}
// Peer answers are optional. Each choice refers to an internal seating ID, never a name.
export function validatePeerChoices(choices, respondent, roster, behaviors = null) {
  if (!Array.isArray(choices) || choices.length > 2) throw Error('친구는 최대 2명까지 선택할 수 있습니다');
  const allowed = new Set(roster.map(s=>s.id)), seen = new Set();
  for (const choice of choices) {
    if (!choice || !allowed.has(choice.studentId) || choice.studentId === respondent || seen.has(choice.studentId)) throw Error('친구 선택이 올바르지 않습니다');
    if (behaviors && !behaviors.includes(choice.behavior)) throw Error('행동 유형을 선택해 주세요');
    seen.add(choice.studentId);
  }
  return true;
}
// Conservative prototype: all three categories must be observed, with enough respondents.
// Normalization uses eligible respondents, not maximum observed votes; zero is only valid
// after a respondent actually answered that category. This is a seating hint, not an assessment.
export function previewCharm(roster, responses, scale, minRespondents=5) {
  if (![4,8].includes(scale)) throw Error('단계 수 오류');
  const categories=['cooperation','care','popularity'];
  const validIds=new Set(roster.map(s=>s.id));
  if (validIds.size !== roster.length || roster.length < 2) throw Error('명단 오류');
  const unique=new Set();
  for (const r of responses) {
    if (!validIds.has(r.studentId) || unique.has(r.studentId)) throw Error('응답자 오류');
    unique.add(r.studentId);
    for (const c of categories) if (r[c] !== null && r[c] !== undefined) validatePeerChoices(r[c],r.studentId,roster);
  }
  const answered=Object.fromEntries(categories.map(c=>[c,responses.filter(r=>Array.isArray(r[c]) && r[c].length>0)]));
  if (categories.some(c=>answered[c].length<minRespondents)) return {status:'insufficient',counts:Object.fromEntries(categories.map(c=>[c,answered[c].length])),levels:[]};
  const levels=roster.map(s=>{
    const ratios=Object.fromEntries(categories.map(c=>{
      const eligible=answered[c].filter(r=>r.studentId!==s.id);
      return [c,eligible.length ? eligible.filter(r=>r[c].some(x=>x.studentId===s.id)).length/eligible.length : 0];
    }));
    const score=.4*ratios.cooperation+.4*ratios.care+.2*ratios.popularity;
    return {studentId:s.id,ratios,score,level:1+Math.min(scale-1,Math.floor(score*scale))};
  });
  return {status:'preview',counts:Object.fromEntries(categories.map(c=>[c,answered[c].length])),levels};
}
