const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8').replace(/\r\n/g,'\n');
function fn(name) {
  const found = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}\\n`));
  assert.ok(found, `Missing source function ${name}`); return found[0];
}
function storage() {
  const map = new Map();
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};
}
function setup() {
  const localStorage=storage(),sessionStorage=storage(),remoteState={},calls=[];
  const state={authToken:'owner-a',isAdmin:true,adminRole:'main',canonicalMembers:[],canonicalMembersRefreshedAt:0,
    canonicalMembersRefresh:null,hydratedAuthScope:'',authScopeCleanup:Promise.resolve(),locallyModifiedKeys:new Set(),assetScopeVersion:0,
    SUPABASE_DATA_KEYS:['pm-bookings','pm-members','pm-customers','pm-notices','pm-service-runs'],
    SUPABASE_PUBLIC_DATA_KEYS:new Set(['pm-notices']),remoteState,localStorage,sessionStorage,objectUrls:new Map(),
    remoteAssets:{},promoState:{},promoLoaded:false,privacyReloading:false,isHydratingSupabase:false,
    adminBranches:[],member:null,REMEMBERED_ADMIN_SESSION_KEY:'remembered',
    console:{warn(){}},URL:{revokeObjectURL(){}},Date,JSON,
    getSupabaseConfig:()=>({url:'fixture'}),getRememberedAdminSession:()=>null,
    isTopAdmin:()=>state.isAdmin&&['main','developer'].includes(state.adminRole),
    privacyClearAssets:async()=>{calls.push('assets-cleared');},
    store:{get:(k,d)=>remoteState[k]??d,setLocal:(k,v)=>{remoteState[k]=v;},del:k=>{delete remoteState[k];}},
    mergeCustomerDirectory:members=>[...(remoteState['pm-bookings']||[]).map(x=>({id:x.memberId})),
      ...(remoteState['pm-members']||[]),...(members||[])],
    supabaseRpc:async(name,args)=>{calls.push(name);return [];},
    window:{PMPrivacyEpoch:{accept:async()=>{},reset(){}},PMPush:{disconnect(){}}},setTimeout(){},
  };
  vm.createContext(state);
  vm.runInContext(['captureAssetScope','assertAssetScope','privacyClearMemory','clearAuthScopeCache','refreshCanonicalMembers','hydrateSupabaseData'].map(fn).join('\n'),state);
  return {state,calls};
}
test('branch directory uses its scoped bookings without the whole-customer RPC',async()=>{
  const {state,calls}=setup();state.adminRole='general';state.remoteState['pm-bookings']=[{memberId:'own-customer'}];
  const result=await state.refreshCanonicalMembers(true);
  assert.equal(JSON.stringify(result),JSON.stringify([{id:'own-customer'}]));
  assert.ok(!calls.includes('pm_customer_accounts'));
});
test('owner and developer directory retain the customer API',async()=>{
  for (const role of ['main','developer']) {
    const {state,calls}=setup();state.adminRole=role;
    state.supabaseRpc=async name=>{calls.push(name);return [{id:'owner-visible'}];};
    const result=await state.refreshCanonicalMembers(true);
    assert.equal(result[0].id,'owner-visible');assert.deepEqual(calls,['pm_customer_accounts']);
  }
});
test('an old owner response cannot repopulate a branch session directory',async()=>{
  const {state}=setup();let complete;
  state.supabaseRpc=()=>new Promise(resolve=>{complete=resolve;});
  const old=state.refreshCanonicalMembers(true);
  state.authToken='branch-b';state.adminRole='general';await state.clearAuthScopeCache();
  state.remoteState['pm-bookings']=[{memberId:'own-customer'}];
  complete([{id:'other-private-customer'}]);await old;
  assert.equal(state.canonicalMembers.length,0);
  const rows=await state.refreshCanonicalMembers(true);
  assert.equal(JSON.stringify(rows),JSON.stringify([{id:'own-customer'}]));
});
test('an older completion cannot clear a newer owner request',async()=>{
  const {state}=setup();const waiting=[];
  state.supabaseRpc=()=>new Promise(resolve=>waiting.push(resolve));
  const old=state.refreshCanonicalMembers(true);state.authToken='owner-b';await state.clearAuthScopeCache();
  const current=state.refreshCanonicalMembers(true);
  waiting[0]([{id:'old'}]);await old;assert.ok(state.canonicalMembersRefresh);
  waiting[1]([{id:'new'}]);await current;assert.equal(state.canonicalMembers[0].id,'new');
});
test('hydrating a branch removes former owner cache before its scoped snapshot',async()=>{
  const {state,calls}=setup();state.authToken='branch-b';
  state.remoteState['pm-members']=[{id:'other-private-customer'}];
  state.localStorage.setItem('pm-customers','old-private-cache');
  state.canonicalMembers=[{id:'old-owner-cache'}];
  const rows=[{data_key:'pm-auth-context',payload:{authenticated:true,role:'general',branches:['안산점'],profile:{id:'branch-b'}}},
    {data_key:'pm-bookings',payload:[{memberId:'own-customer',branch:'안산점'}]}];
  state.supabaseRpc=async(name,args)=>{calls.push(name);return args.p_token?rows:[];};
  const result=await state.hydrateSupabaseData();assert.equal(result.ok,true);
  assert.equal(state.localStorage.getItem('pm-customers'),null);
  assert.equal(state.remoteState['pm-members'],undefined);
  assert.equal(JSON.stringify(state.canonicalMembers),JSON.stringify([{id:'own-customer'}]));
  assert.ok(!calls.includes('pm_customer_accounts'));
});
test('failed cache erasure stops authenticated hydration',async()=>{
  const {state}=setup();state.privacyClearAssets=async()=>{throw new Error('storage failed');};
  state.supabaseRpc=async()=>[{data_key:'pm-auth-context',payload:{authenticated:true,role:'general',branches:['안산점']}}];
  const result=await state.hydrateSupabaseData();assert.equal(result.ok,false);
  assert.equal(state.isHydratingSupabase,false);
});
test('branch sessions never request the global legacy photo directory',async()=>{
  const {state,calls}=setup();state.adminRole='general';
  vm.runInContext(fn('migrateLegacyAssetsToStorage'),state);
  const result=await state.migrateLegacyAssetsToStorage();
  assert.equal(result.total,0);assert.equal(calls.length,0);
});
test('branch local-photo migration only inspects its scoped work photos',async()=>{
  const {state,calls}=setup();state.adminRole='general';
  state.remoteState['pm-notices']=['notice-private-test'];
  state.remoteState['pm-service-runs']=['service-own-test'];
  state.collectAssetKeys=(value,set)=>{for (const key of value||[]) set.add(key);return set;};
  state.assetDb={get:async key=>{calls.push(key);return null;}};
  vm.runInContext(fn('migrateLegacyAssetsToStorage')+fn('migrateLocalAssetsToSupabase'),state);
  await state.migrateLocalAssetsToSupabase();
  assert.deepEqual(calls,['service-own-test']);
});
