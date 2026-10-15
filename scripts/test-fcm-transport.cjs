const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const file=path.join(__dirname,'../notifications/process-push-queue/fcm.ts');
const nativeToken='CaseSensitive:AbC_X-1'.repeat(9);
const notice={id:'11111111-1111-4111-8111-111111111111',binding:'22222222-2222-4222-8222-222222222222',category:'booking',
  title:'NEVER_INCLUDE',body:'NEVER_INCLUDE',phone:'NEVER_INCLUDE',booking:{id:'book-example',pending:true,branch:'프로모터스 안산점',schedule:'2099.01.01 · 10:00',
  customerName:'예시 고객',vehicleName:'BMW 320i',vehiclePlate:'비공개',phone:'NEVER_INCLUDE',memo:'NEVER_INCLUDE',
  snapshot:{pendingCount:1,upcomingCount:2,startsAt:4000000000,branch:'프로모터스 안산점',schedule:'2099.01.01 · 10:00',bookingId:'book-example',customerName:'예시 고객',vehicleName:'BMW 320i',vehiclePlate:'비공개',memo:'NEVER_INCLUDE'}}};
function setup(options={}) {
  const requests=[],signed=[]; let fcmStatus=200,errorCode='',beforeCalls=0;
  const env={FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'promotors-8ddec',client_email:'test@promotors-8ddec.iam.gserviceaccount.com',private_key:'TEST_ONLY'}),...options.env};
  const context=vm.createContext({Deno:{env:{get:name=>env[name]}},URLSearchParams,TextEncoder,AbortSignal,Response,Date,console,
    importPKCS8:async()=> 'test-only',SignJWT:class{
      constructor(payload){for(const [name,value] of Object.entries(payload))signed.push({name,value});}
      setProtectedHeader(){return this;}setIssuer(){return this;}setAudience(){return this;}setIssuedAt(){return this;}setExpirationTime(){return this;}
      async sign(){return 'test-only';}
    },fetch:async(url,request)=>{
      const oauth=String(url).includes('oauth2.googleapis.com');
      requests.push({url:String(url),request,body:oauth?null:JSON.parse(request.body)});
      if(oauth)return Response.json({access_token:'test-only',expires_in:3600});
      return Response.json(fcmStatus===200?{name:'projects/promotors-8ddec/messages/example'}:{error:{status:errorCode,details:errorCode?[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode}]:[]}}, {status:fcmStatus});
    }});
  const source=stripTypeScriptTypes(fs.readFileSync(file,'utf8').replace(/^import[^\r\n]*\r?\n/gm,'').replace(/^export /gm,''));
  vm.runInContext(source,context);
  return {requests,signed,env,api:context,setError:(status,code)=>{fcmStatus=status;errorCode=code;},beforeSend:async()=>{beforeCalls++;return false;},beforeCalls:()=>beforeCalls};
}

test('FCM is data-only, scoped, short-lived and contains only authorized reservation fields',async()=>{
  const s=setup(); const result=await s.api.sendFCM({transport:'fcm',token:nativeToken},notice);
  assert.equal(result.ok,true);
  const request=s.requests.find(row=>row.url.includes('fcm.googleapis.com'));
  assert.equal(request.body.message.token,nativeToken);
  assert.equal(request.body.message.notification,undefined);
  assert.equal(request.body.message.android.restricted_package_name,'kr.promotors.app');
  assert.equal(request.body.message.android.ttl,'300s');
  const data=request.body.message.data; assert.ok(Object.values(data).every(value=>typeof value==='string'));
  assert.equal(data.binding,notice.binding); assert.equal(Number(data.expiresAt)-Number(data.issuedAt),300);
  assert.equal(JSON.parse(data.booking).customerName,'예시 고객');
  assert.match(data.body,/예시 고객/); assert.match(data.body,/BMW 320i/); assert.match(data.body,/비공개/);
  assert.equal(JSON.stringify(request.body).includes('NEVER_INCLUDE'),false);
  assert.ok(new TextEncoder().encode(JSON.stringify(data)).length<=4096);
});

test('dry run sets validate_only and never reports a notification as actually sent',async()=>{
  const s=setup();const result=await s.api.sendFCM({transport:'fcm',token:nativeToken},notice,{validateOnly:true});
  assert.equal(result.ok,true); assert.equal(result.code,'FCM_VALIDATED');assert.equal(result.validatedOnly,true);
  assert.equal(s.requests.find(row=>row.url.includes('fcm.googleapis.com')).body.validate_only,true);
});

test('only structured UNREGISTERED revokes a token; project 404 and IAM 403 never map to 404/410',async()=>{
  const s=setup();
  for(const [status,code,expected]of[[404,'UNREGISTERED','410'],[404,'NOT_FOUND','FCM_404_NOT_FOUND'],[403,'SENDER_ID_MISMATCH','FCM_403_SENDER_ID_MISMATCH'],[403,'PERMISSION_DENIED','FCM_403_PERMISSION_DENIED'],[400,'INVALID_ARGUMENT','FCM_400_INVALID_ARGUMENT'],[429,'QUOTA_EXCEEDED','FCM_429_QUOTA_EXCEEDED']]){
    s.setError(status,code);const result=await s.api.sendFCM({transport:'fcm',token:nativeToken},notice);
    assert.equal(result.ok,false);assert.equal(result.code,expected);
  }
});

test('final binding/lease check happens after OAuth and prevents a revoked delivery',async()=>{
  const s=setup();const result=await s.api.sendFCM({transport:'fcm',token:nativeToken},notice,{beforeSend:s.beforeSend});
  assert.equal(result.cancelled,true);assert.equal(result.code,'REVOKED');assert.equal(s.beforeCalls(),1);
  assert.equal(s.requests.filter(row=>row.url.includes('fcm.googleapis.com')).length,0);
});

test('malformed binding/token or credentials fail without exposing secrets or calling another project',async()=>{
  const s=setup();
  await assert.rejects(s.api.sendFCM({transport:'fcm',token:'bad\nheader'},notice),/FCM_INVALID_TOKEN/);
  await assert.rejects(s.api.sendFCM({transport:'fcm',token:nativeToken},{...notice,binding:'bad'}),/FCM_INVALID_PAYLOAD/);
  s.env.FCM_SERVICE_ACCOUNT_JSON='not-json-DO_NOT_ECHO';
  await assert.rejects(s.api.sendFCM({transport:'fcm',token:nativeToken},notice),/^Error: FCM_NOT_CONFIGURED$/);
  s.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'another-brand',client_email:'test@example.invalid',private_key:'DO_NOT_ECHO'});
  await assert.rejects(s.api.sendFCM({transport:'fcm',token:nativeToken},notice),/^Error: FCM_PROJECT_MISMATCH$/);
  assert.equal(s.requests.length,0);
});

test('oversized inputs are bounded at code point boundaries and generic notifications do not leak inbox text',async()=>{
  const s=setup();const large=structuredClone(notice);
  for(const field of ['customerName','vehicleName','vehiclePlate','branch','schedule'])large.booking[field]='한😀'.repeat(5000);
  await s.api.sendFCM({transport:'fcm',token:nativeToken},large);
  const data=s.requests.find(row=>row.url.includes('fcm.googleapis.com')).body.message.data;
  assert.ok(new TextEncoder().encode(JSON.stringify(data)).length<=4096);
  assert.equal(data.body.includes('\uFFFD'),false);
  const generic=setup();await generic.api.sendFCM({transport:'fcm',token:nativeToken},{...notice,booking:undefined,category:'repair'});
  assert.equal(JSON.stringify(generic.requests).includes('NEVER_INCLUDE'),false);
});

test('OAuth access token is cached, server scope is FCM-only and platform transport is mandatory',async()=>{
  const s=setup();await s.api.sendFCM({transport:'fcm',token:nativeToken},notice);
  await s.api.sendFCM({transport:'fcm',token:nativeToken},notice);
  assert.equal(s.requests.filter(row=>row.url.includes('oauth2.googleapis.com')).length,1);
  assert.ok(s.signed.some(row=>row.name==='scope'&&row.value==='https://www.googleapis.com/auth/firebase.messaging'));
  await assert.rejects(s.api.sendFCM({transport:'apns',token:nativeToken},notice),/FCM_INVALID_TOKEN/);
});
