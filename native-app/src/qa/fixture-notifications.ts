import {NativeEventEmitter, NativeModules} from 'react-native';
import {NativePush} from '../components/AppContext';
import {JsonRecord, NotificationTarget} from '../domain/types';
import {createQaData} from './fixture-data';

export function createQaNotifications(data: ReturnType<typeof createQaData>, push: NativePush, calls: string[]) {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  return {
    state: async () => clone(data.notificationState),
    preferences: async (patch: JsonRecord) => {data.notificationState.preferences = {...data.notificationState.preferences, ...patch}; return clone(data.notificationState.preferences);},
    maintenance: async (date: string | null) => {data.notificationState.maintenanceDate = date;},
    read: async (id?: string) => {data.notificationState.items.forEach(row => {if (!id || row.id === id) row.read_at = new Date().toISOString();});},
    resolve: async (id: string): Promise<NotificationTarget> => clone(data.notificationState.items.find(row => row.id === id)?.target || {kind: 'inbox'}),
    test: async (_deviceId?: string) => {calls.push('notification:test-fixture-only'); return {queued: true};},
    subscribeOpen: (listener: (target: NotificationTarget) => void) => {
      const bridge = NativeModules.PromotorsPush;
      if (!bridge) return () => {};
      let active = true;
      const open = (raw: unknown) => {
        if (!active || !raw || typeof raw !== 'object') return;
        const target = raw as {binding?: unknown; bookingId?: unknown; notificationId?: unknown; runId?: unknown};
        if (target.binding !== '00000000-0000-4000-8000-000000000015') return;
        // Synthetic OS actions only open a fixture; they never approve or reject a booking.
        if (target.runId === 'qa-run' || target.notificationId === '44444444-4444-4444-8444-444444444444') {
          listener({kind: 'repair', id: 'qa-run'});
        } else if (target.bookingId === 'qa-pending' || target.notificationId === 'qa-notification') {
          listener({kind: 'booking', id: 'qa-pending', branch: '프로모터스 안산점'});
        } else if (target.bookingId === undefined && target.notificationId === undefined) {
          listener({kind: 'bookingSchedule'});
        }
      };
      const subscription = new NativeEventEmitter(bridge).addListener('pm-notification-open', open);
      if (bridge.getInitialTarget) Promise.resolve(bridge.getInitialTarget()).then(open).catch(() => {});
      return () => {active = false; subscription.remove();};
    },
    enable: async () => push.connect(), disable: async () => push.disconnect(),
    connection: async () => ({supported: true, ...(await push.status()), enabled: data.notificationState.preferences.enabled}),
    restoreConnection: async () => {},
  };
}
