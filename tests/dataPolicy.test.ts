import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMutation, studentFieldError } from '../server/student/dataPolicy.ts';
const viewer={userId:'s1',email:'s1@example.com',role:'student',admin:false,keys:new Set(['s1'])};
test('students cannot assign counselors, convert leads or approve documents',()=>{
 for(const [table,payload] of [['student_leads',{assigned_counselor_id:'c1'}],['student_leads',{entity_type:'student'}],['documents',{status:'approved'}],['applications',{status:'submitted'}]] as const)
   assert.ok(studentFieldError({action:'update',table,payload},[{id:'own',user_id:'s1'}]));
});
test('legitimate upload, draft and new unassigned lead are permitted',()=>{
 assert.equal(studentFieldError({action:'insert',table:'student_leads',rows:[{assigned_counselor_id:null,entity_type:'lead',status:'new'}]},[]),null);
 assert.equal(studentFieldError({action:'update',table:'documents',payload:{status:'uploaded',file_path:'s1/new.pdf',reviewed_by:null}},[{reviewed_by:'c1'}]),null);
 assert.equal(studentFieldError({action:'insert',table:'applications',rows:[{status:'draft'}]},[]),null);
});
test('unowned row and role escalation denied; admin can manage cases',async()=>{
 assert.ok(await checkMutation(viewer,{action:'update',table:'documents',payload:{}},[{user_id:'s2'}]));
 assert.ok(await checkMutation(viewer,{action:'insert',table:'user_roles',rows:[{user_id:'s1',role:'admin'}]},[]));
 assert.equal(await checkMutation({...viewer,admin:true},{action:'update',table:'student_leads',payload:{assigned_counselor_id:'c1'}},[]),null);
});

test('mixed ownership and foreign file references cannot bypass row isolation',async()=>{
 assert.ok(await checkMutation(viewer,{action:'insert',table:'documents',rows:[{user_id:'s2',sender_id:'s1'}]},[]));
 assert.ok(await checkMutation(viewer,{action:'insert',table:'documents',rows:[{user_id:'s1',file_path:'s2/private.pdf'}]},[]));
});

test('students cannot forge phone verification, foreign identity or delete submitted work',async()=>{
 assert.ok(studentFieldError({action:'update',table:'profiles',payload:{whatsapp_verified:true}},[{whatsapp_verified:false}]));
 assert.ok(studentFieldError({action:'update',table:'profiles',payload:{whatsapp_number:'new-number'}},[{whatsapp_verified:true,whatsapp_number:'old-number'}]));
 assert.ok(await checkMutation(viewer,{action:'insert',table:'student_leads',rows:[{user_id:'s1',email:'s2@example.com'}]},[]));
 assert.ok(studentFieldError({action:'delete',table:'applications'},[{status:'submitted'}]));
});
