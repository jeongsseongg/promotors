import * as Keychain from 'react-native-keychain';
import type {SessionStorage, StoredSession} from '../domain/types';

const sessionService = 'kr.promotors.session';
const receiptService = 'kr.promotors.deletion-receipt';
async function read(service: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword({service});
  return result ? result.password : null;
}
async function write(service: string, value: string | null) {
  if (value === null) {await Keychain.resetGenericPassword({service}); return;}
  const result = await Keychain.setGenericPassword('promotors', value, {
    service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!result) throw new Error('안전한 로그인 정보를 저장하지 못했습니다.');
}
export const sessionStorage: SessionStorage = {
  async readSession() {
    const raw = await read(sessionService);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as StoredSession;
      if (typeof value.token !== 'string' || value.token.length > 4096 || !value.token ||
        value.expiresAt != null && (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) ||
        value.privacyEpoch !== undefined && !Number.isSafeInteger(value.privacyEpoch)) throw new Error();
      return {token: value.token, expiresAt: value.expiresAt, privacyEpoch: value.privacyEpoch};
    } catch {await write(sessionService, null); return null;}
  },
  writeSession: value => write(sessionService, value === null ? null : JSON.stringify(value)),
  async readDeletionReceipt() {
    const value = await read(receiptService);
    if (value && value.length <= 4096) return value;
    if (value) await write(receiptService, null);
    return null;
  },
  writeDeletionReceipt: value => write(receiptService, value),
};
