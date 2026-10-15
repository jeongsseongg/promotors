import { requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { ManagedRun } from '../domain/management';

export function createRepairPhotoAccess(session: SessionService) {
  const pending = new Map<string, {owner: string; revision: number; branch: string}>();
  session.beforeClear(() => { pending.clear(); });
  function uploaded(key: string, branch: string) {
    const { token, state } = session.credentials(); requireValue(token && state.authenticated, 'AUTH_REQUIRED');
    session.requireRole('admin', branch); pending.set(key, { owner: token, revision: state.revision, branch });
  }
  async function authorize(key: string) {
    requireValue(/^[A-Za-z0-9_.-]{1,240}$/.test(key) && !/^(branch|notice|case|intro|event)-/.test(key), 'FORBIDDEN');
    await session.ensureReady(); const { token, state } = session.credentials(); requireValue(token && state.authenticated, 'AUTH_REQUIRED');
    if (state.role === 'main') return;
    const upload = pending.get(key);
    if (state.role === 'general' && upload?.owner === token && upload.revision === state.revision && state.branches.includes(upload.branch)) return;
    const payload = session.data()?.rows.find(row => row.data_key === 'pm-service-runs')?.payload;
    const runs = Array.isArray(payload) ? payload as ManagedRun[] : [];
    const allowed = runs.some(run => (state.role !== 'general' || state.branches.includes(run.branch)) &&
      (run.steps || []).some(step => (state.role !== 'customer' || step.approved) && step.photoKeys?.includes(key)));
    requireValue(allowed, 'ASSET_FORBIDDEN');
  }
  return { authorize, uploaded };
}
export type RepairPhotoAccess = ReturnType<typeof createRepairPhotoAccess>;
