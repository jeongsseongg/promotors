import {nativePush} from '../push';

const mockOpenListeners = new Map<string, (value: unknown) => void>();
const binding = '00000000-0000-4000-8000-000000000015';
jest.mock('react-native', () => ({
  Platform: {OS: 'ios'},
  NativeModules: {PromotorsPush: {addListener: jest.fn(), removeListeners: jest.fn()}},
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: (name: string, listener: (value: unknown) => void) => {
      mockOpenListeners.set(name, listener); return {remove: () => mockOpenListeners.delete(name)};
    },
  })),
}));

test.each([123, null, true, ['booking-id'], '', {}])('알림 ID가 문자열이 아니거나 비어 있으면 거부한다: %p', async value => {
  const received = jest.fn(), stop = nativePush.onOpen(received);
  mockOpenListeners.get('pm-notification-open')?.({binding, notificationId: value});
  mockOpenListeners.get('pm-notification-open')?.({binding, bookingId: value});
  await Promise.resolve(); await Promise.resolve();
  expect(received).not.toHaveBeenCalled();
  stop();
});

test('서버 규격에 맞는 문자열 ID는 액션 권한 없이 전달한다', async () => {
  const received = jest.fn(), stop = nativePush.onOpen(received);
  mockOpenListeners.get('pm-notification-open')?.({binding, bookingId: 'booking:valid-1'});
  await Promise.resolve(); await Promise.resolve();
  expect(received).toHaveBeenCalledWith({binding, bookingId: 'booking:valid-1', notificationId: undefined, action: undefined, trustedAction: false});
  stop();
});
