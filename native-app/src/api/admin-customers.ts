import type { AdminAccess } from './admin-access';
import { requireValue } from './errors';
import type { Booking, JsonRecord, MemberProfile } from '../domain/types';
import type { CustomerFile, ManagedRun } from '../domain/management';

export function createAdminCustomersService(access: AdminAccess, id: () => string) {
  async function list() { return access.members(); }
  async function get(memberId: string) {
    await access.load(true); const profile = (await access.members()).find(member => member.id === memberId); requireValue(profile, 'CUSTOMER_UNAVAILABLE');
    const files = access.value<Record<string, CustomerFile>>('pm-customers', {}), file = files[String(profile.car || '')] || { memo: '', memoEntries: [], records: [] };
    const owned = (row: JsonRecord) => row.memberId === memberId || (row.customer as MemberProfile | undefined)?.id === memberId;
    if (file.memo && !file.memoEntries?.length) file.memoEntries = [{ id: 'legacy-memo', body: file.memo, createdAt: file.memoUpdatedAt || '' }];
    return { profile, file, bookings: access.rows<Booking>('pm-bookings').filter(owned), runs: access.rows<ManagedRun>('pm-service-runs').filter(owned) };
  }
  async function saveFile(memberId: string, change: (file: CustomerFile) => void) {
    const context = await get(memberId), key = String(context.profile.car || ''); requireValue(key, 'CUSTOMER_UNAVAILABLE');
    const files = access.value<Record<string, CustomerFile>>('pm-customers', {}), file = { ...context.file };
    change(file); files[key] = file; await access.write('pm-customers', files); return file;
  }
  return { list, get,
    saveMemo: (memberId: string, value: {id?: string; title: string; body: string}) => {
      requireValue(value.title.length <= 200 && value.body.length <= 4000 && (value.title.trim() || value.body.trim()));
      return saveFile(memberId, file => {
        const entries = [...(file.memoEntries || [])], previous = value.id ? entries.findIndex(entry => entry.id === value.id) : -1;
        if (value.id) requireValue(previous >= 0, 'EDIT_CONFLICT');
        const entry = { ...(previous >= 0 ? entries[previous] : {}), id: value.id || id(), title: value.title.trim(), body: value.body.trim(),
          ...(previous >= 0 ? { updatedAt: new Date().toISOString() } : { createdAt: new Date().toISOString() }) };
        if (previous >= 0) entries[previous] = entry; else entries.unshift(entry);
        file.memoEntries = entries; file.memo = value.body.trim() || value.title.trim(); file.memoUpdatedAt = new Date().toISOString();
      });
    },
    saveRecord: (memberId: string, value: {date: string; service: string; note: string}) => {
      requireValue(/^\d{4}\.\d{2}\.\d{2}$/.test(value.date) && value.service.trim() && value.service.length <= 200 && value.note.length <= 4000);
      return saveFile(memberId, file => { file.records = [{ ...value, id: id(), createdAt: new Date().toISOString() }, ...(file.records || [])]; });
    },
    restrict: async (memberId: string, reason: string) => {
      requireValue(reason.trim() && reason.length <= 1000); const { profile } = await get(memberId);
      const restrictions = access.rows<JsonRecord>('pm-banned-members');
      requireValue(!restrictions.some(entry => (entry.member as MemberProfile | undefined)?.id === memberId), 'ALREADY_RESTRICTED');
      restrictions.unshift({ id: id(), member: profile, type: 'blocked', reason: reason.trim(), createdAt: new Date().toISOString() });
      await access.write('pm-banned-members', restrictions);
    },
  };
}
