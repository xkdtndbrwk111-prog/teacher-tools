import {createHmac,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
// Separate, domain-bound encryption key; never logged or sent to the browser.
const key=secret=>{if(typeof secret!=='string'||secret.length<16)throw Error('Student code vault secret missing');return createHmac('sha256',secret).update('teacher-tools/class-life/code-vault/v1').digest()};
const aad=(scope,id,version)=>Buffer.from(JSON.stringify(['tt-code-vault-v1',String(scope.ownerId),String(scope.classId),Number(scope.year),String(id),Number(version)]));
export function sealCode(secret,scope,id,version,code){
 if(!/^\d{6}$/.test(code))throw Error('Invalid code format');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(aad(scope,id,version));const body=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),body.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
export function unsealCode(secret,scope,id,version,record){
 if(typeof record!=='string')return null;
 const [format,iv,body,tag,...rest]=record.split('.');if(format!=='v1'||rest.length||!iv||!body||!tag)throw Error('Invalid code vault data');
 const nonce=Buffer.from(iv,'base64url'),ciphertext=Buffer.from(body,'base64url'),auth=Buffer.from(tag,'base64url');
 if(nonce.length!==12||ciphertext.length!==6||auth.length!==16)throw Error('Invalid code vault data');
 const decipher=createDecipheriv('aes-256-gcm',key(secret),nonce);decipher.setAAD(aad(scope,id,version));decipher.setAuthTag(auth);const code=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');if(!/^\d{6}$/.test(code))throw Error('Invalid decrypted code');return code;
}
