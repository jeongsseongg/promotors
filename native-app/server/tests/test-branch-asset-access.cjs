const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const routines = name => JSON.parse(read(name)).map(x=>x.source+';').join('\n');
const branches = ['프로모터스 안산점','프로모터스 부천점','프로모터스 새솔점'];
const patchFiles = ['branch-read-access.sql','branch-write-access.sql','branch-delete-access.sql','branch-asset-access.sql','branch-asset-storage.sql'];
const patches = () => patchFiles.map(name=>read('../'+name));
const clone = x => JSON.parse(JSON.stringify(x));
const schema = `
create role anon; create role authenticated; create schema extensions; create schema pm_privacy; create schema storage;
create table pm_accounts(login_id text primary key,password_hash text not null default 'synthetic',role text not null,
 branches jsonb not null default '[]',profile jsonb not null default '{}',active boolean not null default true,
 created_at timestamptz default now(),updated_at timestamptz default now());
create table pm_sessions(token_hash text primary key,login_id text references pm_accounts(login_id),expires_at timestamptz not null,
 created_at timestamptz default now(),last_seen_at timestamptz default now());
create table site_data(data_key text primary key,payload jsonb,page_url text,updated_at timestamptz default now());
create table pm_assets(asset_key text primary key,payload jsonb,updated_at timestamptz default now());
create table pm_privacy.config(singleton boolean primary key default true,epoch integer default 1);
insert into pm_privacy.config values(true,1);
create function pm_token_hash(token text) returns text language sql immutable as $$select md5(token)$$;
create function pm_privacy.before_write(token text) returns void language plpgsql as $$begin return;end$$;
create function pm_privacy.customer_write(token text,k text,p jsonb) returns void language plpgsql as $$begin return;end$$;
create function pm_privacy.exact_owner(item jsonb,owner_id text) returns boolean language sql immutable as $$select
 (item->>'memberId'=owner_id or item#>>'{customer,id}'=owner_id)
 and coalesce(nullif(item->>'memberId',''),owner_id)=owner_id and coalesce(nullif(item#>>'{customer,id}',''),owner_id)=owner_id$$;
create function pm_push_inquiry_branch(item jsonb) returns text language sql stable as $$select null::text$$;
create function pm_storage_is_admin(token text) returns boolean language sql stable security definer as $$
 select exists(select 1 from pm_sessions s join pm_accounts a using(login_id)
 where s.token_hash=md5(token) and s.expires_at>now() and a.active and a.role in ('main','general'))$$;
create function pm_storage_erasure_safe(bucket text,key text) returns boolean language sql stable as $$select true$$;
create table storage.buckets(id text primary key,public boolean not null default false);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),
 name text not null,owner uuid,owner_id text,metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),
 unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant select on storage.buckets to anon,authenticated;
create policy "promotors public asset upload" on storage.objects for insert to anon,authenticated with check
 (bucket_id='promotors-public' and pm_storage_is_admin(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-promotors-token','')));
create policy "promotors private asset upload" on storage.objects for insert to anon,authenticated with check
 (bucket_id='promotors-private' and pm_storage_is_admin(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-promotors-token','')));
create policy "promotors private asset read" on storage.objects for select to anon,authenticated using
 (bucket_id='promotors-private' and pm_storage_can_read_private(name,coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-promotors-token','')));
create policy "promotors_erasure_insert" on storage.objects as restrictive for insert to anon,authenticated with check (pm_storage_erasure_safe(bucket_id,name));
create policy "promotors_erasure_update" on storage.objects as restrictive for update to anon,authenticated using (pm_storage_erasure_safe(bucket_id,name)) with check (pm_storage_erasure_safe(bucket_id,name));
-- A broad pre-existing shared-bucket policy is deliberate: new restrictive gates must still win.
create policy "autofix_listing_photos_server_only" on storage.objects for all to anon,authenticated
 using(bucket_id<>'autofix-listing-photos') with check(bucket_id<>'autofix-listing-photos');
`;
const runA={id:'r0',branch:branches[0],memberId:'c0',bookingKey:'b0',memo:'service-memo-only',currentStep:0,
 steps:[{name:'Approved',approved:true,photoKeys:['service-a-photo','service-a-legacy','service-shared-legacy','service-a-fallback','service-shared-fallback']},
  {name:'Draft',approved:false,photoKeys:['service-a-draft']}]};
const runB={id:'r1',branch:branches[1],memberId:'c1',bookingKey:'b1',currentStep:0,
 steps:[{name:'Approved',approved:true,photoKeys:['service-b-photo','service-b-legacy','service-shared-legacy','service-b-fallback','service-shared-fallback']}]};
const runC={id:'r2',branch:branches[2],memberId:'c2',bookingKey:'b2',currentStep:0,
 steps:[{name:'Approved',approved:true,photoKeys:['service-c-photo']}]};
async function seeded() {
 const db=new PGlite();
 const policyStart=schema.indexOf('create policy "promotors public asset upload"');
 await db.exec(schema.slice(0,policyStart));
 await db.exec(routines('fixtures/branch-access-legacy.json'));
 await db.exec(routines('fixtures/branch-asset-legacy.json'));
 await db.exec(schema.slice(policyStart));
 for(const [id,role,scope,active,profile] of [
  ...branches.map((b,i)=>[`g${i}`,'general',[b],true,{}]),['peer','general',[branches[0]],true,{}],
  ['empty','general',[],true,{}],['malformed','general',branches[0],true,{}],['main','main',[],true,{}],['developer','main',[],true,{developer:true}],
  ['c0','customer',[],true,{}],['c1','customer',[],true,{}],['inactive','general',[branches[0]],false,{}]]){
  await db.query('insert into pm_accounts(login_id,role,branches,active,profile) values($1,$2,$3::jsonb,$4,$5::jsonb)',[id,role,JSON.stringify(scope),active,JSON.stringify(profile)]);
  await db.query("insert into pm_sessions(token_hash,login_id,expires_at) values(md5($1),$1,now()+interval '1 day')",[id]);
 }
 await db.query("insert into pm_sessions(token_hash,login_id,expires_at) values(md5('expired'),'g0',now()-interval '1 day')");
 const work=[clone(runA),clone(runB),clone(runC),{id:'unassigned',steps:[{approved:true,photoKeys:['service-unassigned']}]},
  {id:'contradictory',branch:branches[0],memberId:'c0',customer:{id:'c1'},steps:[{approved:true,photoKeys:['service-conflicted']}]}];
 const data={'pm-branches':branches.map(name=>({name})),'pm-bookings':branches.map((branch,i)=>({id:`b${i}`,branch,memberId:`c${i}`})),
  'pm-service-runs':work,'pm-work-audit':[],'pm-messages':[],'pm-assets':{'service-a-fallback':{marker:'fallback'},
   'service-b-fallback':{marker:'foreign-fallback'},'service-orphan-fallback':{marker:'orphan-fallback'},'service-shared-fallback':{marker:'shared-fallback'}}};
 for(const [key,value]of Object.entries(data)) await db.query('insert into site_data(data_key,payload) values($1,$2::jsonb)',[key,JSON.stringify(value)]);
 await db.exec("insert into storage.buckets values('promotors-public',true),('promotors-private',false),('other-app',false),('autofix-listing-photos',false)");
 const keys=['service-a-photo','service-a-draft','service-a-legacy','service-b-photo','service-b-legacy','service-c-photo',
  'service-shared-legacy','service-legacy-orphan','service-unassigned','service-conflicted','service-memo-only','notice-public','branch-public-legacy'];
 for(const key of keys) await db.query('insert into pm_assets values($1,$2::jsonb,now())',[key,JSON.stringify({marker:key})]);
 for(const key of ['service-a-photo','service-a-draft','service-b-photo','service-c-photo','service-unassigned','service-conflicted','service-memo-only'])
  await insert(db,'promotors-private',key);
 await insert(db,'promotors-public','notice-public');await insert(db,'other-app','other-existing');
 return db;
}
async function apply(db){for(const patch of patches())await db.exec(patch);}
async function database(run,patch=true){const db=await seeded();try{if(patch)await apply(db);await run(db);}finally{await db.close();}}
async function actor(db,token,run,role='anon'){
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify(token?{'x-promotors-token':token}:{})]);
 await db.exec(`set role ${role}`);
 try{return await run();}finally{await db.exec('reset role');await db.query("select set_config('request.headers','{}',false)");}
}
async function insert(db,bucket,key,returning=true){return db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,\'{"version":1}\')'+(returning?' returning id':''),[bucket,key]);}
async function visible(db,token,bucket='promotors-private',role='anon'){
 return actor(db,token,async()=> (await db.query('select name from storage.objects where bucket_id=$1 order by name',[bucket])).rows.map(x=>x.name),role);
}
async function allowed(db,key,token){return (await db.query('select pm_storage_can_read_private($1,$2) as allowed',[key,token])).rows[0].allowed;}
async function get(db,key,token){return (await db.query('select pm_asset_get($1,$2) as asset',[key,token])).rows[0].asset;}
async function payload(db){return (await db.query("select payload from site_data where data_key='pm-service-runs'")).rows[0].payload;}
async function merge(db,row,token='g0'){
 return db.query("select pm_sync_merge_by_id($1,'pm-service-runs',$2::jsonb,'synthetic://asset')",[token,JSON.stringify([row])]);
}
async function binding(db,key){return (await db.query('select * from pm_branch_access_private.upload_bindings where asset_key=$1',[key])).rows[0];}
async function blockedUpload(db,token,key,bucket='promotors-private',returning=true){
 await assert.rejects(actor(db,token,()=>insert(db,bucket,key,returning)),/row-level security|permission denied|ASSET|FORBIDDEN/);
 assert.equal((await db.query('select count(*)::int as n from storage.objects where bucket_id=$1 and name=$2',[bucket,key])).rows[0].n,0);
 assert.equal(await binding(db,key),undefined);
}
async function deniedMutation(db,token,operation){
 try{await actor(db,token,operation);}catch(error){assert.match(error.message,/row-level security|permission denied|ASSET|FORBIDDEN/);}
}

test('the legacy fixture reproduces cross-branch photo access before hardening',async()=>database(async db=>{
 assert.deepEqual(await get(db,'service-b-photo','g0'),{marker:'service-b-photo'});
 assert.equal(await allowed(db,'service-b-photo','g0'),true);
 assert.ok((await visible(db,'g0')).includes('service-b-photo'));
},false));
test('legacy and Storage reads allow own work photos and reject foreign, orphan and memo-only keys',async()=>database(async db=>{
 for(const key of ['service-a-photo','service-a-draft','service-a-legacy','service-shared-legacy']) assert.deepEqual(await get(db,key,'g0'),{marker:key});
 assert.deepEqual(await get(db,'service-a-fallback','g0'),{marker:'fallback'});
 for(const key of ['service-b-photo','service-b-legacy','service-legacy-orphan','service-unassigned','service-conflicted','service-memo-only']){
  assert.equal(await allowed(db,key,'g0'),false);await assert.rejects(get(db,key,'g0'),/ASSET_FORBIDDEN/);
 }
 const names=await visible(db,'g0');assert.deepEqual(names,['service-a-draft','service-a-photo']);
}));
test('main and developer keep private access; customers still need ownership and approved photos',async()=>database(async db=>{
 for(const token of ['main','developer']) for(const key of ['service-b-photo','service-legacy-orphan']) assert.deepEqual(await get(db,key,token),{marker:key});
 assert.deepEqual(await get(db,'service-a-photo','c0'),{marker:'service-a-photo'});
 for(const key of ['service-a-draft','service-b-photo','service-conflicted']) await assert.rejects(get(db,key,'c0'),/ASSET_FORBIDDEN/);
 assert.deepEqual(await visible(db,'c0'),['service-a-photo']);
 for(const token of [null,'inactive','expired','empty','malformed']) assert.deepEqual(await visible(db,token),[]);
}));
test('public photos remain public and legacy key enumeration is main-only',async()=>database(async db=>{
 for(const token of [null,'g0','c0']) assert.deepEqual(await get(db,'notice-public',token),{marker:'notice-public'});
 assert.deepEqual(await visible(db,null,'promotors-public'),['notice-public']);
 for(const token of ['g0','empty','c0',null]) await assert.rejects(db.query('select pm_legacy_asset_keys($1)',[token]),/ADMIN_REQUIRED|MAIN_ADMIN_REQUIRED|FORBIDDEN/);
 const before=(await db.query("select pm_legacy_asset_keys('main') as keys")).rows[0].keys;assert.ok(before.includes('service-b-legacy'));
}));
test('a fresh private upload binds the real uploader and branch snapshot, with owner-only pending preview',async()=>database(async db=>{
 await actor(db,'g0',()=>db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('promotors-private','service-new-own','g1',$1::jsonb) returning id",[JSON.stringify({branch:branches[1],uploader_login_id:'g1'})]));
 const value=await binding(db,'service-new-own');assert.equal(value.uploader_login_id,'g0');assert.deepEqual(value.branches,[branches[0]]);
 assert.equal(await allowed(db,'service-new-own','g0'),true);assert.equal(await allowed(db,'service-new-own','peer'),false);
 assert.equal(await allowed(db,'service-new-own','g1'),false);assert.ok((await visible(db,'g0')).includes('service-new-own'));
}));
test('pending preview expires after one hour and cannot authorize legacy database image retrieval',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-pending'));
 await db.query("insert into pm_assets values('service-pending','{\"marker\":\"new-legacy-row\"}',now())");
 await assert.rejects(get(db,'service-pending','g0'),/ASSET_FORBIDDEN/);
 await db.query("update pm_branch_access_private.upload_bindings set created_at=now()-interval '2 hours' where asset_key='service-pending'");
 assert.equal(await allowed(db,'service-pending','g0'),false);assert.ok(!(await visible(db,'g0')).includes('service-pending'));
}));
test('once attached, the same-branch team can read an upload while another branch cannot',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-team'));
 const run=clone(runA);run.steps[0].photoKeys.push('service-team');await merge(db,run);
 assert.equal(await allowed(db,'service-team','peer'),true);assert.equal(await allowed(db,'service-team','g1'),false);
}));
test('memo text does not grant photo access and a foreign or unowned new photo key cannot be injected',async()=>database(async db=>{
 const run=clone(runA);run.memo='service-b-photo';await merge(db,run);
 assert.equal(await allowed(db,'service-b-photo','g0'),false);
 for(const key of ['service-b-photo','service-legacy-orphan']){
  const before=await payload(db), altered=clone(run);altered.steps[0].photoKeys.push(key);
  await assert.rejects(merge(db,altered),/ASSET|FORBIDDEN/);assert.deepEqual(await payload(db),before);
 }
}));
test('an uploader cannot move a pending key to a newly assigned different branch',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-original-branch'));
 await db.query('update pm_accounts set branches=$1::jsonb where login_id=\'g0\'',[JSON.stringify([branches[1]])]);
 const run=clone(runB);run.steps[0].photoKeys.push('service-original-branch');
 const before=await payload(db);await assert.rejects(merge(db,run),/ASSET|FORBIDDEN/);assert.deepEqual(await payload(db),before);
}));
test('foreign, orphan and shared legacy key collisions cannot mint pending upload bindings',async()=>database(async db=>{
 for(const key of ['service-b-legacy','service-legacy-orphan','service-shared-legacy']) await blockedUpload(db,'g0',key);
 assert.equal(await allowed(db,'service-shared-legacy','g0'),true);
}));
test('plain INSERT cannot shadow foreign, orphan or shared legacy and fallback-only keys',async()=>database(async db=>{
 for(const key of ['service-b-legacy','service-shared-legacy','service-b-fallback','service-orphan-fallback','service-shared-fallback'])
  await blockedUpload(db,'g0',key,'promotors-private',false);
 await blockedUpload(db,'g1','service-a-fallback','promotors-private',false);
 await actor(db,'g0',()=>insert(db,'promotors-private','service-a-fallback',false));
 assert.deepEqual(await get(db,'service-a-fallback','g0'),{marker:'fallback'});
 assert.equal(await allowed(db,'service-a-fallback','g0'),true);assert.equal(await allowed(db,'service-a-fallback','g1'),false);
}));
test('own unshared legacy migration and main legacy migration remain possible',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-a-legacy'));
 await actor(db,'main',()=>insert(db,'promotors-private','service-b-legacy'));
 await actor(db,'main',()=>insert(db,'promotors-private','service-shared-legacy'));
 assert.equal(await allowed(db,'service-a-legacy','g0'),true);assert.equal(await allowed(db,'service-b-legacy','g0'),false);
}));
test('branch accounts cannot upload public images or unsupported private names',async()=>database(async db=>{
 await blockedUpload(db,'g0','notice-staff-upload','promotors-public');await blockedUpload(db,'g0','arbitrary-private-key');
 await actor(db,'main',()=>insert(db,'promotors-public','notice-main-upload'));
}));
test('inactive, expired and unassigned accounts cannot create private uploads',async()=>database(async db=>{
 for(const token of ['inactive','expired','empty','malformed',null,'c0']) await blockedUpload(db,token,`service-denied-${token||'anonymous'}`);
}));
test('general direct Storage update and delete leave the existing object unchanged',async()=>database(async db=>{
 const before=(await db.query("select metadata from storage.objects where name='service-a-photo'")).rows[0].metadata;
 await deniedMutation(db,'g0',()=>db.query("update storage.objects set metadata='{\"changed\":true}' where name='service-a-photo'"));
 await deniedMutation(db,'g0',()=>db.query("delete from storage.objects where name='service-a-photo'"));
 assert.deepEqual((await db.query("select metadata from storage.objects where name='service-a-photo'")).rows[0].metadata,before);
}));
test('main Storage mutations remain available and another bucket row cannot bypass the private boundary',async()=>database(async db=>{
 await actor(db,'main',()=>db.query("update storage.objects set metadata='{\"changed\":true}' where name='service-a-photo'"));
 assert.deepEqual((await db.query("select metadata from storage.objects where name='service-a-photo'")).rows[0].metadata,{changed:true});
 await actor(db,'main',()=>db.query("delete from storage.objects where name='service-a-photo'"));
 assert.equal((await db.query("select count(*)::int as n from storage.objects where name='service-a-photo'")).rows[0].n,0);
 await assert.rejects(actor(db,'g0',()=>db.query("update storage.objects set bucket_id='promotors-private',name='service-bucket-swap' where bucket_id='other-app' and name='other-existing'")),/row-level security|permission denied/);
 assert.deepEqual(await visible(db,null,'other-app'),['other-existing']);assert.equal(await binding(db,'service-bucket-swap'),undefined);
}));
test('other app buckets retain their existing access rules',async()=>database(async db=>{
 assert.deepEqual(await visible(db,null,'other-app'),['other-existing']);
 await actor(db,null,()=>insert(db,'other-app','other-new'));
 await actor(db,null,()=>db.query("update storage.objects set metadata='{\"changed\":true}' where bucket_id='other-app' and name='other-new'"));
 await actor(db,null,()=>db.query("delete from storage.objects where bucket_id='other-app' and name='other-new'"));
 assert.deepEqual(await visible(db,null,'other-app'),['other-existing']);
 await assert.rejects(actor(db,null,()=>insert(db,'autofix-listing-photos','still-server-only')),/row-level security|permission denied/);
}));
test('a privileged key reuse without an actor clears a previous pending binding',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-reused'));
 await db.query("delete from storage.objects where bucket_id='promotors-private' and name='service-reused'");
 await insert(db,'promotors-private','service-reused');
 const value=await binding(db,'service-reused');assert.equal(value.uploader_login_id,null);assert.deepEqual(value.branches,[]);
 assert.equal(await allowed(db,'service-reused','g0'),false);
}));
test('a rejected duplicate upload cannot replace the existing uploader binding',async()=>database(async db=>{
 await actor(db,'g0',()=>insert(db,'promotors-private','service-retry'));
 const before=await binding(db,'service-retry');
 await assert.rejects(actor(db,'g1',()=>insert(db,'promotors-private','service-retry')),/duplicate key|unique constraint/);
 assert.deepEqual(await binding(db,'service-retry'),before);
 assert.equal(await allowed(db,'service-retry','g0'),true);assert.equal(await allowed(db,'service-retry','g1'),false);
}));
test('RLS can execute its prebound private predicate while direct private access stays denied',async()=>database(async db=>{
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query("select has_schema_privilege($1,'pm_branch_access_private','USAGE') as p",[role])).rows[0].p,false);
  assert.equal((await db.query("select has_function_privilege($1,'pm_branch_access_private.storage_allowed(text,text,text,text)','EXECUTE') as p",[role])).rows[0].p,true);
  assert.ok((await visible(db,'g0','promotors-private',role)).includes('service-a-photo'));
  await assert.rejects(actor(db,'g0',()=>db.query("select pm_branch_access_private.storage_allowed('read','promotors-private','service-a-photo','g0')"),role),/permission denied/);
  await assert.rejects(actor(db,'g0',()=>db.query('select * from pm_branch_access_private.upload_bindings'),role),/permission denied/);
 }
}));
test('asset patches preserve public ownership and ACLs and are safe to apply twice',async()=>database(async db=>{
 const targets=['pm_asset_get','pm_storage_can_read_private','pm_legacy_asset_keys'];
 const meta=async()=> (await db.query('select oid::regprocedure::text as s,proowner,proacl from pg_proc where proname=any($1::text[]) order by 1',[targets])).rows;
 const baseline=await meta();await apply(db);assert.deepEqual(await meta(),baseline);
 const defs=async()=> (await db.query("select oid::regprocedure::text as s,pg_get_functiondef(oid) as d from pg_proc where pronamespace in ('public'::regnamespace,'pm_branch_access_private'::regnamespace) order by 1")).rows;
 const first=await defs();await apply(db);assert.deepEqual(await defs(),first);
},false));
test('all five modules work with CRLF checkout text and stay idempotent',async()=>database(async db=>{
 const crlf=patches().map(sql=>sql.replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n'));
 const applyCrlf=async()=>{for(const sql of crlf)await db.exec(sql);};
 const defs=async()=> (await db.query("select oid::regprocedure::text as s,pg_get_functiondef(oid) as d from pg_proc where pronamespace in ('public'::regnamespace,'pm_branch_access_private'::regnamespace) order by 1")).rows;
 await applyCrlf();
 assert.deepEqual(await get(db,'service-a-photo','g0'),{marker:'service-a-photo'});
 await assert.rejects(get(db,'service-b-photo','g0'),/ASSET_FORBIDDEN/);
 await actor(db,'g0',()=>insert(db,'promotors-private','service-crlf-upload'));
 const run=clone(runA);run.steps[0].photoKeys.push('service-crlf-upload');await merge(db,run);
 assert.equal(await allowed(db,'service-crlf-upload','peer'),true);assert.equal(await allowed(db,'service-crlf-upload','g1'),false);
 const first=await defs();await applyCrlf();assert.deepEqual(await defs(),first);
 assert.ok((await visible(db,'peer')).includes('service-crlf-upload'));
 await assert.rejects(get(db,'service-b-photo','g0'),/ASSET_FORBIDDEN/);
},false));
test('unknown asset source rolls back all preceding branch patches and Storage state',async()=>database(async db=>{
 await db.exec("create or replace function public.pm_asset_get(p_key text,p_token text default null) returns jsonb language sql as $$select null::jsonb$$");
 const before=(await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d;
 const policies=async()=> (await db.query("select polname,pg_get_expr(polqual,polrelid) as q,pg_get_expr(polwithcheck,polrelid) as c from pg_policy where polrelid='storage.objects'::regclass order by polname")).rows;
 const oldPolicies=await policies();await assert.rejects(db.exec('begin;'+patches().join('\n')+'commit;'),/BRANCH_ASSET_SOURCE_MISMATCH/);await db.exec('rollback');
 assert.equal((await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d,before);
 assert.equal((await db.query("select to_regnamespace('pm_branch_access_private') as n")).rows[0].n,null);
 assert.deepEqual(await policies(),oldPolicies);
},false));
