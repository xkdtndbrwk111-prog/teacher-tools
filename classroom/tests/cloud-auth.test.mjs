import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeacherVerifier,createStudentSessions} from '../cloud/auth.mjs';

test('production teacher verifier fails closed without an allowed school domain',()=>{
 assert.throws(()=>createTeacherVerifier(),/TEACHER_EMAIL_DOMAIN/);
});

test('emulator teacher identity comes only from the signed test credential format',async()=>{
 const verify=createTeacherVerifier({allowTestAuth:true});
 assert.deepEqual(await verify({headers:{authorization:'Bearer teacher:teacher-a'}}),{uid:'teacher-a',email:'teacher-a@example.test',test:true});
 await assert.rejects(()=>verify({headers:{authorization:'Bearer arbitrary-token'}}));
});

test('student session rejects tampering and carries only the limited student scope',()=>{
 const sessions=createStudentSessions('synthetic-session-secret-at-least-32-bytes'),scope={ownerId:'teacher-a',classId:'class-a',year:2026,studentId:'student-a',codeVersion:2},token=sessions.issue(scope),verified=sessions.verify(token);
 assert.deepEqual({ownerId:verified.ownerId,classId:verified.classId,year:verified.year,studentId:verified.studentId,codeVersion:verified.codeVersion},scope);
 assert.throws(()=>sessions.verify(`${token}x`),/학생 로그인 필요/);
});
