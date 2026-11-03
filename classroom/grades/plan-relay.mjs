// The 학교알리미 relay is deployed to two Supabase projects; the second is tried when the first is down or paused.
export const RELAYS=Object.freeze([
 'https://aolfbqfchzipyevtdhdy.supabase.co/functions/v1/schoolinfo-plan',
 'https://tgraujarnbaxyvcbabdo.supabase.co/functions/v1/schoolinfo-plan'
]);
const REASON={NO_KEY:'학교 검색이 아직 준비되지 않았습니다.',SCHOOL_NOT_FOUND:'학교알리미에서 학교를 찾지 못했습니다.',FILE_NOT_FOUND:'파일을 찾지 못했습니다.',FILE_TOO_BIG:'파일이 너무 큽니다.',CODE:'학교 코드가 올바르지 않습니다.',QUERY:'학교 이름을 두 글자 이상 입력하세요.'};
export const relayReason=code=>REASON[code]||'학교알리미에 연결하지 못했습니다.';
// Client errors (bad code, file missing) are final; network errors and 5xx move on to the next relay.
export async function relay(params,{bytes=false,relays=RELAYS,timeout=25000}={}){
 let last='RELAY_FAILED';
 for(const base of relays){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);
  try{
   const r=await fetch(base+'?'+new URLSearchParams(params),{signal:ctl.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(r.ok){
    if(!bytes)return await r.json();
    return {bytes:new Uint8Array(await r.arrayBuffer()),name:decodeURIComponent(r.headers.get('x-file-name')||'')};
   }
   const body=await r.json().catch(()=>({}));last=body.error||'HTTP_'+r.status;
   if(r.status>=400&&r.status<500&&r.status!==429)break;
  }catch{last='RELAY_FAILED';}
  finally{clearTimeout(t);}
 }
 const e=new Error(relayReason(last));e.code=last;throw e;
}
// A pasted 학교알리미 school address gives the school code without the search.
export function schoolCodeFromUrl(text){
 const s=String(text||'');
 const hg=/HG_CD=([A-Z]\d{9})/.exec(s);if(hg)return hg[1];
 const id=/SHL_IDF_CD=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(s);return id?id[1]:'';
}
export const schoolPageUrl=code=>`https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?${/^[A-Z]/.test(code)?'HG_CD':'SHL_IDF_CD'}=${encodeURIComponent(code)}`;
