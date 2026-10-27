import * as Keychain from 'react-native-keychain';

export type RememberedLogin = {read(): Promise<string>; write(id: string | null): Promise<void>};
const service = 'kr.promotors.app.login-id';
export const rememberedLogin: RememberedLogin = {
  async read() {
    const saved = await Keychain.getGenericPassword({service});
    return saved && /^[A-Za-z0-9._-]{4,40}$/.test(saved.password) ? saved.password : '';
  },
  async write(id) {
    if (!id) {await Keychain.resetGenericPassword({service}); return;}
    const saved = await Keychain.setGenericPassword('promotors-login-id', id, {service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    if (!saved) throw new Error('아이디를 저장하지 못했습니다. 다시 시도해 주세요.');
  },
};
