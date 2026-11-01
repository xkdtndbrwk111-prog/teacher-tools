// Password protection for backup files. A wrong password or an altered file fails to open.
const HEADER='tt-encrypted-backup',ITERATIONS=310000;
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
function encodeLong(bytes){
 const view=new Uint8Array(bytes);let out='';
 for(let i=0;i<view.length;i+=32768)out+=String.fromCharCode(...view.subarray(i,i+32768));
 return btoa(out);
}
const unb64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function keyFrom(password,salt,iterations){
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export const isEncrypted=data=>data?.header===HEADER;
export async function encryptBundle(bundle,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await keyFrom(password,salt,ITERATIONS);
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(bundle)));
 return{header:HEADER,version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),data:encodeLong(data)};
}
export async function decryptBundle(file,password){
 if(!isEncrypted(file)||file.version!==1)throw Error('지원하지 않는 암호 백업 형식입니다.');
 if(!Number.isInteger(file.iterations)||file.iterations<1||file.iterations>10000000)throw Error('백업 파일이 손상되었습니다.');
 let plain;
 try{
  const key=await keyFrom(password,unb64(file.salt),file.iterations);
  plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(file.iv)},key,unb64(file.data));
 }catch{throw Error('암호가 맞지 않거나 파일이 손상되었습니다.')}
 return JSON.parse(new TextDecoder().decode(plain));
}
