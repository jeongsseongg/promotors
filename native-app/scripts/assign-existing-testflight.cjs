const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const APP='6810716100',GROUP='Owner Device Testing';
function check(value,code){if(!value)throw Error(code);}
async function assignExistingGroup({request,release,wait}) {
  const app=await request(`/v1/apps/${APP}`);
  check(app.data?.attributes?.bundleId==='kr.promotors.app','APP_IDENTITY_MISMATCH');
  const groups=await request(`/v1/apps/${APP}/betaGroups?limit=200`);
  const matching=groups.data?.filter(g=>g.attributes?.name===GROUP&&g.attributes?.isInternalGroup===true)||[];
  check(matching.length===1,'EXISTING_INTERNAL_GROUP_REQUIRED');
  let build;
  for(let attempt=0;attempt<40;attempt++) {
    const query=new URLSearchParams({'filter[app]':APP,'filter[version]':String(release.iosBuild),limit:'10'});
    const result=await request(`/v1/builds?${query}`);
    const rows=result.data?.filter(b=>b.attributes?.version===String(release.iosBuild))||[];
    check(rows.length<=1,'AMBIGUOUS_BUILD');
    if(rows[0]?.attributes?.processingState==='VALID'){build=rows[0];break;}
    check(!rows[0]||rows[0].attributes.processingState==='PROCESSING','BUILD_PROCESSING_FAILED');
    if(attempt<39)await wait(30000);
  }
  check(build,'BUILD_PROCESSING_TIMEOUT');
  const version=await request(`/v1/builds/${build.id}/preReleaseVersion`);
  check(version.data?.attributes?.version===release.version,'BUILD_VERSION_MISMATCH');
  const relationship=`/v1/betaGroups/${matching[0].id}/relationships/builds`;
  const before=await request(relationship+'?limit=200');
  if(!before.data?.some(b=>b.id===build.id))await request(relationship,'POST',{data:[{type:'builds',id:build.id}]});
  const after=await request(relationship+'?limit=200');
  check(after.data?.some(b=>b.id===build.id),'GROUP_ASSIGNMENT_NOT_VERIFIED');
  return {verified:true,app:APP,version:release.version,build:String(release.iosBuild),group:GROUP,buildId:build.id};
}
function bearer() {
  const keyId=process.env.ASC_KEY_ID,issuer=process.env.ASC_ISSUER_ID;
  check(/^[A-Z0-9]+$/.test(keyId||'')&&issuer,'ASC_CREDENTIALS_REQUIRED');
  const key=fs.readFileSync(path.join(os.homedir(),'.appstoreconnect/private_keys',`AuthKey_${keyId}.p8`));
  const now=Math.floor(Date.now()/1000),part=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const value=part({alg:'ES256',kid:keyId,typ:'JWT'})+'.'+part({iss:issuer,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
  return value+'.'+crypto.sign('sha256',Buffer.from(value),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
async function request(endpoint,method='GET',body) {
  check(endpoint.startsWith('/v1/'),'INVALID_ASC_PATH');
  const response=await fetch('https://api.appstoreconnect.apple.com'+endpoint,{method,headers:{Authorization:'Bearer '+bearer(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    let detail;try{const body=await response.json();detail=body.errors?.map(e=>({code:e.code,detail:String(e.detail||'').slice(0,500)}));}catch{}
    console.error(JSON.stringify({code:`ASC_HTTP_${response.status}`,endpoint,requestId:response.headers.get('x-request-id'),errors:detail}));
    throw Error(`ASC_HTTP_${response.status}`);
  }
  return response.status===204?{}:response.json();
}
module.exports={assignExistingGroup};
if(require.main===module)assignExistingGroup({request,release:require('../release.json'),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))})
  .then(value=>{const output=JSON.stringify(value);console.log(output);if(process.env.RUNNER_TEMP)fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'testflight-assignment.json'),output);})
  .catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'TESTFLIGHT_ASSIGNMENT_FAILED');process.exitCode=1;});
