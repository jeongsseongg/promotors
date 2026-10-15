import {NativeModules} from 'react-native';
import {NativePush, PushStatus} from '../components/AppContext';

export function createQaPush(requestOsPermission: boolean, stateChanged: (enabled: boolean) => void): NativePush {
  let connected = false;
  let permission: PushStatus['permission'] = requestOsPermission ? 'notDetermined' : 'granted';
  const bridge = NativeModules.PromotorsPush;
  async function status(): Promise<PushStatus> {
    if (requestOsPermission && bridge?.getPermissionStatus) {
      const actual = await bridge.getPermissionStatus();
      permission = actual === 'default' ? 'notDetermined' : actual;
    }
    return {permission, connected, deviceId: 'qa-device-no-server'};
  }
  return {
    status,
    connect: async () => {
      if (requestOsPermission) {
        if (!bridge?.requestPermission) throw new Error('네이티브 권한 기능을 사용할 수 없습니다.');
        const actual = await bridge.requestPermission();
        permission = actual === 'default' ? 'notDetermined' : actual;
        if (permission !== 'granted') throw new Error('앱 알림 권한이 허용되지 않았습니다.');
      }
      connected = true; stateChanged(true);
    },
    disconnect: async () => {connected = false; stateChanged(false);},
    openSettings: async () => {throw new Error('테스트 화면에서는 휴대폰 설정을 변경하지 않습니다.');},
  };
}
