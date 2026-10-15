import { NATIVE_SOURCE, type RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { JsonRecord, MemberProfile } from '../domain/types';
import type { ContentReference } from '../domain/management';

export function createAdminAccess(rpc: RpcClient, session: SessionService) {
  const requireMain = () => { session.requireRole('admin'); requireValue(session.snapshot().role === 'main', 'MAIN_ADMIN_REQUIRED'); };
  const requireTop = () => { session.requireRole('admin'); requireValue(['main', 'developer'].includes(session.snapshot().role || ''), 'MAIN_ADMIN_REQUIRED'); };
  async function load(main = false) { await session.refresh(); session.requireRole('admin'); if (main) requireMain(); }
  async function loadTop() { await load(); requireTop(); }
  function value<T>(key: string, fallback: T): T { return session.data()?.rows.find(row => row.data_key === key)?.payload as T ?? fallback; }
  function rows<T extends JsonRecord>(key: string): T[] { const items = value<unknown>(key, []); return Array.isArray(items) ? items as T[] : []; }
  function requireBranch(branch: string) { requireValue(branch, 'INVALID_BRANCH'); session.requireRole('admin', branch); }
  async function merge(key: 'pm-service-runs' | 'pm-work-audit' | 'pm-messages', items: JsonRecord[]) {
    await session.ensureReady(); session.requireRole('admin');
    for (const item of items) { requireValue(typeof item.id === 'string' && item.id); requireBranch(String(item.branch || '')); }
    return rpc.call('pm_sync_merge_by_id', { p_key: key, p_payload: items, p_page_url: NATIVE_SOURCE });
  }
  async function write(key: string, payload: unknown) {
    if (['pm-customers', 'pm-banned-members'].includes(key)) requireTop(); else requireMain();
    return rpc.call('pm_sync_write', { p_key: key, p_payload: payload, p_page_url: NATIVE_SOURCE });
  }
  async function replace<T extends JsonRecord>(key: string, reference: ContentReference | null, entry: T) {
    await load(true); const items = rows<T>(key);
    if (reference) {
      const previous = items[reference.index];
      if (!previous || JSON.stringify(previous) !== reference.fingerprint) throw new ApiError('EDIT_CONFLICT');
      items[reference.index] = { ...previous, ...entry };
    } else items.unshift(entry);
    await write(key, items); return entry;
  }
  async function members() {
    await loadTop();
    const result = await rpc.call<MemberProfile[]>('pm_customer_accounts'); requireValue(Array.isArray(result), 'INVALID_RESPONSE');
    return result.map(member => { const safe = { ...member }; for (const key of ['password', 'password_hash', 'passwordHash', 'token', 'sessionToken']) delete safe[key]; return safe; });
  }
  return { load, loadTop, value, rows, merge, write, replace, members, requireMain, requireTop, requireBranch, session, rpc };
}
export type AdminAccess = ReturnType<typeof createAdminAccess>;
