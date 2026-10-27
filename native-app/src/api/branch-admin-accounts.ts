import type {AdminAccess} from './admin-access';
import {requireValue} from './errors';

export interface BranchAdminAccount {
  id: string; loginId: string | null; label: string; branches: string[];
  createdAt: string; active: boolean; loginMode: 'id_password' | 'legacy_password';
}
export interface BranchAdminCreate {
  loginId: string; label: string; password: string; branches: string[];
}
function safeAccount(value: unknown): BranchAdminAccount {
  const row = value as BranchAdminAccount | null;
  requireValue(row && typeof row.id === 'string' && typeof row.label === 'string' && Array.isArray(row.branches)
    && row.branches.every(branch => typeof branch === 'string') && typeof row.createdAt === 'string'
    && typeof row.active === 'boolean' && ['id_password', 'legacy_password'].includes(row.loginMode), 'INVALID_RESPONSE');
  requireValue(row.loginMode === 'id_password' ? row.loginId === row.id : row.loginId === null, 'INVALID_RESPONSE');
  return {id: row.id, loginId: row.loginId, label: row.label, branches: [...row.branches], createdAt: row.createdAt,
    active: row.active, loginMode: row.loginMode};
}
export function createBranchAdminAccountsService(access: AdminAccess) {
  async function list(): Promise<BranchAdminAccount[]> {
    await access.load(true);
    const result = await access.rpc.call<unknown>('pm_branch_admin_manage', {p_action: 'list', p_data: {}});
    requireValue(Array.isArray(result), 'INVALID_RESPONSE');
    return result.map(safeAccount);
  }
  async function create(input: BranchAdminCreate): Promise<BranchAdminAccount> {
    await access.load(true);
    const loginId = input.loginId.trim(), label = input.label.trim();
    requireValue(/^[A-Za-z0-9._-]{4,40}$/.test(loginId), 'INVALID_ID');
    requireValue(label.length >= 1 && label.length <= 60);
    const characters = Array.from(input.password);
    const passwordBytes = characters.reduce((bytes, ch) => {
      const point = ch.codePointAt(0) || 0; return bytes + (point > 0xFFFF ? 4 : point > 0x7FF ? 3 : point > 0x7F ? 2 : 1);
    }, 0);
    requireValue(characters.length >= 10 && passwordBytes <= 72
      && /[A-Za-z]/.test(input.password) && /[0-9]/.test(input.password), 'WEAK_PASSWORD');
    const available = access.rows<{name: string}>('pm-branches').map(branch => branch.name);
    requireValue(input.branches.length > 0 && input.branches.length <= 20 && new Set(input.branches).size === input.branches.length
      && input.branches.every(branch => available.includes(branch)), 'INVALID_BRANCH');
    return safeAccount(await access.rpc.call('pm_branch_admin_manage', {p_action: 'create',
      p_data: {loginId, label, password: input.password, branches: [...input.branches]}}));
  }
  return {list, create};
}
