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
    subscribeOpen: (_listener: (target: NotificationTarget) => void) => () => {},
    enable: async () => push.connect(), disable: async () => push.disconnect(),
    connection: async () => ({supported: true, ...(await push.status()), enabled: data.notificationState.preferences.enabled}),
    restoreConnection: async () => {},
  };
}
