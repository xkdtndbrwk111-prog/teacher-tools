import {LIFE_CLOUD_CONFIG,studentSurveyUrl} from './life-cloud-config.mjs';

const APP_SDK='https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
const AUTH_SDK='https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
const trimBase=value=>String(value||'').replace(/\/+$/,'');

export function validateLifeCloudConfig(config=LIFE_CLOUD_CONFIG){
 const base=trimBase(config?.apiBase),firebase=config?.firebase;
 if(config?.enabled!==true)throw Error('학급생활 온라인 기능이 꺼져 있습니다.');
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw Error('학급생활 서버 주소가 올바르지 않습니다.');
 if(!firebase||!/^AIza[A-Za-z0-9_-]{20,}$/.test(firebase.apiKey||'')||!firebase.authDomain||!firebase.projectId||!firebase.appId)throw Error('Firebase 교사 인증 설정이 올바르지 않습니다.');
 return {apiBase:base,firebase};
}

let sdkPromise;
async function firebaseSdk(){
 if(!sdkPromise)sdkPromise=Promise.all([import(APP_SDK),import(AUTH_SDK)]).catch(error=>{sdkPromise=null;throw Object.assign(Error('교사 로그인 모듈을 불러오지 못했습니다.'),{cause:error})});
 return sdkPromise;
}

// Never infer identity from email alone: compare Google's immutable provider UID.
export function sameGoogleAccount(user,session){
 return Boolean(user&&session&&user.emailVerified===true&&String(user.email||'').toLowerCase()===String(session.email||'').toLowerCase()&&Array.isArray(user.providerData)&&user.providerData.some(p=>p.providerId==='google.com'&&String(p.uid)===String(session.sub)));
}
export function requireNormalSession(getSession){
 const s=getSession();
 if(s?.mode!=='normal'||s.connected!==true||!s.sub||!s.email||!s.key||!s.accessToken||!Number.isFinite(s.expiresAt)||Date.now()>=s.expiresAt)throw Error('NORMAL 모드에서 Google 통합 로그인이 필요합니다.');
 return s;
}
export function createLifeCloudClient(config=LIFE_CLOUD_CONFIG,{getSession=()=>globalThis.__TT_NORMAL_AUTH?.session(),loadSdk=firebaseSdk,fetchImpl=(...args)=>fetch(...args)}={}){
 const checked=validateLifeCloudConfig(config);
 let auth=null,sdk=null,prepared=null,verifiedKey='',generation=0,queue=Promise.resolve();
 const controllers=new Set(),session=()=>requireNormalSession(getSession);
 const run=task=>{const result=queue.then(task);queue=result.catch(()=>{});return result};
 const assertCurrent=(s,epoch)=>{if(epoch!==generation||session().key!==s.key)throw Error('Google 연결 또는 계정이 변경되었습니다. 다시 시도하세요.')};
 const match=s=>verifiedKey===s.key&&sameGoogleAccount(auth?.currentUser,s);
 async function prepare(){
  if(!prepared)prepared=(async()=>{const [appSdk,authSdk]=await loadSdk();const name='tt-class-life-unified';let app;
   try{app=appSdk.getApp(name)}catch{app=appSdk.initializeApp(checked.firebase,name)}
   const a=authSdk.getAuth(app);await authSdk.setPersistence(a,authSdk.inMemoryPersistence);await a.authStateReady();
   await authSdk.signOut(a);auth=a;sdk=authSdk;
  })().catch(error=>{prepared=null;throw error});
  await prepared;
 }
 function identity(){try{const s=session();return match(s)?{uid:auth.currentUser.uid,email:auth.currentUser.email||''}:null}catch{return null}}
 async function connect(){
  const s=session(),epoch=generation;
  return run(async()=>{
   assertCurrent(s,epoch);await prepare();assertCurrent(s,epoch);
   if(match(s))return identity();
   verifiedKey='';await sdk.signOut(auth);assertCurrent(s,epoch);
   try{
    const credential=sdk.GoogleAuthProvider.credential(null,s.accessToken);
    const result=await sdk.signInWithCredential(auth,credential);
    assertCurrent(s,epoch);
    if(!sameGoogleAccount(result.user,s))throw Error('GOOGLE_IDENTITY_MISMATCH');
    verifiedKey=s.key;return identity();
   }catch(error){
    verifiedKey='';await sdk.signOut(auth).catch(()=>{});
    const code=String(error?.code||'');
    throw Error(error?.message==='GOOGLE_IDENTITY_MISMATCH'?'Google 계정 일치 검증에 실패했습니다.':/^auth\/[a-z0-9-]+$/.test(code)?'통합 인증 실패 ('+code+')':'통합 인증에 실패했습니다. 다시 연결하세요.');
   }
  });
 }
 function invalidate(){
  ++generation;verifiedKey='';
  for(const controller of controllers)controller.abort();controllers.clear();
  return run(async()=>{if(auth&&sdk)await sdk.signOut(auth)});
 }
 return {
  get user(){return identity()},get enabled(){try{session();return true}catch{return false}},
  apiBase:checked.apiBase,studentUrl:studentSurveyUrl(checked),connect,invalidate,
  async request(path,{method='GET',data,teacher=true,credential}={}){
   const s=session(),epoch=generation;
   if(typeof path!=='string'||!path.startsWith('/api/v2/'))throw Error('학급생활 API 경로가 올바르지 않습니다.');
   await connect();assertCurrent(s,epoch);
   if(!match(s))throw Error('Google 계정 일치 검증에 실패했습니다.');
   const token=teacher?await auth.currentUser.getIdToken(false):credential;
   assertCurrent(s,epoch);
   const controller=new AbortController();controllers.add(controller);
   try{
    let response;try{response=await fetchImpl(checked.apiBase+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal})}catch{throw Error('학급생활 클라우드 요청을 완료하지 못했습니다.')}
    let result=null;try{if((response.headers.get('content-type')||'').includes('application/json'))result=await response.json()}catch{}
    assertCurrent(s,epoch);
    if(!response.ok)throw Object.assign(Error(result?.error||`학급생활 서버 오류 (${response.status})`),{status:response.status});
    if(!result)throw Error('학급생활 서버 응답을 확인할 수 없습니다.');return result;
   }finally{controllers.delete(controller)}
  }
 };
}
