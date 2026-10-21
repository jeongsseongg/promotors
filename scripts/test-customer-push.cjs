const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function api(){const context=vm.createContext({});vm.runInContext(stripTypeScriptTypes(fs.readFileSync('notifications/process-push-queue/customer.ts','utf8').replace(/^export /gm,'')),context);return context;}
const snapshot={audience:'customer',phase:'repair',active:true,bookingId:'own-booking',runId:'own-run',branch:'프로모터스 안산점',schedule:'2026.10.22 · 10:00',startsAt:0,stageLabel:'입고 점검 확인',progress:40,pendingCount:0,upcomingCount:0,customerName:'',vehicleName:'BMW 520d',vehiclePlate:'비공개'};
test('고객 상시알림은 승인된 문맥과 해당 정비 ID만 전달한다',()=>{const a=api(),value=a.cleanCustomer({title:'정비가 시작되었어요',body:'정비 내용을 확인해 주세요.',snapshot:{...snapshot,phone:'DO_NOT_SEND',memo:'DO_NOT_SEND',photos:['private-photo']}});assert.equal(value.snapshot.runId,'own-run');assert.equal(value.snapshot.phase,'repair');assert.equal(JSON.stringify(value).includes('DO_NOT_SEND'),false);assert.equal(JSON.stringify(value).includes('private-photo'),false);});
test('유효하지 않은 단계나 ID는 고객 알림으로 전송하지 않는다',()=>{const a=api();for(const change of [{phase:'made-up'},{runId:'https://other.invalid'},{progress:NaN}])assert.throws(()=>a.cleanCustomer({title:'안내',body:'정비',snapshot:{...snapshot,...change}}),/INVALID_CUSTOMER_CONTEXT/);});
test('고객 알림에는 관리자 승인·거절 문구를 만들지 않는다',()=>{const a=api();const value=a.cleanCustomer({title:'예약이 확정되었어요',body:'10시 방문 예약입니다.',snapshot:{...snapshot,phase:'confirmed'}});assert.equal(value.title,'예약이 확정되었어요');assert.equal(value.snapshot.audience,'customer');assert.equal(value.snapshot.pendingCount,0);});
