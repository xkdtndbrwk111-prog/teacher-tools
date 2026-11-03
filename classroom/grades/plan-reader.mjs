// School evaluation plans (학교알리미 "교과별(학년별) 평가계획") read in the browser, without AI.
// Hangul files carry real table cells: .hwpx is a zip of XML, .hwp is an OLE compound file of records.
// Columns are recognised by what they hold (standard codes, months, level words), because every school
// names its columns differently. Nothing in a file is executed; only bytes are parsed.

// HWP pads its deflate streams to whole sectors; keep what inflated before the padding instead of failing.
async function inflateRaw(bytes){
 const ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();
 w.write(bytes).catch(()=>{});w.close().catch(()=>{});
 const r=ds.readable.getReader(),chunks=[];let n=0;
 try{for(;;){const {value,done}=await r.read();if(done)break;chunks.push(value);n+=value.length;}}catch(e){if(!n)throw e;}
 const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}return out;
}
const u16=(b,o)=>b[o]|b[o+1]<<8;
const u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;
const MAX_BYTES=30*1024*1024;

export function fileKind(name,bytes){
 if(bytes[0]===0x50&&bytes[1]===0x4b)return /\.hwpx$/i.test(name)||!/\.(zip)$/i.test(name)?'hwpx':'zip';
 if(bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0)return 'hwp';
 if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)return 'pdf';
 return 'other';
}

// ---- zip (hwpx) ----
async function unzip(bytes,want){
 let e=bytes.length-22;while(e>=0&&u32(bytes,e)!==0x06054b50)e--;
 if(e<0)throw Error('압축 파일 구조를 읽지 못했습니다.');
 let p=u32(bytes,e+16);const n=u16(bytes,e+10),out={};
 const dec=new TextDecoder();
 for(let i=0;i<n;i++){
  if(u32(bytes,p)!==0x02014b50)break;
  const method=u16(bytes,p+10),csize=u32(bytes,p+20),nlen=u16(bytes,p+28),xlen=u16(bytes,p+30),clen=u16(bytes,p+32),off=u32(bytes,p+42);
  const name=dec.decode(bytes.subarray(p+46,p+46+nlen));p+=46+nlen+xlen+clen;
  if(!want(name))continue;
  const lo=off+30+u16(bytes,off+26)+u16(bytes,off+28),data=bytes.subarray(lo,lo+csize);
  out[name]=method===0?data:await inflateRaw(data);
 }
 return out;
}
// A tiny tag walker: enough for the table part of OWPML (hp:tbl/tr/tc/cellAddr/cellSpan/t).
function hwpxTables(xml){
 const tables=[],stack=[];let cell=null,inText=false;
 const re=/<(\/?)([A-Za-z0-9_:.-]+)([^>]*?)(\/?)>|([^<]+)/g;let m;
 const attr=(s,k)=>{const r=new RegExp('\\b'+k+'="([^"]*)"').exec(s);return r?r[1]:null};
 while((m=re.exec(xml))){
  if(m[5]!==undefined){if(inText&&cell)cell.buf+=m[5];continue;}
  const close=m[1]==='/',tag=m[2].replace(/^.*:/,''),self=m[4]==='/';
  if(tag==='tbl'){if(close){const t=stack.pop();if(t)tables.push(t.cells);cell=stack.at(-1)?.cell||null;}else if(!self)stack.push({cells:[],cell:null});continue;}
  const t=stack.at(-1);if(!t)continue;
  if(tag==='tc'){if(close){if(t.cell){t.cell.parts.push(t.cell.buf);t.cell.t=t.cell.parts.map(x=>x.trim()).filter(Boolean).join(' ');t.cells.push(t.cell);}t.cell=null;cell=null;}else{t.cell={c:null,r:null,rs:1,parts:[],buf:''};cell=t.cell;}continue;}
  if(!t.cell)continue;
  if(tag==='cellAddr'&&!close){t.cell.c=Number(attr(m[3],'colAddr'));t.cell.r=Number(attr(m[3],'rowAddr'));}
  else if(tag==='cellSpan'&&!close){t.cell.rs=Number(attr(m[3],'rowSpan'))||1;}
  else if(tag==='t'){inText=!close&&!self;}
  else if(tag==='p'&&close){t.cell.parts.push(t.cell.buf);t.cell.buf='';}
  else if((tag==='lineBreak'||tag==='tab')&&t.cell){t.cell.buf+=' ';}
 }
 return tables.map(cells=>cells.map(c=>({c:c.c,r:c.r,rs:c.rs,t:decodeEntities(c.t)})));
}
const decodeEntities=s=>s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,(_,e)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"})[e]??String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)));

// ---- OLE compound file (hwp) ----
function cfb(bytes){
 if(u32(bytes,0)!==0xe011cfd0)throw Error('한글 파일 구조가 아닙니다.');
 const ss=1<<u16(bytes,30),mss=1<<u16(bytes,32),dirStart=u32(bytes,48),cutoff=u32(bytes,56),miniFatStart=u32(bytes,60),difatStart=u32(bytes,68),nDifat=u32(bytes,72);
 const sec=i=>bytes.subarray(512+i*ss,512+(i+1)*ss);
 const fatSecs=[];for(let i=0;i<109;i++){const v=u32(bytes,76+i*4);if(v<0xfffffffa)fatSecs.push(v);}
 for(let d=difatStart,k=0;d<0xfffffffa&&k<nDifat;k++){const b=sec(d);for(let i=0;i<ss/4-1;i++){const v=u32(b,i*4);if(v<0xfffffffa)fatSecs.push(v);}d=u32(b,ss-4);}
 const fat=[];for(const s of fatSecs){const b=sec(s);for(let i=0;i<ss/4;i++)fat.push(u32(b,i*4));}
 const chain=(start,table,limit=1e6)=>{const out=[];for(let s=start;s<0xfffffffa&&out.length<limit;s=table[s]??0xfffffffe)out.push(s);return out;};
 const read=(start,size)=>{const out=new Uint8Array(chain(start,fat).length*ss);chain(start,fat).forEach((s,i)=>out.set(sec(s),i*ss));return size===undefined?out:out.subarray(0,size);};
 const dirBytes=read(dirStart),entries=[];
 for(let o=0;o+128<=dirBytes.length;o+=128){
  const nl=u16(dirBytes,o+64);let name='';for(let i=0;i<Math.max(0,nl-2);i+=2)name+=String.fromCharCode(u16(dirBytes,o+i));
  entries.push({name,type:dirBytes[o+66],left:u32(dirBytes,o+68),right:u32(dirBytes,o+72),child:u32(dirBytes,o+76),start:u32(dirBytes,o+116),size:u32(dirBytes,o+120)});
 }
 const root=entries[0],ministream=read(root.start,root.size);
 const minifat=[];if(miniFatStart<0xfffffffa){const b=read(miniFatStart);for(let i=0;i<b.length/4;i++)minifat.push(u32(b,i*4));}
 const readEntry=e=>{if(e.size<cutoff){const out=new Uint8Array(e.size);let o=0;for(const s of chain(e.start,minifat)){out.set(ministream.subarray(s*mss,Math.min((s+1)*mss,s*mss+e.size-o)),o);o+=mss;if(o>=e.size)break;}return out;}return read(e.start,e.size);};
 const children=i=>{const out=[],seen=new Set();const walk=j=>{if(j>=entries.length||seen.has(j))return;seen.add(j);const e=entries[j];walk(e.left);out.push(e);walk(e.right);};walk(entries[i].child);return out;};
 const find=path=>{let idx=0;for(const part of path.split('/')){const kids=children(idx);const hit=kids.find(e=>e.name===part);if(!hit)return null;idx=entries.indexOf(hit);}return entries[idx];};
 return {find,readEntry};
}
function hwpText(b){
 let out='';for(let i=0;i+1<b.length;){const c=u16(b,i);
  if(c<32){if(c===10||c===13)out+=' ';i+=[0,10,13,24,25,26,27,28,29,30,31].includes(c)?2:16;continue;}
  if(c<0xd800||c>0xdfff)out+=String.fromCharCode(c);i+=2;}
 return out;
}
async function hwpTables(bytes){
 const f=cfb(bytes),head=f.find('FileHeader');if(!head)throw Error('한글 파일 머리 정보를 찾지 못했습니다.');
 const hb=f.readEntry(head);if(u32(hb,36)&2)throw Error('암호가 걸린 한글 파일입니다.');
 const compressed=Boolean(u32(hb,36)&1),tables=[];
 for(let k=0;;k++){
  const e=f.find('BodyText/Section'+k);if(!e)break;
  let buf=f.readEntry(e);if(compressed)buf=await inflateRaw(buf);
  const stack=[];
  for(let i=0;i+4<=buf.length;){
   const h=u32(buf,i);i+=4;const tag=h&0x3ff,level=h>>>10&0x3ff;let size=h>>>20&0xfff;
   if(size===0xfff){size=u32(buf,i);i+=4;}
   const data=buf.subarray(i,i+size);i+=size;
   while(stack.length&&level<=stack.at(-1).level)tables.push(stack.pop().cells);
   if(tag===71&&String.fromCharCode(data[3],data[2],data[1],data[0])==='tbl '){stack.push({level,cells:[],cur:null});continue;}
   const t=stack.at(-1);if(!t)continue;
   if(tag===72&&level===t.level+1&&data.length>=16){t.cur={c:u16(data,8),r:u16(data,10),rs:u16(data,14)||1,parts:[]};t.cells.push(t.cur);}
   else if(tag===67&&t.cur){const s=hwpText(data).trim();if(s)t.cur.parts.push(s);}
  }
  while(stack.length)tables.push(stack.pop().cells);
 }
 return tables.map(cells=>cells.map(c=>({c:c.c,r:c.r,rs:c.rs,t:c.parts.join(' ')})));
}

// ---- rules ----
export const CODE=/\[\s*(\d)\s*([가-힣]{1,8}?)\s*(\d{1,2})\s*-\s*(\d{1,2})\s*\]/;
const SUBJ={국:'국어',사:'사회',도:'도덕',수:'수학',과:'과학',실:'실과',체:'체육',음:'음악',미:'미술',영:'영어',바:'바른 생활',슬:'슬기로운 생활',즐:'즐거운 생활'};
export const LEVEL_WORDS=new Set(['매우잘함','잘함','보통','보통임','노력요함','노력바람','노력필요','향상필요','할수있음','우수','우수함','매우우수','미흡','도달','미도달','부분도달','상','중','하','◎','○','◯','△','●','A','B','C']);
const norm=t=>String(t||'').replace(/\(\s*\d+\s*점\s*\)|[\s·・∙ㆍ.:()]/g,'');
const isLevelSet=names=>names.length>=3&&names.length<=5&&new Set(names).size===names.length&&names.every(n=>LEVEL_WORDS.has(n));
export function subjectOf(code,title=''){
 // School subjects ([5과함께환경01-01], [6국독서..]) are named by their table title, else by the code itself.
 const key=code?CODE.exec(code)?.[2]:'';
 if(key&&SUBJ[key])return SUBJ[key];
 const m=/^\s*([가-힣 ()0-9]{1,30}?)과?\s*(교수|평가)/.exec(title||'');
 return m?m[1].trim():key||'';
}
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function tableItems(cells){
 cells=cells.filter(c=>Number.isInteger(c.r)&&Number.isInteger(c.c));if(!cells.length)return [];
 const title=[...cells].sort((a,b)=>a.r-b.r||a.c-b.c).find(c=>c.t)?.t||'';
 const at=new Map();for(const c of cells)for(let k=0;k<Math.max(1,c.rs);k++)at.set((c.r+k)+','+c.c,c);
 const words=['시기','성취기준','단원','영역','요소','방법','수준','기준','내용'];
 let hdrRow=null,hdr={};
 for(const r of [...new Set(cells.map(c=>c.r))].sort((a,b)=>a-b)){
  const row=cells.filter(c=>c.r===r);
  if(row.filter(c=>words.some(w=>norm(c.t).includes(w))).length>=3){hdrRow=r;for(const c of row)hdr[c.c]=norm(c.t);break;}
 }
 const lv=cells.filter(c=>LEVEL_WORDS.has(norm(c.t))&&(hdrRow===null||c.r>hdrRow)).sort((a,b)=>a.c-b.c||a.r-b.r);
 const blocks=[];let run=[];
 for(const c of lv){
  const prev=run.at(-1);
  if(prev&&(c.c!==prev.c||c.r!==prev.r+prev.rs||run.some(x=>norm(x.t)===norm(c.t)))){blocks.push(run);run=[];}
  run.push(c);if(run.length===5){blocks.push(run);run=[];}
 }
 if(run.length)blocks.push(run);
 const maxc=Math.max(...cells.map(c=>c.c)),items=[];
 for(const b of blocks){
  const names=b.map(x=>norm(x.t));if(!isLevelSet(names))continue;
  const r0=b[0].r,lc=b[0].c,last=b.at(-1).r+b.at(-1).rs-1;
  const desc=x=>{for(let cc=lc+1;cc<lc+6;cc++){const c=at.get(x.r+','+cc);if(c&&c!==x&&c.r===x.r&&c.rs<=x.rs)return clean(c.t);}return '';};
  const levels=b.map(x=>({name:names[b.indexOf(x)],note:desc(x)}));
  const row=[...new Set(Array.from({length:maxc+1},(_,cc)=>at.get(r0+','+cc)).filter(c=>c&&!b.includes(c)&&c.r<=r0&&c.r+c.rs-1>=last))].sort((a,b)=>a.c-b.c);
  const byHead=(...keys)=>clean(row.find(c=>keys.some(k=>(hdr[c.c]||'').includes(k)))?.t||'');
  const codeCell=row.find(c=>CODE.test(c.t)),code=codeCell?CODE.exec(codeCell.t)[0].replace(/\s/g,''):'';
  const period=row.map(c=>/\d{1,2}\s*월(\s*\d\s*주)?|\d{1,2}\s*주/.exec(c.t)?.[0]).find(Boolean)||'';
  const unit=byHead('단원')||clean(row.find(c=>c!==codeCell&&/^\s*(\d{1,2}\s*[.-]|<)/.test(c.t))?.t||'');
  const element=byHead('요소'),method=byHead('방법');
  const kinds=[...new Set((method+' '+row.map(c=>c.t).join(' ')).match(/[가-힣·]{1,10}형?\s?평가/g)||[])].filter(x=>x!=='평가').slice(0,3);
  items.push({subject:subjectOf(code,title),period:clean(period),code,standard:clean(codeCell?.t||''),unit,element,area:byHead('영역'),method:kinds,levels});
 }
 return items;
}
export function itemComplete(it){return Boolean(it.code&&(it.unit||it.element)&&it.levels.length>=2&&it.levels.every(l=>l.note));}
// grade: 1-6. Whole-school files are narrowed by the standard code's band (1-2 → 2, 3-4 → 4, 5-6 → 6).
export function filterGrade(items,grade){
 if(!grade)return items;const band=String(Math.ceil(Number(grade)/2)*2);
 return items.filter(it=>!it.code||it.code[1]===band);
}
export async function readPlanFile(name,input,{grade}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length>MAX_BYTES)throw Error('파일이 너무 큽니다. (30MB 이하)');
 const kind=fileKind(name,bytes);
 if(kind==='pdf'||kind==='zip'||kind==='other')return {kind,items:[],reason:kind==='pdf'?'PDF 파일은 표 칸 정보가 없어 자동으로 읽지 못합니다.':kind==='zip'?'압축 파일은 풀어서 안의 한글 파일을 올려 주세요.':'한글(.hwp/.hwpx) 파일이 아닙니다.'};
 let tables;
 if(kind==='hwpx'){
  const parts=await unzip(bytes,n=>/^Contents\/section\d+\.xml$/.test(n));
  const dec=new TextDecoder();tables=Object.keys(parts).sort((a,b)=>Number(a.match(/\d+/))-Number(b.match(/\d+/))).flatMap(n=>hwpxTables(dec.decode(parts[n])));
 }else tables=await hwpTables(bytes);
 const all=tables.flatMap(tableItems),items=filterGrade(all,grade);
 const ok=items.filter(itemComplete).length;
 return {kind,items,complete:ok,reason:!tables.length?'문서에서 표를 찾지 못했습니다.':!all.length?'표에서 평가 단계(잘함·보통·노력요함, 상·중·하 등)를 찾지 못했습니다.':!items.length?'선택한 학년의 평가를 찾지 못했습니다.':ok<items.length*0.8?'일부 평가의 성취기준이나 단계 설명을 읽지 못했습니다.':''};
}

// ---- AI fallback: a prompt for the teacher's own AI tool, and a strict reader for its answer ----
export function aiPrompt({school='',grade='',semester=''}={}){
 return `첨부한 학교 평가계획 문서에서 ${grade?grade+'학년 ':''}${semester?semester+'학기 ':''}수행평가를 모두 찾아 아래 JSON 형식으로만 답해 주세요. 설명 문장은 쓰지 마세요.
${school?`학교: ${school}\n`:''}규칙:
- 평가 하나마다 항목 하나를 만듭니다.
- levels에는 문서에 적힌 단계 이름(예: 잘함·보통·노력요함, 상·중·하, ◎·○·△)과 그 설명을 문서 순서대로 그대로 옮깁니다.
- 문서에 없는 내용은 지어내지 말고 빈 문자열로 둡니다.
- code는 [6국04-04]처럼 대괄호까지 씁니다.

{"format":"tt.plan.v1","items":[{"subject":"국어","period":"10월","code":"[6국04-04]","standard":"성취기준 문장","unit":"단원명","element":"평가 요소","method":["서술·논술형 평가"],"levels":[{"name":"잘함","note":"설명"},{"name":"보통","note":"설명"},{"name":"노력요함","note":"설명"}]}]}`;
}
export function parseAiAnswer(text){
 const s=String(text||'');const a=s.indexOf('{'),b=s.lastIndexOf('}');
 if(a<0||b<a)throw Error('JSON을 찾지 못했습니다. AI 답의 { 부터 } 까지 모두 붙여 넣어 주세요.');
 let data;try{data=JSON.parse(s.slice(a,b+1));}catch{throw Error('JSON 형식이 올바르지 않습니다. AI 답을 그대로 다시 붙여 넣어 주세요.');}
 const list=Array.isArray(data)?data:data.items;
 if(!Array.isArray(list)||!list.length)throw Error('items 목록이 비어 있습니다.');
 if(list.length>300)throw Error('평가가 너무 많습니다.');
 const str=(v,n)=>typeof v==='string'?clean(v).slice(0,n):'';
 return list.map((it,i)=>{
  const levels=(Array.isArray(it?.levels)?it.levels:[]).map(l=>({name:str(l?.name,20),note:str(l?.note,1500)})).filter(l=>l.name);
  if(levels.length<2||levels.length>5||new Set(levels.map(l=>l.name)).size!==levels.length)throw Error(`${i+1}번째 평가의 단계(levels)가 2~5개가 아니거나 이름이 겹칩니다.`);
  const code=(CODE.exec(str(it.code,40))||[''])[0].replace(/\s/g,'');
  return {subject:str(it.subject,50)||subjectOf(code),period:str(it.period,40),code,standard:str(it.standard,600),unit:str(it.unit,200),element:str(it.element,400),area:str(it.area,60),method:(Array.isArray(it.method)?it.method:[it.method]).map(x=>str(x,40)).filter(Boolean).slice(0,3),levels};
 });
}
