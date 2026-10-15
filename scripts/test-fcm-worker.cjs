const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
async function run(transport,validation=true,result={ok:true,code:'200'}){
  const calls=[],acks=[],events=[];let handler,checks=0;
  const row={id:'11111111-1111-4111-8111-111111111111',leaseId:'22222222-2222-4222-8222-222222222222',subscription:{transport,token:'test-only'},payload:{id:'notice',binding:'binding',category:'test'}};
  const context=vm.createContext({Deno:{env:{get:name=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only'})[name]},serve:fn=>handler=fn},
    Response,AbortSignal,TextEncoder,crypto:webcrypto,console:{error:()=>{}},
    sendAPNS:async()=>{events.push('apns');return {ok:true,code:'200'};},
    sendFCM:async(subscription,payload,options)=>{events.push('fcm');const allowed=await options.beforeSend();return allowed?result:{ok:false,code:'REVOKED',cancelled:true};},
    webpush:{generateRequestDetails:()=>{events.push('web');if(transport==='fcm')throw new Error('NOT_WEB_PUSH');return {endpoint:'https://push.invalid',headers:{},body:'test-only'};}},
    fetch:async(url,request)=>{
      calls.push(String(url));if(String(url).includes('pm_booking_push_context'))return Response.json(null);
      if(String(url).endsWith('pm_push_worker')){
        const params=JSON.parse(request.body);const action=params.p_action;
        if(action==='config')return Response.json({job_secret:'a'.repeat(64),public_key:'test-only'});
        if(action==='claim')return Response.json([row]);
        if(action==='validate'){checks++;return Response.json({valid:typeof validation==='function'?validation(checks):validation});}
        if(action==='ack'){acks.push(params.p_data);return Response.json({ok:true});}
      }
      return new Response(null,{status:201});
    }});
  const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../notifications/process-push-queue/index.ts'),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
  vm.runInContext(source,context);
  const response=await handler(new Request('https://worker.invalid',{method:'POST',headers:{'x-push-secret':'a'.repeat(64)}}));
  return {response,events,acks,calls,checks};
}

test('worker dispatches FCM data transport without invoking Web Push',async()=>{
  const result=await run('fcm');assert.deepEqual(result.events,['fcm']);
  assert.equal(result.acks[0].result,'sent');assert.equal(result.checks,2);
});
test('FCM final lease revocation cancels rather than acknowledges a send',async()=>{
  const result=await run('fcm',n=>n===1);assert.deepEqual(result.events,['fcm']);
  assert.equal(result.acks[0].result,'cancelled');assert.equal(result.acks[0].code,'REVOKED');
});
test('worker preserves APNs and legacy browser subscriptions',async()=>{
  assert.deepEqual((await run('apns')).events,['apns']);
  assert.deepEqual((await run(undefined)).events,['web']);
});
test('revoked queue rows never invoke any provider',async()=>{
  const result=await run('fcm',false);assert.deepEqual(result.events,[]);
  assert.equal(result.acks[0].result,'cancelled');
});
test('FCM provider failures retain structured error codes instead of marking delivery sent',async()=>{
  const result=await run('fcm',true,{ok:false,code:'FCM_403_PERMISSION_DENIED'});
  assert.equal(result.acks[0].result,'failed');assert.equal(result.acks[0].code,'FCM_403_PERMISSION_DENIED');
});
