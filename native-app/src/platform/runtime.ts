import {AppState, Linking} from 'react-native';
import {createNativeServices} from '../api/services';
import {publicConfig} from './config';
import {sessionStorage} from './session-storage';
import {bindingSnapshot, deviceId, nativePush, onActivityToken, onTokenRefresh, syncSchedule} from './push';
import {photoPicker} from './photos';

export const services = createNativeServices({...publicConfig, storage: sessionStorage, push: nativePush, deviceId, photoPicker});
export const push = {
  async status() {
    const value = await services.notifications.connection();
    return {permission: value.permission === 'default' ? 'notDetermined' as const : value.permission,
      connected: value.connected, deviceId: await deviceId()};
  },
  async connect() {await services.notifications.enable();},
  async disconnect() {await services.notifications.disable();},
  openSettings: () => Linking.openSettings(),
};
export function startRuntime() {
  let stopped = false, busy = false;
  const refreshSchedule = async () => {
    if (stopped || busy || AppState.currentState !== 'active') return;
    const captured = bindingSnapshot();
    if (!captured.binding) return;
    busy = true;
    try {
      const snapshot = await services.notifications.bookingSnapshot();
      if (!stopped) await syncSchedule(snapshot, captured);
    } catch {/* A failed read never republishes an old snapshot. */}
    finally {busy = false;}
  };
  const interval = setInterval(() => {void refreshSchedule();}, 30000);
  const foreground = AppState.addEventListener('change', state => {
    if (state === 'active') void services.notifications.restoreConnection().catch(() => {}).then(refreshSchedule);
  });
  const stopSession = services.session.subscribe(() => {void refreshSchedule();});
  const stopOpen = services.notifications.subscribeOpen(() => {void refreshSchedule();});
  const stopToken = onTokenRefresh(() => {void services.notifications.restoreConnection().catch(() => {});});
  const stopActivity = onActivityToken(event => {
    void services.notifications.registerActivityToken(event).catch(() => {});
  });
  void services.notifications.initialTarget();
  return () => {
    stopped = true; clearInterval(interval); foreground.remove(); stopSession(); stopOpen(); stopToken(); stopActivity();
  };
}
