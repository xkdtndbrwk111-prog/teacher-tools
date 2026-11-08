const DB_NAME='tt-class-life-drafts-v1',STORE='drafts',VERSION=1,TTL=30*24*60*60*1000;

function text(value,name,max=256){if(typeof value!=='string'||!value||value.length>max)throw Error(`${name} 범위가 올바르지 않습니다.`);return value}

export function draftOwner(scope){
 const year=Number(scope?.year),month=Number(scope?.month);
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error('학년도 범위가 올바르지 않습니다.');
 if(![3,4,5,6,7,9,10,11,12].includes(month))throw Error('설문 월 범위가 올바르지 않습니다.');
 return {ownerId:text(scope.ownerId,'소유자 ID',128),year,classId:text(scope.classId,'학급 ID',128),studentId:text(scope.studentId,'학생 ID',128),month,version:text(scope.version,'설문 버전',64)};
}

export function draftKey(scope){const owner=draftOwner(scope);return JSON.stringify([owner.ownerId,owner.year,owner.classId,owner.studentId,owner.month,owner.version])}

export function draftValues(form){const values={};for(const control of form.elements){if(!control.name||control.disabled)continue;if(control.type==='radio'){if(control.checked)values[control.name]=control.value}else if(control.tagName==='SELECT'||control.tagName==='TEXTAREA'||control.tagName==='INPUT')values[control.name]=control.value}return values}

export function applyDraftValues(form,values){if(!values||typeof values!=='object'||Array.isArray(values))return false;let restored=false;for(const control of form.elements){if(!control.name||!Object.hasOwn(values,control.name))continue;const value=values[control.name];if(typeof value!=='string')continue;if(control.type==='radio'){control.checked=control.value===value;restored||=control.checked}else if(control.tagName==='SELECT'){if([...control.options].some(option=>option.value===value)){control.value=value;restored||=Boolean(value)}}else if(control.tagName==='TEXTAREA'||control.tagName==='INPUT'){control.value=value;restored||=Boolean(value)}}return restored}

function database(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(Error('IndexedDB를 사용할 수 없습니다.'));const request=indexedDB.open(DB_NAME,VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}

async function transact(mode,operation){const db=await database();try{return await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,mode),store=transaction.objectStore(STORE);let request;try{request=operation(store)}catch(error){reject(error);return}request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);transaction.onabort=()=>reject(transaction.error||Error('임시 저장 작업이 취소되었습니다.'))})}finally{db.close()}}

const bytes=value=>new TextEncoder().encode(value),encode=value=>{let text='';for(const byte of value)text+=String.fromCharCode(byte);return btoa(text)},decode=value=>{const text=atob(value),result=new Uint8Array(text.length);for(let i=0;i<text.length;i++)result[i]=text.charCodeAt(i);return result};

export async function createDraftCipher(scope,studentCode){const owner=draftOwner(scope);if(typeof studentCode!=='string'||studentCode.length<12)throw Error('임시 저장 암호화에 사용할 학생 인증 정보가 부족합니다.');const material=await crypto.subtle.importKey('raw',bytes(studentCode),'PBKDF2',false,['deriveKey']),derive=salt=>crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);return {async seal(values){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(salt),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes(JSON.stringify(values)));return {salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))}},async open(sealed){const key=await derive(decode(sealed.salt)),plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(sealed.iv)},key,decode(sealed.ciphertext)),value=JSON.parse(new TextDecoder().decode(plaintext));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('임시 저장 데이터 형식이 올바르지 않습니다.');return value}}}

export async function saveDraft(scope,values,cipher){if(!cipher?.seal)throw Error('임시 저장 암호화가 준비되지 않았습니다.');const owner=draftOwner(scope),key=draftKey(owner),now=Date.now(),sealed=await cipher.seal(values);await transact('readwrite',store=>store.put({key,owner,sealed,updatedAt:new Date(now).toISOString(),expiresAt:now+TTL}));return key}

export async function loadDraft(scope,cipher){if(!cipher?.open)throw Error('임시 저장 복호화가 준비되지 않았습니다.');const owner=draftOwner(scope),key=draftKey(owner),record=await transact('readonly',store=>store.get(key));if(!record)return null;if(record.expiresAt<=Date.now()){await deleteDraft(owner);return null}if(JSON.stringify(record.owner)!==JSON.stringify(owner)||!record.sealed)return null;try{return {...record,values:await cipher.open(record.sealed)}}catch{await deleteDraft(owner);return null}}

export async function deleteDraft(scope){await transact('readwrite',store=>store.delete(draftKey(scope)))}

export async function purgeExpiredDrafts(now=Date.now()){const db=await database();try{await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite'),request=transaction.objectStore(STORE).openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;if(Number(cursor.value?.expiresAt)<=now)cursor.delete();cursor.continue()};request.onerror=()=>reject(request.error);transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error||Error('만료 임시 저장 정리에 실패했습니다.'))})}finally{db.close()}}

export const DRAFT_DB_NAME=DB_NAME;
