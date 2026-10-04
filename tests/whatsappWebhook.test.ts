import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleWhatsAppRequest } from '../server/student/whatsapp.ts';
import { getPool } from '../server/student/postgres.ts';
process.env.WHATSAPP_APP_SECRET='test-secret';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
async function call(payload:any, valid=true) {
 const rawBody=Buffer.from(JSON.stringify(payload));
 const signature='sha256='+createHmac('sha256','test-secret').update(rawBody).digest('hex');
 let body='';
 const res:any={statusCode:200,setHeader(){},end(value:string){body=value}};
 await handleWhatsAppRequest({method:'POST',url:'/api/whatsapp/webhook',rawBody,headers:{'x-hub-signature-256':valid?signature:'sha256=wrong'}} as any,res);
 return {status:res.statusCode,body:JSON.parse(body)};
}
test('active webhook rejects bad signature and accepts valid status-only payload',async()=>{
 assert.equal((await call({object:'whatsapp_business_account',entry:[]},false)).status,403);
 assert.equal((await call({object:'whatsapp_business_account',entry:[]})).status,200);
});
test('receipt persistence failure returns 503 so Meta can retry',async()=>{
 const pool=getPool();const original=pool.connect;
 pool.connect=(async()=>{throw new Error('simulated unavailable database')}) as any;
 try {
  const result=await call({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{statuses:[{id:'wamid-test',status:'delivered',timestamp:100}]}}]}]});
  assert.equal(result.status,503);
 }finally{pool.connect=original;}
});
