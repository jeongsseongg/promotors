import { requireValue } from './errors';
import type { AdminAccess } from './admin-access';
import type { JsonRecord, Promotions } from '../domain/types';

export function createAdminPromotionsService(access: AdminAccess, id: () => string) {
  async function load(): Promise<Promotions> {
    await access.load(true); const value = await access.rpc.call<Promotions>('pm_promo_read');
    for (const key of ['coupons', 'assignments', 'couponUsage', 'events', 'entries'] as const) requireValue(Array.isArray(value[key]), 'INVALID_RESPONSE'); return value;
  }
  async function save(value: Promotions) { access.requireMain(); await access.rpc.call('pm_promo_write', { p_payload: value }); return value; }
  async function saveCoupon(coupon: JsonRecord) {
    const state = await load(); requireValue(typeof coupon.name === 'string' && coupon.name.trim() && typeof coupon.code === 'string' && coupon.code.trim());
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(String(coupon.startDate)) && /^\d{4}-\d{2}-\d{2}$/.test(String(coupon.endDate)) && String(coupon.startDate) <= String(coupon.endDate));
    const value = { ...coupon, id: coupon.id || id(), updatedAt: new Date().toISOString() };
    const index = state.coupons.findIndex(item => item.id === value.id); if (index >= 0) state.coupons[index] = value; else state.coupons.push(value);
    return save(state);
  }
  async function issueCoupon(couponId: string, memberId: string) {
    const state = await load(), coupon = state.coupons.find(item => item.id === couponId); requireValue(coupon && memberId, 'COUPON_UNAVAILABLE');
    const members = await access.members(), targets = memberId === 'all' ? members : members.filter(member => member.id === memberId); requireValue(targets.length, 'CUSTOMER_UNAVAILABLE');
    for (const member of targets) state.assignments.push({ id: id(), couponId, memberId: member.id, customerName: member.name || member.id, issuedAt: new Date().toISOString() });
    await save(state); return { issued: targets.length };
  }
  async function saveEvent(event: JsonRecord) {
    const state = await load(); requireValue(typeof event.title === 'string' && event.title.trim() && typeof event.prize === 'string' && event.prize.trim());
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(String(event.startDate)) && /^\d{4}-\d{2}-\d{2}$/.test(String(event.endDate)) && String(event.startDate) <= String(event.endDate));
    const numbers = Array.isArray(event.numbers) ? event.numbers.map(Number).sort((a, b) => a - b) : [];
    requireValue(numbers.length === 0 || numbers.length === 6 && new Set(numbers).size === 6 && numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 45));
    const previous = state.events.find(item => item.id === event.id), value = { ...event, id: event.id || id(), numbers, prize: String(event.prize),
      status: previous?.status === 'published' ? 'published' : 'draft', updatedAt: new Date().toISOString() };
    state.events = [value, ...state.events.filter(item => item.id !== value.id)];
    const winningKey = numbers.length === 6 ? numbers.join(',') : '';
    state.entries = state.entries.map(entry => entry.eventId !== value.id ? entry : { ...entry, winner: !!winningKey && Array.isArray(entry.numbers) && [...entry.numbers].map(Number).sort((a, b) => a - b).join(',') === winningKey,
      prize: value.prize, judgedAt: winningKey ? new Date().toISOString() : '' });
    return save(state);
  }
  async function publishEvent(eventId: string, published: boolean) {
    const state = await load(), event = state.events.find(item => item.id === eventId); requireValue(event, 'EVENT_UNAVAILABLE');
    event.status = published ? 'published' : 'draft'; event.updatedAt = new Date().toISOString(); return save(state);
  }
  return { load, saveCoupon, issueCoupon, saveEvent, publishEvent };
}
