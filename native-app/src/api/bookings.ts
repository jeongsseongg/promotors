import { NATIVE_SOURCE, type RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { AdminBookingDetail, AdminBookingQueue, Booking, BookingActionResult, BookingInput, BranchHours, OccupiedSlot } from '../domain/types';

function bookingsFrom(session: SessionService): Booking[] {
  const value = session.data()?.rows.find(row => row.data_key === 'pm-bookings')?.payload;
  return Array.isArray(value) ? value as Booking[] : [];
}
export function createBookingService(rpc: RpcClient, session: SessionService, id: () => string) {
  async function list() { await session.refresh(); session.requireRole('customer'); return bookingsFrom(session); }
  async function create(input: BookingInput) {
    await session.ensureReady(); session.requireRole('customer');
    requireValue(input.branch && /^\d{4}\.\d{2}\.\d{2}$/.test(input.date) && /^\d{2}:\d{2}$/.test(input.time));
    const booking = await rpc.call<Booking>('pm_member_booking_create', {
      p_booking: { id: input.id || id(), branch: input.branch, date: input.date, time: input.time,
        services: input.services, memo: input.memo, couponAssignmentId: input.couponAssignmentId,
        couponName: input.couponName, status: '신규' }, p_page_url: NATIVE_SOURCE,
    });
    requireValue(booking && typeof booking.id === 'string', 'INVALID_RESPONSE');
    return booking;
  }
  async function cancel(bookingId: string) {
    const current = (await list()).find(row => row.id === bookingId);
    requireValue(current, 'BOOKING_UNAVAILABLE');
    const profile = session.snapshot().profile;
    const member = String(current.memberId || ''), embedded = (current.customer as { id?: string } | undefined)?.id;
    requireValue(profile?.id && (!member || !embedded || member === embedded) && (member || embedded) === profile.id, 'FORBIDDEN');
    const cancelled = { ...current, status: '취소', cancelledAt: new Date().toISOString(), cancelledBy: '고객' };
    await rpc.call('pm_sync_merge_by_id', { p_key: 'pm-bookings', p_payload: [cancelled], p_page_url: NATIVE_SOURCE });
    return cancelled;
  }
  return { list, create, cancel, update: async (_bookingId: string, _patch: Partial<BookingInput>) => { throw new ApiError('BOOKING_CHANGE_NOT_ALLOWED'); },
    hours: () => rpc.call<BranchHours>('pm_branch_hours_read'),
    availability: (branch: string, from: string, to: string) => rpc.call<OccupiedSlot[]>('pm_booking_availability', {
      p_branch: branch, p_from_date: from, p_to_date: to,
    }) };
}
export function createAdminBookingService(rpc: RpcClient, session: SessionService) {
  let busy = false;
  function canView(branch: string) { const state = session.snapshot(); return state.role !== 'general' || state.branches.includes(branch); }
  async function request<T>(action: string, data: Record<string, unknown> = {}) {
    await session.ensureReady(); session.requireRole('admin');
    return rpc.call<T>('pm_admin_booking_actions', { p_action: action, p_data: data });
  }
  async function get(id: string) {
    const result = await request<AdminBookingDetail>('get', { id });
    requireValue(result?.booking?.id === id && canView(result.booking.branch), 'FORBIDDEN');
    return result;
  }
  async function perform(id: string, action: 'accept' | 'reject', reason?: string) {
    if (busy) throw new ApiError('REQUEST_IN_PROGRESS');
    busy = true;
    try {
      const current = await get(id);
      requireValue(['신규', '승인대기'].includes(current.booking.status), 'BOOKING_UNAVAILABLE');
      if (action === 'reject') requireValue(reason?.trim(), 'REJECTION_REASON_REQUIRED');
      const result = await request<BookingActionResult>(action, { id, ...(reason ? { reason: reason.trim() } : {}) });
      requireValue(result?.booking?.id === id && canView(result.booking.branch), 'FORBIDDEN');
      return result;
    } finally { busy = false; }
  }
  return { get, accept: (id: string) => perform(id, 'accept'), reject: (id: string, reason: string) => perform(id, 'reject', reason),
    list: async (): Promise<AdminBookingQueue> => {
      const value = await request<AdminBookingQueue>('pending');
      return { items: (value.items || []).filter(row => canView(row.branch)), upcoming: (value.upcoming || []).filter(row => canView(row.branch)) };
    },
    schedule: async () => { await session.refresh(); session.requireRole('admin'); return bookingsFrom(session).filter(row => canView(row.branch)); } };
}
