import {createHmac,timingSafeEqual} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';

const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const equal=(left,right)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)};

export function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/,'')}

export function createTeacherVerifier({allowTestAuth=false,allowedDomain=''}={}){
 allowedDomain=String(allowedDomain).trim().toLowerCase().replace(/^@/,'');
 if(!allowTestAuth&&!allowedDomain)throw Error('TEACHER_EMAIL_DOMAIN is required in production');
 return async req=>{
  const token=bearer(req);
  if(allowTestAuth&&/^teacher:[a-z0-9_-]{1,100}$/i.test(token))return {uid:token.slice(8),email:`${token.slice(8)}@example.test`,test:true};
  if(!token)throw Object.assign(Error('교사 인증 필요'),{status:401});
  let decoded;try{decoded=await getAuth().verifyIdToken(token,true)}catch{throw Object.assign(Error('교사 인증 실패'),{status:401})}
  if(!decoded.uid||decoded.email_verified!==true)throw Object.assign(Error('검증된 교사 계정이 필요합니다.'),{status:403});
  if(!String(decoded.email||'').toLowerCase().endsWith(`@${allowedDomain}`))throw Object.assign(Error('허용된 학교 교사 계정이 아닙니다.'),{status:403});
  return {uid:decoded.uid,email:decoded.email||'',test:false};
 };
}

export function createStudentSessions(secret,{ttlMs=30*60*1000}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('STUDENT_SESSION_SECRET must contain at least 32 bytes');
 const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
 return {
  issue(scope){const body=encode({...scope,exp:Date.now()+ttlMs,kind:'student'});return `${body}.${sign(body)}`},
  verify(token){const [body,signature,extra]=String(token||'').split('.');if(!body||!signature||extra||!equal(signature,sign(body)))throw Object.assign(Error('학생 로그인 필요'),{status:401});let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{throw Object.assign(Error('학생 로그인 필요'),{status:401})}if(value.kind!=='student'||!Number.isFinite(value.exp)||value.exp<=Date.now())throw Object.assign(Error('학생 세션 만료'),{status:401});return value}
 };
}

