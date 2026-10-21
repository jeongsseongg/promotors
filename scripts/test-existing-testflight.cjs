const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assignExistingGroup}=require('../native-app/scripts/assign-existing-testflight.cjs');
function fixture(change={}) {
  const calls=[];let assigned=false,attempts=0;
  const request=async(path,method='GET',body)=>{
    calls.push({path,method,body});
    if(path==='/v1/apps/6810716100') return {data:{attributes:{bundleId:change.bundle||'kr.promotors.app'}}};
    if(path.includes('/betaGroups?')) return {data:change.groups||[{id:'group',attributes:{name:'Owner Device Testing',isInternalGroup:true}}]};
    if(path.startsWith('/v1/builds?')) {attempts++;return {data:change.processing&&attempts===1?[]:[{id:'build',attributes:{version:'38',processingState:change.invalid?'INVALID':'VALID'}}]};}
    if(path==='/v1/builds/build/preReleaseVersion')return {data:{attributes:{version:change.version||'1.1.2'}}};
    if(method==='POST') {assigned=true;return {};}
    if(path==='/v1/betaGroups/group/relationships/builds?limit=200')return {data:assigned?[{id:'build',type:'builds'}]:[]};
    throw Error('UNEXPECTED_REQUEST');
  };
  return {calls,request,release:{version:'1.1.2',iosBuild:38},wait:async()=>{}};
}
test('기존 프로모터스 내부 그룹에 정확한 버전만 배정하고 다시 조회한다',async()=>{
  const f=fixture(),r=await assignExistingGroup(f);assert.equal(r.verified,true);
  const writes=f.calls.filter(c=>c.method!=='GET');assert.equal(writes.length,1);
  assert.equal(writes[0].path,'/v1/betaGroups/group/relationships/builds');
  assert.deepEqual(writes[0].body,{data:[{type:'builds',id:'build'}]});
});
test('다른 앱·다른 버전·외부 그룹에는 쓰지 않는다',async()=>{
  for(const change of [{bundle:'other.app'},{version:'1.1.1'},{groups:[{id:'group',attributes:{name:'Owner Device Testing',isInternalGroup:false}}]},{invalid:true}]) {
    const f=fixture(change);await assert.rejects(assignExistingGroup(f));assert.equal(f.calls.some(c=>c.method!=='GET'),false);
  }
});
test('그룹을 새로 만들지 않으며 처리 중인 빌드는 기다린다',async()=>{
  const none=fixture({groups:[]});await assert.rejects(assignExistingGroup(none),/EXISTING_INTERNAL_GROUP_REQUIRED/);
  assert.equal(none.calls.some(c=>c.method!=='GET'),false);
  const f=fixture({processing:true});assert.equal((await assignExistingGroup(f)).verified,true);
  assert.equal(f.calls.filter(c=>c.path.startsWith('/v1/builds?')).length,2);
});
