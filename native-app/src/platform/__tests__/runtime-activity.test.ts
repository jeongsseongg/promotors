const mockSessionListeners = new Set<() => void>();
const mockServices = {
  session: {snapshot: () => ({authenticated: true, role: 'main', branches: [], profile: {id: 'synthetic-owner'}, revision: 1, privacyEpoch: 1}),
    subscribe: (listener: () => void) => {mockSessionListeners.add(listener); return () => mockSessionListeners.delete(listener);}, beforeClear: () => () => {}},
  notifications: {registerActivityToken: jest.fn(async () => ({ok: true})), bookingSnapshot: jest.fn(),
    restoreConnection: jest.fn(async () => {}), subscribeOpen: () => () => {}, initialTarget: async () => null},
  subscribeBookingChange: () => () => {},
};
const binding = '00000000-0000-4000-8000-000000000015';
const mockReadSnapshot = jest.fn(async () => ({supported: true, enabled: true, binding, tokens: [{binding, kind: 'start', token: 'a'.repeat(64)}]}));
jest.mock('react-native', () => ({AppState: {currentState: 'background', addEventListener: () => ({remove() {}})}, Linking: {openSettings: jest.fn()}}));
jest.mock('../../api/services', () => ({createNativeServices: () => mockServices}));
jest.mock('../config', () => ({publicConfig: {}}));
jest.mock('../session-storage', () => ({sessionStorage: {}}));
jest.mock('../../features/auth/rememberedLogin', () => ({rememberedLogin: {read: async () => '', write: async () => {}}}));
jest.mock('../photos', () => ({photoPicker: {}}));
jest.mock('../notification-preferences', () => ({notificationConnectionPreferences: {}}));
jest.mock('../push', () => ({nativePush: {}, deviceId: jest.fn(), bindingSnapshot: () => ({binding: '00000000-0000-4000-8000-000000000015', generation: 1}),
  activityTokenSnapshot: () => mockReadSnapshot(), onTokenRefresh: () => () => {}, onActivityToken: () => () => {}, syncSchedule: jest.fn()}));

test('백그라운드 로그인 복원에서도 놓친 상시 토큰을 복구하며 예약 화면은 새로 만들지 않는다', async () => {
  const {startRuntime} = require('../runtime') as typeof import('../runtime');
  const stop = startRuntime();
  try {
    mockSessionListeners.forEach(listener => listener());
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(mockReadSnapshot).toHaveBeenCalledTimes(1);
    expect(mockServices.notifications.registerActivityToken).toHaveBeenCalledWith({binding, kind: 'start', token: 'a'.repeat(64)});
    expect(mockServices.notifications.bookingSnapshot).not.toHaveBeenCalled();
  } finally {stop();}
});
