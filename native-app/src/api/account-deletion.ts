import type { RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { DeletionState, SessionStorage } from '../domain/types';

export function createDeletionService(rpc: RpcClient, session: SessionService, storage: SessionStorage) {
  async function apply(value: DeletionState) {
    requireValue(value && ['none', 'pending', 'processing', 'needs_review', 'cancelled', 'completed'].includes(value.status), 'INVALID_RESPONSE');
    session.markDeletionPending(['pending', 'processing', 'needs_review'].includes(value.status));
    if (value.status === 'completed') await session.clear();
    return value;
  }
  async function receipt(): Promise<DeletionState> {
    if (session.snapshot().authenticated) return state();
    const revision = session.snapshot().revision;
    const value = await storage.readDeletionReceipt();
    if (revision !== session.snapshot().revision) throw new ApiError('SESSION_CHANGED');
    if (!value) return { status: 'none', canCancel: false };
    return apply(await rpc.call<DeletionState>('pm_deletion_receipt', { p_receipt: value }));
  }
  async function state() {
    if (!session.snapshot().authenticated) return receipt();
    session.requireRole('customer');
    return apply(await rpc.call<DeletionState>('pm_account_deletion', { p_action: 'state', p_data: {} }));
  }
  return { state, receipt,
    request: async (password: string) => {
      session.requireRole('customer'); requireValue(password);
      const owner = session.credentials();
      const result = await rpc.call<DeletionState>('pm_account_deletion', { p_action: 'request', p_data: { password } });
      if (result.receipt) await storage.writeDeletionReceipt(result.receipt);
      if (owner.token !== session.credentials().token || owner.state.revision !== session.snapshot().revision) throw new ApiError('SESSION_CHANGED');
      return apply(result);
    },
    cancel: async () => {
      session.requireRole('customer');
      return apply(await rpc.call<DeletionState>('pm_account_deletion', { p_action: 'cancel', p_data: {} }));
    },
  };
}
