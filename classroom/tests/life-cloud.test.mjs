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

test('교실매니저는 TEST 비밀값 대신 Firebase 교사 인증을 사용하고 온라인 기능만 끌 수 있다',async()=>{
 const source=await readFile(new URL('../host/life-mount.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/life-secret|TEST 교사 비밀값/);
 assert.match(source,/Google 교사 로그인/);
 assert.match(source,/온라인 기능만 껐습니다/);
 assert.match(source,/\/api\/v2\/teacher\/sync/);
 assert.doesNotMatch(source,/return lifeCloud\.restore\(\)/,'기존 메뉴를 여는 것만으로 Firebase 인증 SDK를 불러오면 안 된다');
});
