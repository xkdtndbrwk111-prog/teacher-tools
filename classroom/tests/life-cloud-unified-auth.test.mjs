// Unified-auth regression tests.  They deliberately use no Firebase custom
// token: production accepts only the existing NORMAL Google access token.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createLifeCloudClient,
 requireNormalSession,
 sameGoogleAccount,
} from '../host/life-cloud.mjs';
import {LIFE_CLOUD_CONFIG} from '../host/life-cloud-config.mjs';

const normalSession=overrides=>({
 mode:'normal',connected:true,sub:'google-subject-a',email:'teacher.a@example.test',
 key:'normal-generation-a',accessToken:'synthetic-access-token-a',expiresAt:Date.now()+60_000,
 ...overrides,
});
const firebaseUser=({subject='google-subject-a',email='teacher.a@example.test'}={})=>({
 uid:`firebase-${subject}`,email,emailVerified:true,
 providerData:[{providerId:'google.com',uid:subject}],
 getIdToken:async()=> 'firebase-id-token',
});

function mockFirebase({resultUser=firebaseUser()}={}){
 const calls=[];
 const auth={currentUser:null,authStateReady:async()=>{}};
 const app={name:'tt-class-life-unified'};
 const appSdk={getApp:()=>{throw Error('not initialized')},initializeApp:()=>app};
 const authSdk={
  inMemoryPersistence:{kind:'memory'},
  getAuth:()=>auth,
  setPersistence:async(_auth,persistence)=>calls.push(['persistence',persistence.kind]),
  signOut:async target=>{calls.push(['signOut']);target.currentUser=null},
  GoogleAuthProvider:{credential:(idToken,accessToken)=>{calls.push(['credential',idToken,accessToken]);return {accessToken}}},
  signInWithCredential:async(target,credential)=>{calls.push(['signIn',credential.accessToken]);target.currentUser=resultUser;return {user:resultUser}},
 };
 return {auth,calls,loadSdk:async()=>[appSdk,authSdk]};
}

test('NORMAL Google access token alone creates the in-memory Firebase session',async()=>{
 let session=normalSession();const mock=mockFirebase();const requests=[];
 const client=createLifeCloudClient(LIFE_CLOUD_CONFIG,{
  getSession:()=>session,loadSdk:mock.loadSdk,
  fetchImpl:async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}})},
 });
 assert.deepEqual(await client.connect(),{uid:'firebase-google-subject-a',email:'teacher.a@example.test'});
 assert.deepEqual(mock.calls.slice(0,4),[
  ['persistence','memory'],['signOut'],['signOut'],['credential',null,'synthetic-access-token-a'],
 ]);
 await client.request('/api/v2/teacher/status?year=2026&classId=class-a&month=5');
 assert.equal(requests.length,1);
 assert.equal(requests[0].init.headers.Authorization,'Bearer firebase-id-token');
 assert.equal(client.user.uid,'firebase-google-subject-a');

 // A NORMAL account change clears the verified Firebase identity before use.
 session=normalSession({sub:'google-subject-b',email:'teacher.b@example.test',key:'normal-generation-b'});
 await assert.rejects(()=>client.request('/api/v2/teacher/status?year=2026&classId=class-a&month=5'),/계정 일치|통합 인증/);
 assert.equal(client.user,null);
});

test('expired, EASY, and mismatched identities are blocked before teacher API use',async()=>{
 assert.throws(()=>requireNormalSession(()=>normalSession({expiresAt:Date.now()-1})),/NORMAL 모드/);
 assert.throws(()=>requireNormalSession(()=>normalSession({mode:'easy',connected:false})),/NORMAL 모드/);
 assert.equal(sameGoogleAccount(firebaseUser(),normalSession()),true);
 assert.equal(sameGoogleAccount(firebaseUser({subject:'other-google-subject'}),normalSession()),false);

 const mock=mockFirebase({resultUser:firebaseUser({subject:'other-google-subject'})});
 const client=createLifeCloudClient(LIFE_CLOUD_CONFIG,{getSession:()=>normalSession(),loadSdk:mock.loadSdk,fetchImpl:async()=>{throw Error('must not fetch')}});
 await assert.rejects(()=>client.connect(),/계정 일치 검증/);
 assert.equal(mock.auth.currentUser,null);
});

test('EASY transition invalidates the in-memory Firebase session and aborts later access',async()=>{
 let session=normalSession();const mock=mockFirebase();
 const client=createLifeCloudClient(LIFE_CLOUD_CONFIG,{getSession:()=>session,loadSdk:mock.loadSdk,fetchImpl:async()=>new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}})});
 await client.connect();
 session=normalSession({mode:'easy',connected:false,sub:'',email:'',key:'easy-generation',accessToken:''});
 await client.invalidate();
 assert.equal(client.user,null);
 await assert.rejects(()=>client.request('/api/v2/teacher/status?year=2026&classId=class-a&month=5'),/NORMAL 모드/);
});
