import React from 'react';
import {Linking, Modal, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../../App';
import {createQaEnvironment} from '../../../qa/fixture-services';
import {branchMapUrl, branchPhoneUrl} from '../BranchesScreen';
import type {Branch} from '../../../domain/types';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
async function mount(overrides: Partial<Branch> = {}) {
  const environment = createQaEnvironment({screen: 'home'}, 'data:image/png;base64,qa');
  environment.data.content.branches = [{name: '프로모터스 안산점', addr: '예시 주소', tel: '031-831-9738', mobile: '010-0000-0000',
    map: 'https://naver.me/ExamplePlace', imageKeys: ['branch-first', 'branch-second'], ...overrides}];
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={environment.services} push={environment.push} initialRoute={{name: 'branches'}}/>);});
  trees.push(tree); return tree;
}
async function press(tree: ReactTestRenderer, label: string) {
  const control = tree.root.findAll(node => node.props.accessibilityRole === 'button').find(row => row.props.accessibilityLabel === label);
  if (!control || control.props.disabled) throw new Error('누를 수 있는 지점 기능이 없습니다: ' + label + ' / ' + tree.root.findAll(node => node.props.accessibilityRole === 'button').map(row => row.props.accessibilityLabel).join(', '));
  await act(async () => {await control.props.onPress();});
}
function text(tree: ReactTestRenderer) {return tree.root.findAllByType(Text).flatMap(row => row.props.children).flat(Infinity).filter(value => typeof value === 'string' || typeof value === 'number').join(' ');}
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());}); jest.restoreAllMocks();});

test('등록된 지점 사진을 모두 넘겨 보고 앱 안에서 확대·닫는다', async () => {
  const tree = await mount();
  expect(text(tree).replace(/\s+/g, '')).toContain('1/2');
  expect(tree.root.findAll(node => node.props.accessibilityRole === 'button').some(row => row.props.accessibilityLabel === '프로모터스 안산점 사진 1 크게 보기')).toBe(true);
  expect(tree.root.findAll(node => node.props.accessibilityRole === 'button').some(row => row.props.accessibilityLabel === '프로모터스 안산점 사진 2 크게 보기')).toBe(true);
  await press(tree, '프로모터스 안산점 다음 사진');
  expect(text(tree).replace(/\s+/g, '')).toContain('2/2');
  await press(tree, '프로모터스 안산점 사진 2 크게 보기');
  expect(tree.root.findAllByType(Modal).some(row => row.props.visible)).toBe(true);
  expect(tree.root.findAll(node => node.props.maximumZoomScale > 1 && node.props.minimumZoomScale === 1).length > 0).toBe(true);
  await press(tree, '매장 사진 닫기');
  expect(tree.root.findAllByType(Modal).some(row => row.props.visible)).toBe(false);
  await press(tree, '프로모터스 안산점 다음 사진');
  expect(text(tree).replace(/\s+/g, '')).toContain('1/2');
});

test('등록 지도와 유선·휴대폰 연결을 네이티브 링크로 연다', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined), tree = await mount();
  await press(tree, '길찾기');
  await press(tree, '전화하기');
  await press(tree, '휴대폰 연결');
  expect(open.mock.calls.map(call => call[0])).toEqual(['https://naver.me/ExamplePlace', 'tel:0318319738', 'tel:01000000000']);
});

test.each(['javascript:alert(1)', 'file:///private/map', 'intent://map', 'https://user:password@example.com/map', 'https://example.com/\nmap'])('지점의 위험한 지도 주소는 검색으로 대체한다: %s', map => {
  expect(branchMapUrl({name: '프로모터스 안산점', addr: '예시 주소', map})).toBe('https://map.naver.com/p/search/' + encodeURIComponent('예시 주소'));
});

test('HTTP 지도와 정상 전화번호만 연결하며 누락된 지도는 지점을 검색한다', () => {
  expect(branchMapUrl({name: '예시 지점', map: 'http://example.com/map'})).toBe('http://example.com/map');
  expect(branchMapUrl({name: '예시 지점'})).toBe('https://map.naver.com/p/search/' + encodeURIComponent('예시 지점'));
  expect(branchPhoneUrl('+82 31-831-9738')).toBe('tel:+82318319738');
  expect(branchPhoneUrl('준비중')).toBe('');
});

test('사진 목록 형식이 잘못되어도 기존 단일 사진을 표시한다', async () => {
  const tree = await mount({imageKeys: '잘못된 목록' as unknown as string[], imageKey: 'branch-fallback'});
  expect(tree.root.findAll(node => node.props.accessibilityRole === 'button').some(row => row.props.accessibilityLabel === '프로모터스 안산점 사진 1 크게 보기')).toBe(true);
  expect(tree.root.findAll(node => node.props.accessibilityLabel === '프로모터스 안산점 다음 사진')).toHaveLength(0);
});
