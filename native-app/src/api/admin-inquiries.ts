import { requireValue } from './errors';
import type { AdminAccess } from './admin-access';
import type { Inquiry, Booking, JsonRecord } from '../domain/types';
import type { ManagedRun } from '../domain/management';

export function createAdminInquiriesService(access: AdminAccess, id: () => string) {
  async function list() { await access.load(); return access.rows<Inquiry>('pm-messages').filter(row => !(row.serviceContext as JsonRecord | undefined)?.runId); }
  async function thread(messageId: string) {
    const messages = await list(), selected = messages.find(row => row.id === messageId); requireValue(selected, 'INQUIRY_UNAVAILABLE');
    const owner = selected.memberId || selected.customer?.id; requireValue(owner, 'INQUIRY_UNAVAILABLE');
    const items = messages.filter(row => (row.memberId || row.customer?.id) === owner && (!row.memberId || !row.customer?.id || row.memberId === row.customer.id))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    return { selected, owner, items };
  }
  async function reply(messageId: string, message: string) {
    requireValue(message.trim() && message.length <= 4000); const conversation = await thread(messageId);
    const bookings = access.rows<Booking>('pm-bookings').filter(row => row.memberId === conversation.owner)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    const run = access.rows<ManagedRun>('pm-service-runs').find(row => row.memberId === conversation.owner);
    const branch = bookings[0]?.branch || run?.branch || String(conversation.selected.branch || '');
    if (access.session.snapshot().role === 'general') access.requireBranch(branch);
    const value: Inquiry = { id: id(), branch, memberId: conversation.owner, car: conversation.selected.car || conversation.selected.customer?.car || '',
      from: 'admin', message: message.trim(), customer: conversation.selected.customer, createdAt: new Date().toISOString() };
    if (branch) await access.merge('pm-messages', [value]);
    else { access.requireMain(); await access.rpc.call('pm_sync_merge_by_id', { p_key: 'pm-messages', p_payload: [value], p_page_url: 'promotors-native://app' }); }
    return value;
  }
  return { list, thread, reply };
}
