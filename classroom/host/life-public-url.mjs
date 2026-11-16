import {LIFE_CLOUD_CONFIG,studentSurveyUrl} from './life-cloud-config.mjs';

// Allow the configured survey endpoint, not arbitrary HTTPS or wildcard Cloud Run hosts.
export function validatePublicSurveyUrl(payload,config=LIFE_CLOUD_CONFIG){
 const fail=()=>{throw Error('QR 공개 주소가 올바르지 않습니다.')};
 if(!payload||typeof payload.url!=='string'||payload.url.length>2048)fail();
 if(!Number.isInteger(payload.year)||payload.year<2000||payload.year>2100||![3,4,5,6,7,9,10,11,12].includes(payload.month))throw Error('설문 범위가 올바르지 않습니다.');
 let url,expected;try{url=new URL(payload.url);expected=new URL(studentSurveyUrl(config))}catch{fail()}
 if(url.username||url.password||url.hash||url.pathname!==expected.pathname)fail();
 const local=['localhost','127.0.0.1'].includes(url.hostname)&&['http:','https:'].includes(url.protocol);
 if(!local&&(url.protocol!=='https:'||url.origin!==expected.origin))fail();
 if(!local){
  for(const name of ['owner','class','year','month'])if(url.searchParams.getAll(name).length!==1)fail();
  for(const name of ['owner','class']){const value=url.searchParams.get(name);if(!value||value.length>128||value.includes('/'))fail()}
  if(url.searchParams.get('year')!==String(payload.year)||url.searchParams.get('month')!==String(payload.month))fail();
  for(const name of url.searchParams.keys())if(!['owner','class','year','month'].includes(name))fail();
 }
 return {url:url.href,local};
}
