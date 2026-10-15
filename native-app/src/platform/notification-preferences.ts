import * as Keychain from 'react-native-keychain';
import type {NotificationConnectionPreferences} from '../domain/types';

const service = 'kr.promotors.notification-connection-preferences';
let queue: Promise<void> = Promise.resolve();
async function read() {
  const stored = await Keychain.getGenericPassword({service});
  if (!stored) return [] as string[];
  try {
    const value: unknown = JSON.parse(stored.password);
    if (Array.isArray(value) && value.length <= 40 && value.every(key => typeof key === 'string' && key.length <= 1024)) return value as string[];
  } catch {}
  throw new Error('이 기기의 알림 설정을 확인하지 못했습니다. 다시 시도해 주세요.');
}
export const notificationConnectionPreferences: NotificationConnectionPreferences = {
  async allowed(ownerKey) {await queue.catch(() => {}); return !(await read()).includes(ownerKey);},
  save(ownerKey, allowed) {
    const task = queue.catch(() => {}).then(async () => {
      const keys = (await read()).filter(key => key !== ownerKey);
      if (!allowed) keys.push(ownerKey);
      const saved = await Keychain.setGenericPassword('promotors', JSON.stringify(keys.slice(-40)), {
        service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (!saved) throw new Error('이 기기의 알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.');
    });
    queue = task; return task;
  },
};
