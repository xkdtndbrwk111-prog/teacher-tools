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

export function createLifeCloudClient(config=LIFE_CLOUD_CONFIG){
 const checked=validateLifeCloudConfig(config);let auth=null,user=null,disabled=false,listeners=new Set();
 const notify=()=>listeners.forEach(listener=>listener({enabled:!disabled,user:user?{uid:user.uid,email:user.email||''}:null}));
 async function prepare(){
  if(disabled)throw Error('학급생활 온라인 기능이 현재 꺼져 있습니다.');
  const [appSdk,authSdk]=await firebaseSdk();
  const name='tt-class-life-cloud';let app;
  try{app=appSdk.getApp(name)}catch{app=appSdk.initializeApp(checked.firebase,name)}
  if(!auth){auth=authSdk.getAuth(app);await authSdk.setPersistence(auth,authSdk.browserSessionPersistence);await auth.authStateReady();user=auth.currentUser;authSdk.onAuthStateChanged(auth,value=>{user=value;notify()})}
  return {auth,authSdk};
 }
 async function token(){const prepared=await prepare();user=prepared.auth.currentUser;if(!user)throw Error('학급생활용 Google 교사 로그인이 필요합니다.');return user.getIdToken(false)}
 return {
  get enabled(){return !disabled},
  get user(){return user?{uid:user.uid,email:user.email||''}:null},
  apiBase:checked.apiBase,
  studentUrl:studentSurveyUrl(checked),
  subscribe(listener){listeners.add(listener);listener({enabled:!disabled,user:user?{uid:user.uid,email:user.email||''}:null});return()=>listeners.delete(listener)},
  async restore(){await prepare();notify();return this.user},
  async connect(){const {auth,authSdk}=await prepare();const provider=new authSdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await authSdk.signInWithPopup(auth,provider);user=auth.currentUser;notify();return this.user},
  async connectWithCustomToken(tokenValue){if(typeof tokenValue!=='string'||tokenValue.length<100)throw Error('시험용 교사 토큰이 올바르지 않습니다.');const {auth,authSdk}=await prepare();await authSdk.signInWithCustomToken(auth,tokenValue);user=auth.currentUser;notify();return this.user},
  async disconnect(){const {auth,authSdk}=await prepare();await authSdk.signOut(auth);user=null;notify()},
  disable(){disabled=true;user=null;notify()},
  async retry(){disabled=false;return this.restore()},
  url(path){if(typeof path!=='string'||!path.startsWith('/'))throw Error('학급생활 API 경로가 올바르지 않습니다.');return checked.apiBase+path},
  async request(path,{method='GET',data,teacher=true,credential}={}){
   if(disabled)throw Error('학급생활 온라인 기능이 현재 꺼져 있습니다.');
   const bearer=teacher?await token():credential;
   let response;try{response=await fetch(checked.apiBase+path,{method,headers:{...(bearer?{Authorization:`Bearer ${bearer}`}:{}) ,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})}catch{throw Error('학급생활 클라우드 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.')}
   let result=null;try{if((response.headers.get('content-type')||'').includes('application/json'))result=await response.json()}catch{}
   if(!response.ok)throw Object.assign(Error(result?.error||`학급생활 서버 오류 (${response.status})`),{status:response.status});
   if(!result)throw Error('학급생활 서버 응답을 확인할 수 없습니다.');return result;
  },
 };
}
