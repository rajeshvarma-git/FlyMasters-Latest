import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../server/routes/cases.mjs';
import { pool } from '../server/lib/db.mjs';
const handler=router.stack.find(l=>l.route?.path==='/api/case/me/notifications').route.stack.at(-1).handle;
for(const assigned of [false,true]) test(`student notification targets ${assigned?'assigned counselor':'admin queue'}, never all counselors`,async()=>{
 const original=pool.query;
 const writes=[];
 pool.query=async(sql,args=[])=>{
   if(sql.includes("INSERT INTO app_records")) {const data=JSON.parse(args[2]);writes.push(data);return {rows:[{id:args[0],data}]};}
   if(sql.includes("data->>$2 = ANY")) return {rows:[{id:'lead1',data:{user_id:'student1',assigned_counselor_id:assigned?'counselor1':null}}]};
   if(sql.includes("SELECT user_id FROM user_roles")) return {rows:[{user_id:assigned?'counselor1':'admin1'}]};
   if(sql.includes("table_name = $1")) return {rows:[]};
   throw new Error(`Unexpected query: ${sql}`);
 };
 let status=200,body;
 const res={status(code){status=code;return this},json(payload){body=payload;return this}};
 try{
   await handler({user:{id:'student1'},body:{title:'Review request',message:'A student needs review'}},res);
   assert.equal(status,200);assert.equal(body.ok,true);
   assert.equal(writes.length,2);assert.ok(writes.every(w=>w.user_id===(assigned?'counselor1':'admin1')));
 }finally{pool.query=original;}
});
