import {createNotificationsService} from '../notifications';
import type {RpcClient} from '../client';
import type {SessionService} from '../../auth/session';
import type {NativePushPlatform} from '../../domain/types';
const binding='00000000-0000-4000-8000-000000000015', device='00000000-0000-4000-8000-000000000016';
function fixture() {
 const state={authenticated:true,role:'customer',revision:1,profile:{id:'own-account'},branches:[],privacyEpoch:1};
 const session={snapshot:()=>state,credentials:()=>({token:'synthetic-session',state}),ensureReady:async()=>{},subscribe:()=>()=>{},beforeClear:()=>()=>{}};
 const value={audience:'customer',active:true,phase:'repair',bookingId:'own-booking',runId:'own-run'};
 const rpc={call:jest.fn(async(name:string)=>name==='pm_native_push_subscribe'?{binding}:name==='pm_customer_activity'?value:{items:[],preferences:{enabled:true}})};
 const push={platform:'ios',permission:async()=> 'granted',requestPermission:async()=> 'granted',getToken:async()=> 'a'.repeat(64),bind:async()=>{},clear:async()=>{},onOpen:()=>()=>{},getInitialTarget:async()=>null};
 const service=createNotificationsService(rpc as unknown as RpcClient,session as unknown as SessionService,push as NativePushPlatform,async()=>device);
 return {service,rpc,value};
}
test('고객 상태는 관리자 목록 없이 본인 전용 RPC와 현재 기기 연결만 쓴다',async()=>{
 const f=fixture();await f.service.enable();expect(await f.service.bookingSnapshot()).toMatchObject({audience:'customer',runId:'own-run',binding});
 expect(f.rpc.call.mock.calls.some(([name])=>name==='pm_admin_booking_actions')).toBe(false);
 await f.service.registerActivityToken({binding,kind:'start',token:'b'.repeat(64)});
 expect(f.rpc.call).toHaveBeenLastCalledWith('pm_native_push_subscribe',expect.objectContaining({p_action:'native_activity'}));
 await f.service.dispose();
});
test('고객 기기 연결이 바뀐 Activity 토큰을 서버에 등록하지 않는다',async()=>{
 const f=fixture();await f.service.enable();f.rpc.call.mockClear();
 await expect(f.service.registerActivityToken({binding:device,kind:'start',token:'b'.repeat(64)})).rejects.toBeDefined();
 expect(f.rpc.call).not.toHaveBeenCalled();await f.service.dispose();
});
