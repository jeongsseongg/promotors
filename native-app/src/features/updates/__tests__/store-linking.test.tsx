import React from 'react';
import {AppState, Linking, Modal, Platform, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {UpdateNotice} from '../UpdateNotice';
import {createStoreUpdates, StoreUpdates} from '../../../platform/app-updates';

// Keep React Native's receiver-dependent validation; replace only the OS bridge.
jest.mock('react-native/Libraries/Linking/Linking', () =>
  jest.requireActual('react-native/Libraries/Linking/Linking'));
jest.mock('react-native/Libraries/Linking/NativeIntentAndroid', () => ({
  __esModule: true, default: {openURL: jest.fn()},
}));
jest.mock('react-native/Libraries/Linking/NativeLinkingManager', () => ({
  __esModule: true, default: {openURL: jest.fn(), addListener: jest.fn(), removeListeners: jest.fn()},
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaView: require('react-native').View,
}));

type Transport = {openURL: jest.Mock<Promise<void>, [string]>};
const android = require('react-native/Libraries/Linking/NativeIntentAndroid').default as Transport;
const ios = require('react-native/Libraries/Linking/NativeLinkingManager').default as Transport;
const appleUrl = 'https://apps.apple.com/kr/app/id6810716100';
const marketUrl = 'market://details?id=kr.promotors.app';
const playUrl = 'https://play.google.com/store/apps/details?id=kr.promotors.app';
const trees: ReactTestRenderer[] = [];

beforeEach(() => {
  ios.openURL.mockReset().mockResolvedValue(undefined);
  android.openURL.mockReset().mockResolvedValue(undefined);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({remove: jest.fn()});
});
afterEach(async () => {
  await act(async () => trees.splice(0).forEach(tree => tree.unmount()));
  jest.restoreAllMocks();
});

function updater(platform: 'ios' | 'android'): StoreUpdates {
  jest.replaceProperty(Platform, 'OS', platform);
  return createStoreUpdates({
    platform, currentVersion: '1.0.0', iosVersion: '18.0',
    androidCheck: async () => ({available: true, availableCode: 123, currentCode: 122}),
    fetcher: jest.fn(async () => ({ok: true, json: async () => ({results: [{
      trackId: 6810716100, bundleId: 'kr.promotors.app', version: '2.0.0', minimumOsVersion: '15.1',
    }]})})) as unknown as typeof fetch,
  });
}
async function mount(platform: 'ios' | 'android') {
  const updates = updater(platform);
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<UpdateNotice updates={updates} eligible/>);});
  trees.push(tree);
  expect(Linking).toBe(jest.requireActual('react-native/Libraries/Linking/Linking').default);
  expect(jest.isMockFunction(Linking.openURL)).toBe(false);
  expect(visible(tree)).toBe(true);
  return tree;
}
function visible(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Modal).some(node => node.props.visible);
}
async function pressUpdate(tree: ReactTestRenderer) {
  const button = tree.root.findAll(node => node.props.accessibilityRole === 'button' &&
    typeof node.props.onPress === 'function' && node.findAllByType(Text)
      .some(text => text.props.children === '업데이트'))[0];
  expect(button).toBeDefined();
  await act(async () => {button!.props.onPress();});
}
function expectError(tree: ReactTestRenderer) {
  expect(visible(tree)).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.accessibilityRole === 'alert' &&
    String(node.props.children).includes('스토어를 열지 못했어요'))).toBe(true);
}

test.each(['ios', 'android'] as const)('%s 업데이트 버튼은 실제 Linking을 거쳐 공식 스토어를 연다', async platform => {
  const tree = await mount(platform);
  await pressUpdate(tree);
  const transport = platform === 'ios' ? ios : android;
  expect(transport.openURL.mock.calls).toEqual([[platform === 'ios' ? appleUrl : marketUrl]]);
  expect((platform === 'ios' ? android : ios).openURL).not.toHaveBeenCalled();
  expect(visible(tree)).toBe(false);
});

test('갤럭시 스토어 앱 연결 실패 후 실제 Linking으로 공식 웹 주소를 연다', async () => {
  android.openURL.mockRejectedValueOnce(new Error('no market handler'));
  const tree = await mount('android');
  await pressUpdate(tree);
  expect(android.openURL.mock.calls).toEqual([[marketUrl], [playUrl]]);
  expect(ios.openURL).not.toHaveBeenCalled();
  expect(visible(tree)).toBe(false);
});

test.each(['ios', 'android'] as const)('%s OS가 이동을 거부하면 오류를 남기고 재시도한다', async platform => {
  const transport = platform === 'ios' ? ios : android;
  transport.openURL.mockRejectedValueOnce(new Error('store unavailable'));
  if (platform === 'android') transport.openURL.mockRejectedValueOnce(new Error('browser unavailable'));
  const tree = await mount(platform);
  await pressUpdate(tree);
  expectError(tree);
  const failedCalls = platform === 'ios' ? [[appleUrl]] : [[marketUrl], [playUrl]];
  expect(transport.openURL.mock.calls).toEqual(failedCalls);
  await pressUpdate(tree);
  expect(transport.openURL.mock.calls).toEqual([...failedCalls, [platform === 'ios' ? appleUrl : marketUrl]]);
  expect(visible(tree)).toBe(false);
});
