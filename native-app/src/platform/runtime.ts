import {AppState, Linking} from 'react-native';
import {createNativeServices} from '../api/services';
import {publicConfig} from './config';
import {sessionStorage} from './session-storage';
import {bindingSnapshot, deviceId, nativePush, onActivityToken, onTokenRefresh, syncSchedule} from './push';
import {createActivityTokenQueue} from './activity-tokens';
import {photoPicker} from './photos';
import {notificationConnectionPreferences} from './notification-preferences';

export const services = createNativeServices({...publicConfig, storage: sessionStorage, push: nativePush, deviceId, photoPicker, connectionPreferences: notificationConnectionPreferences});
let requestScheduleRefresh: () => Promise<void> = async () => {};
let requestActivityTokenRefresh: () => Promise<void> = async () => {};
function activityContext() {
  const state = services.session.snapshot(), native = bindingSnapshot();
  const owner = state.authenticated && state.role !== 'customer' ?
    JSON.stringify([state.revision, state.profile?.id, state.role, state.branches, state.privacyEpoch]) : null;
  return {owner, binding: native.binding, generation: native.generation};
}
export const push = {
  async status() {
    const value = await services.notifications.connection();
    return {permission: value.permission === 'default' ? 'notDetermined' as const : value.permission,
      connected: value.connected, automatic: value.automatic, deviceId: await deviceId()};
  },
  async connect() {await services.notifications.enable(); await requestActivityTokenRefresh(); await requestScheduleRefresh();},
  async disconnect() {await services.notifications.disable(); await requestActivityTokenRefresh();},
  openSettings: () => Linking.openSettings(),
};
export function startRuntime() {
  let stopped = false, busy = false, queued = false, requestEpoch = 0;
  const activityTokens = createActivityTokenQueue({context: activityContext, register: event => services.notifications.registerActivityToken(event)});
  const refreshTokens = () => activityTokens.flush();
  requestActivityTokenRefresh = refreshTokens;
  const refreshSchedule = async () => {
    if (stopped || AppState.currentState !== 'active') return;
    const ticket = ++requestEpoch;
    if (busy) {queued = true; return;}
    const captured = bindingSnapshot();
    if (!captured.binding) return;
    busy = true;
    try {
      const snapshot = await services.notifications.bookingSnapshot();
      if (!stopped && ticket === requestEpoch) await syncSchedule(snapshot, captured);
    } catch {/* A failed read never republishes an old snapshot. */}
    finally {busy = false; if (queued) {queued = false; void refreshSchedule();}}
  };
  const reconnect = async () => {await services.notifications.restoreConnection().catch(() => {}); await refreshTokens(); await refreshSchedule();};
  const interval = setInterval(() => {void refreshSchedule(); void refreshTokens();}, 30000);
  requestScheduleRefresh = refreshSchedule;
  const foreground = AppState.addEventListener('change', state => {if (state === 'active') void reconnect();});
  const stopSession = services.session.subscribe(() => {activityTokens.reconcile(); void refreshTokens(); void refreshSchedule();});
  const stopClear = services.session.beforeClear(() => {activityTokens.clear();});
  const stopOpen = services.notifications.subscribeOpen(() => {void refreshSchedule();});
  const stopBooking = services.subscribeBookingChange(() => {void refreshSchedule();});
  const stopToken = onTokenRefresh(() => {void reconnect();});
  const stopActivity = onActivityToken(event => {activityTokens.offer(event);});
  void services.notifications.initialTarget();
  return () => {
    stopped = true; clearInterval(interval); foreground.remove(); stopSession(); stopClear(); stopOpen(); stopBooking(); stopToken(); stopActivity(); activityTokens.dispose();
    if (requestScheduleRefresh === refreshSchedule) requestScheduleRefresh = async () => {};
    if (requestActivityTokenRefresh === refreshTokens) requestActivityTokenRefresh = async () => {};
  };
}
