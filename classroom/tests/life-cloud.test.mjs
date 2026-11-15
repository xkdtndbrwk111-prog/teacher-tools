import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLifeCloudConfig} from '../host/life-cloud.mjs';
import {LIFE_CLOUD_CONFIG,studentSurveyUrl} from '../host/life-cloud-config.mjs';

test('학급생활 클라우드 설정은 HTTPS TEST 서버와 Firebase 앱을 사용한다',()=>{
 const value=validateLifeCloudConfig(LIFE_CLOUD_CONFIG);
 assert.equal(value.apiBase,'https://teacher-tools-class-life-397335421867.asia-northeast3.run.app');
 assert.equal(value.firebase.projectId,'tt-cloud-test-111-20261108');
 assert.equal(studentSurveyUrl(LIFE_CLOUD_CONFIG),`${value.apiBase}/classroom/survey/student.html`);
 assert.throws(()=>validateLifeCloudConfig({...LIFE_CLOUD_CONFIG,apiBase:'http://127.0.0.1:9999'}),/서버 주소/);
});

test('학급생활은 NORMAL 인증을 사용하며 독립 팝업과 테스트 토큰 진입을 제거한다',async()=>{
 const mount=await readFile(new URL('../host/life-mount.js',import.meta.url),'utf8'),client=await readFile(new URL('../host/life-cloud.mjs',import.meta.url),'utf8');
 assert.ok(mount.includes("s.mode==='normal'&&s.connected===true"));
 assert.ok(mount.includes('tt-normal-auth-change'));assert.ok(mount.includes('/api/v2/teacher/sync'));
 assert.match(client,/signInWithCredential/);
 for(const forbidden of ['signInWithPopup','connectWith'+'CustomToken','browserSessionPersistence'])assert.ok(!client.includes(forbidden));
});
