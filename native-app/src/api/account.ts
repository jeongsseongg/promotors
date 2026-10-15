import { NATIVE_SOURCE, type RpcClient } from './client';
import { requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { AccountContent, Booking, Inquiry, JsonRecord, MemberProfile, Promotions, ServiceRun } from '../domain/types';

export function createAccountService(rpc: RpcClient, session: SessionService, id: () => string) {
  async function load(): Promise<AccountContent> {
    await session.refresh(); session.requireRole('customer');
    const rows = session.data()?.rows || [];
    const read = <T>(key: string): T[] => { const value = rows.find(row => row.data_key === key)?.payload; return Array.isArray(value) ? value as T[] : []; };
    return { profile: session.snapshot().profile, bookings: read<Booking>('pm-bookings'),
      runs: read<ServiceRun>('pm-service-runs'), messages: read<Inquiry>('pm-messages') };
  }
  async function updateProfile(patch: Partial<Pick<MemberProfile, 'name' | 'model' | 'phone' | 'email' | 'address'>>) {
    await load(); const profile = session.snapshot().profile;
    requireValue(profile?.id, 'AUTH_REQUIRED');
    const allowed = ['name', 'model', 'phone', 'email', 'address'];
    requireValue(Object.entries(patch).every(([key, value]) => allowed.includes(key) && typeof value === 'string' && value.length <= 500));
    await rpc.call('pm_sync_write', { p_key: 'pm-members', p_payload: [{ ...profile, ...patch }], p_page_url: NATIVE_SOURCE });
    await session.refresh(); return session.snapshot().profile;
  }
  async function sendInquiry(message: string) {
    await load(); const profile = session.snapshot().profile;
    requireValue(profile?.id && message.trim() && message.length <= 4000);
    const entry: Inquiry = { id: id(), memberId: profile.id, car: profile.car || '', from: 'customer',
      message: message.trim(), customer: profile, serviceContext: null, createdAt: new Date().toISOString() };
    await rpc.call('pm_sync_merge_by_id', { p_key: 'pm-messages', p_payload: [entry], p_page_url: NATIVE_SOURCE });
    return entry;
  }
  async function promotions(): Promise<Promotions> {
    session.requireRole('customer');
    const value = await rpc.call<Partial<Promotions>>('pm_promo_read');
    const read = (key: keyof Promotions): JsonRecord[] => Array.isArray(value[key]) ? value[key] as JsonRecord[] : [];
    return { coupons: read('coupons'), assignments: read('assignments'), couponUsage: read('couponUsage'), events: read('events'), entries: read('entries') };
  }
  return { load, updateProfile, sendInquiry, promotions,
    assetUrl: (key: string) => rpc.privateAssetUrl(key),
    changePassword: async (current: string, next: string) => {
      session.requireRole('customer'); requireValue(current && next.length >= 10 && /[A-Za-z]/.test(next) && /\d/.test(next), 'WEAK_PASSWORD');
      await rpc.call('pm_change_password', { p_current: current, p_next: next });
    },
    useCoupon: (assignmentId: string, branch = '매장 방문') => rpc.call('pm_coupon_use', { p_assignment_id: assignmentId, p_branch: branch }),
    enterEvent: (eventId: string, numbers: number[]) => rpc.call<{ winner?: boolean; prize?: string }>('pm_event_enter', { p_event_id: eventId, p_numbers: numbers }),
  };
}
