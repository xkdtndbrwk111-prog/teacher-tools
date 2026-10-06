// Read-only view over the canonical Seating registry. Never writes or migrates it.
export const STUDENT_STORAGE_KEY = 'teacher-tools.seating.state.v1';
export function readStudents(storage = localStorage) {
  const raw = storage.getItem(STUDENT_STORAGE_KEY);
  if (raw === null) return Object.freeze([]);
  const state = JSON.parse(raw);
  if (!Array.isArray(state.students)) throw new Error('학생명단 형식을 확인해 주세요.');
  const ids = new Set();
  return Object.freeze(state.students.map((s, index) => {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.name !== 'string') throw new Error('학생명단을 자리배치에서 확인해 주세요.');
    ids.add(s.id);
    return Object.freeze({id:s.id, name:s.name, sprite:studentSprite(s,index)});
  }));
}
export function studentSprite(student,index) {
  let h=2166136261;
  const text=`${student.id||''}|${student.name||''}|${index}`;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  h>>>=0;
  const pool=student.gender==='male'?['boy1','boy2']:student.gender==='female'?['girl','trav','prin']:['boy1','boy2','girl','trav','prin'];
  return new URL(`./assets/students/${pool[h%pool.length]}_${['brown','black'][(h>>>4)%2]}_${['green','blue','red','yellow','purple','orange'][(h>>>9)%6]}.png`,import.meta.url).href;
}
