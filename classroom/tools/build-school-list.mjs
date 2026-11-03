// Builds classroom/grades/schools-elementary.json: every elementary school on 학교알리미 with its school page code,
// from the region → district → school lists that 학교알리미's "학교별 공시정보" page uses. Run about once a year.
//   node classroom/tools/build-school-list.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const BASE='https://www.schoolinfo.go.kr',OUT=fileURLToPath(new URL('../grades/schools-elementary.json',import.meta.url));
const SIDO={'1100000000':'서울특별시','1200000000':'전남광주통합특별시','2600000000':'부산광역시','2700000000':'대구광역시','2800000000':'인천광역시','3000000000':'대전광역시','3100000000':'울산광역시','3611000000':'세종특별자치시','4100000000':'경기도','4300000000':'충청북도','4400000000':'충청남도','4700000000':'경상북도','4800000000':'경상남도','5000000000':'제주특별자치도','5100000000':'강원특별자치도','5200000000':'전북특별자치도'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,data){
 const r=await fetch(BASE+path,{method:'POST',body:new URLSearchParams(data),headers:{'User-Agent':'teacher-tools school list builder'}});
 if(!r.ok)throw Error(path+' '+r.status);return r.json();
}
const schools=new Map();
for(const [sido,label] of Object.entries(SIDO)){
 const districts=sido.startsWith('36')?[{ADDR_CD_ID:'',ADRCD_ID_NM:label}]:await post('/ei/ss/pneiss_a03_s0_sigungu_json.do',{SIDO_CODE:sido});
 for(const d of districts){
  await wait(300);
  const list=await post('/ei/ss/pneiss_a03_s0_school_json.do',{HG_JONGRYU_GB:'02',SIDO_CODE:sido,GUGUN_CODE:d.ADDR_CD_ID});
  for(const s of list){if(/^[A-Z]\d{9}$/.test(s.SHL_CD||'')&&s.SHL_NM)schools.set(s.SHL_CD,[s.SHL_NM.trim(),(d.ADRCD_ID_NM||label).trim(),s.SHL_CD]);}
 }
 console.log(label,schools.size);
}
const rows=[...schools.values()].sort((a,b)=>a[0].localeCompare(b[0],'ko'));
writeFileSync(OUT,JSON.stringify({format:'tt.schools.elementary.v1',builtAt:new Date().toISOString().slice(0,10),source:'학교알리미 학교별 공시정보',schools:rows}));
console.log('saved',rows.length,OUT);
