import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createTeacherVerifier,createStudentSessions,bearer} from './auth.mjs';
import {FirestoreSurveyStore} from './firestore-store.mjs';

const projectId=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT||'teacher-tools-local',emulator=Boolean(process.env.FIRESTORE_EMULATOR_HOST),allowTestAuth=emulator&&process.env.ALLOW_TEST_AUTH==='1';
initializeApp(emulator?{projectId}:{projectId,credential:applicationDefault()});
const db=getFirestore();db.settings({ignoreUndefinedProperties:true});
const studentSecret=process.env.STUDENT_SESSION_SECRET||'',store=new FirestoreSurveyStore(db,{codePepper:studentSecret}),teacherAuth=createTeacherVerifier({allowTestAuth,allowedDomain:process.env.TEACHER_EMAIL_DOMAIN}),sessions=createStudentSessions(studentSecret,{ttlMs:Number(process.env.STUDENT_SESSION_TTL_MS||1800000)});
const port=Number(process.env.PORT||8080),allowedOrigins=new Set(String(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean)),loginLimit=Number(process.env.LOGIN_LIMIT||4),loginIpLimit=Number(process.env.LOGIN_IP_LIMIT||24),loginWindowMs=Number(process.env.LOGIN_WINDOW_MS||900000);
if(!emulator&&!allowedOrigins.size)throw Error('ALLOWED_ORIGINS is required in production');
const out=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const staticFiles=new Map([
 ['/classroom/survey/student.html',[new URL('../survey/student.html',import.meta.url),'text/html; charset=utf-8']],
 ['/classroom/survey/student.mjs',[new URL('../survey/student.mjs',import.meta.url),'text/javascript; charset=utf-8']],
 ['/classroom/survey/student.css',[new URL('../survey/student.css',import.meta.url),'text/css; charset=utf-8']],
 ['/classroom/survey/draft-store.mjs',[new URL('../survey/draft-store.mjs',import.meta.url),'text/javascript; charset=utf-8']],
 ['/classroom/host/life-mount.css',[new URL('../host/life-mount.css',import.meta.url),'text/css; charset=utf-8']],
]);
async function staticResponse(path,method,res){
 if(method!=='GET'&&method!=='HEAD')return false;
 if(path==='/'){res.writeHead(302,{Location:'/classroom/survey/student.html','Cache-Control':'no-store'});res.end();return true}
 const entry=staticFiles.get(path);if(!entry)return false;
 const data=await readFile(entry[0]);res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(method==='GET')res.end(data);else res.end();return true;
}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>65536)throw Object.assign(Error('요청 크기 초과'),{status:413})}try{return JSON.parse(text||'{}')}catch{throw Object.assign(Error('JSON 형식 오류'),{status:400})}}
function cors(req,res){const origin=req.headers.origin;if(origin&&!allowedOrigins.has(origin))throw Object.assign(Error('허용되지 않은 출처'),{status:403});if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')}}
const scopeFrom=(ownerId,value)=>({ownerId,classId:value.classId,year:Number(value.year)});
async function teacherScope(req,value){const teacher=await teacherAuth(req),scope=scopeFrom(teacher.uid,value);await store.assertClassOwner(scope.ownerId,scope.classId);return {teacher,scope}}
async function studentScope(req){return sessions.verify(bearer(req))}
const server=createServer(async(req,res)=>{
 try{
  cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
  if(await staticResponse(path,method,res))return;
  if(path==='/healthz')return out(res,200,{ok:true,emulator});
  if(allowTestAuth&&path==='/__test/metrics'&&method==='GET')return out(res,200,store.snapshotMetrics());
  if(allowTestAuth&&path==='/__test/metrics/reset'&&method==='POST'){store.resetMetrics();return out(res,200,{ok:true})}
  if(allowTestAuth&&path==='/__test/document-measure'&&method==='GET')return out(res,200,await store.measureResponse({ownerId:url.searchParams.get('ownerId'),classId:url.searchParams.get('classId'),year:Number(url.searchParams.get('year')),studentId:url.searchParams.get('studentId'),month:Number(url.searchParams.get('month'))}));
  if(path==='/api/v2/login'&&method==='POST'){
   const data=await body(req),baseScope={ownerId:data.ownerId,classId:data.classId,year:Number(data.year)},number=Number(data.number),remote=req.socket.remoteAddress||'unknown',[accountLimitRef,ipLimitRef]=await Promise.all([store.checkRateLimit(`account|${remote}|${data.ownerId}|${data.classId}|${data.year}|${number}`,{limit:loginLimit,windowMs:loginWindowMs}),store.checkRateLimit(`ip|${remote}`,{limit:loginIpLimit,windowMs:loginWindowMs})]),student=await store.studentByNumber(baseScope,number),scope=student?{...baseScope,studentId:student.studentId}:null;
   if(!await store.verifyCode(student,data.code)){await Promise.all([store.failedLogin(accountLimitRef,{windowMs:loginWindowMs}),store.failedLogin(ipLimitRef,{windowMs:loginWindowMs})]);throw Object.assign(Error('인증 실패'),{status:401})}
   const token=sessions.issue({...scope,codeVersion:student.codeVersion});return out(res,200,{token,ownerId:scope.ownerId,year:scope.year,classId:scope.classId,studentId:scope.studentId});
  }
  if(path.startsWith('/api/v2/teacher/')){
   if(path==='/api/v2/teacher/register'&&method==='POST'){const data=await body(req),teacher=await teacherAuth(req);return out(res,201,await store.register({...data,ownerId:teacher.uid}))}
   if(path==='/api/v2/teacher/sync'&&method==='POST'){const data=await body(req),teacher=await teacherAuth(req);return out(res,200,await store.syncRoster({...data,ownerId:teacher.uid}))}
   const input=method==='GET'?Object.fromEntries(url.searchParams):await body(req),{scope}=await teacherScope(req,input);
   if(path==='/api/v2/teacher/reissue'&&method==='POST')return out(res,200,await store.reissue(scope,input.id));
   if(path==='/api/v2/teacher/reissue-all'&&method==='POST')return out(res,200,await store.reissueAll(scope,input.ids));
   if(path==='/api/v2/teacher/open'&&method==='POST')return out(res,200,await store.openSurvey(scope,Number(input.month),input.open));
   if(path==='/api/v2/teacher/status'&&method==='GET')return out(res,200,await store.status(scope,Number(input.month)));
   if(path==='/api/v2/teacher/analysis'&&method==='GET')return out(res,200,await store.analysis(scope));
   if(path==='/api/v2/teacher/observations'&&method==='GET')return out(res,200,await store.observations(scope,input.studentId));
   if(path==='/api/v2/teacher/observations'&&method==='POST')return out(res,input.id?200:201,await store.saveObservation(scope,input));
   if(path==='/api/v2/teacher/observations/delete'&&method==='POST')return out(res,200,await store.deleteObservation(scope,input));
   return out(res,404,{error:'not found'});
  }
  if(path.startsWith('/api/v2/student/')){
   const scope=await studentScope(req);
   if(path==='/api/v2/student/survey'&&method==='GET')return out(res,200,await store.studentSurvey(scope,Number(url.searchParams.get('month')||5)));
   if(path==='/api/v2/student/submit'&&method==='POST')return out(res,201,await store.submit(scope,await body(req)));
   if(path==='/api/v2/student/logout'&&method==='POST')return out(res,200,{ok:true});
   return out(res,404,{error:'not found'});
  }
  return out(res,404,{error:'not found'});
 }catch(error){if(!allowTestAuth&&Number(error.status||500)>=500)console.error('request failed',{path:req.url,message:error.message});return out(res,Number(error.status||500),{error:error.status?error.message:'서버 오류'})}
});
server.listen(port,'0.0.0.0',()=>console.log(`class-life cloud ${emulator?'EMULATOR':'PRODUCTION'} listening on ${port}`));

