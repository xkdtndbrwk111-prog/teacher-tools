export const LIFE_CLOUD_CONFIG=Object.freeze({
 enabled:true,
 apiBase:'https://teacher-tools-class-life-397335421867.asia-northeast3.run.app',
 firebase:Object.freeze({
  apiKey:'AIzaSyDdEq9KFw054Rzwwe-ntfIebYhixThClxE',
  authDomain:'tt-cloud-test-111-20261108.firebaseapp.com',
  projectId:'tt-cloud-test-111-20261108',
  appId:'1:397335421867:web:c31026143f72659f1968ee',
 }),
});

export const studentSurveyUrl=config=>`${String(config.apiBase).replace(/\/$/,'')}/classroom/survey/student.html`;
