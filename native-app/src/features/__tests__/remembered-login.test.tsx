import React from 'react';
import {Alert, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {NativeServices} from '../../components/AppContext';
import {Button, Field} from '../../components/Controls';
import {Screen} from '../../components/Screen';
import {createQaEnvironment} from '../../qa/fixture-services';
import {createQaSession} from '../../qa/fixture-session';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
type Storage = {read(): Promise<string>; write(id: string | null): Promise<void>};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}
async function mount(options: Partial<Storage> = {}) {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  const auth = createQaSession(false, true);
  const store = {read: jest.fn(options.read || (async () => '')),
    write: jest.fn(options.write || (async (_id: string | null) => {}))};
  const login = jest.spyOn(auth.session, 'loginMember');
  const services = {...environment.services, session: auth.session, rememberedLogin: store} as unknown as NativeServices;
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={services} push={environment.push} initialRoute={{name: 'login'}}/>);});
  trees.push(tree);
  return {tree, store, login, auth};
}
function field(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Field).find(node => node.props.label === label)!;
}
async function fill(tree: ReactTestRenderer, id = 'synthetic-user') {
  await act(async () => {
    field(tree, '아이디').props.onChangeText(id);
    field(tree, '비밀번호').props.onChangeText('not-a-real-password');
  });
}
async function remember(tree: ReactTestRenderer) {
  const checkbox = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' &&
    node.props.accessibilityLabel === '아이디 기억하기' && typeof node.props.onPress === 'function')[0];
  expect(checkbox).toBeDefined();
  await act(async () => {checkbox.props.onPress();});
}
async function submit(tree: ReactTestRenderer) {
  const button = tree.root.findAllByType(Button).find(node => node.props.testID === 'auth-submit');
  expect(button).toBeDefined();
  await act(async () => {await button!.props.onPress();});
}
function isMyPage(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Screen).some(node => node.props.title === '마이페이지');
}
function text(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity)
    .filter(value => typeof value === 'string').join('')).join('\n');
}
beforeEach(() => {jest.useFakeTimers();});
afterEach(async () => {
  await act(async () => {trees.splice(0).forEach(tree => tree.unmount());});
  jest.useRealTimers(); jest.restoreAllMocks();
});

test('저장된 아이디를 실제 로그인 입력에 복원하고 기억 체크를 표시한다', async () => {
  const {tree, store, login} = await mount({read: async () => 'saved-user'});
  expect(store.read).toHaveBeenCalled();
  expect(field(tree, '아이디').props.value).toBe('saved-user');
  expect(field(tree, '비밀번호').props.value).toBe('');
  const checkbox = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' &&
    node.props.accessibilityLabel === '아이디 기억하기')[0];
  expect(checkbox.props.accessibilityState.checked).toBe(true);
  expect(login).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
});

test('저장소 응답이 늦어도 사용자가 입력한 새 아이디를 덮어쓰지 않는다', async () => {
  const pending = deferred<string>();
  const {tree, store} = await mount({read: () => pending.promise});
  await act(async () => {field(tree, '아이디').props.onChangeText('edited-user');});
  await act(async () => {pending.resolve('old-saved-user'); await pending.promise;});
  expect(field(tree, '아이디').props.value).toBe('edited-user');
  const checkbox = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' &&
    node.props.accessibilityLabel === '아이디 기억하기')[0];
  expect(checkbox.props.accessibilityState.checked).toBe(false);
  expect(store.write).not.toHaveBeenCalled();
});

test('로그인 성공 후에는 아이디 한 값만 저장하고 마이페이지로 이동한다', async () => {
  const {tree, store, login, auth} = await mount();
  await fill(tree, ' synthetic-user ');
  await remember(tree);
  await submit(tree);
  expect(login).toHaveBeenCalledWith('synthetic-user', 'not-a-real-password', true);
  expect(store.write.mock.calls).toEqual([['synthetic-user']]);
  expect(auth.session.snapshot().authenticated).toBe(true);
  expect(isMyPage(tree)).toBe(true);
});

test('아이디 저장이 실패해도 완료된 로그인을 유지하고 마이페이지로 이동한다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const {tree, store, login, auth} = await mount({write: async () => {throw new Error('storage unavailable');}});
  await fill(tree);
  await remember(tree);
  await submit(tree);
  expect(login).toHaveBeenCalledTimes(1);
  expect(store.write).toHaveBeenCalledWith('synthetic-user');
  expect(alert).toHaveBeenCalledWith('아이디 저장 안내', expect.stringContaining('로그인은 완료'));
  expect(auth.session.snapshot().authenticated).toBe(true);
  expect(isMyPage(tree)).toBe(true);
  expect(text(tree)).not.toContain('storage unavailable');
});

test('로그인 실패 시 아이디를 저장하지 않고 입력과 오류를 로그인 화면에 유지한다', async () => {
  const {tree, store, login, auth} = await mount();
  login.mockRejectedValueOnce(new Error('로그인 검증 실패'));
  await fill(tree);
  await remember(tree);
  await submit(tree);
  expect(login).toHaveBeenCalledTimes(1);
  expect(store.write).not.toHaveBeenCalled();
  expect(auth.session.snapshot().authenticated).toBe(false);
  expect(isMyPage(tree)).toBe(false);
  expect(field(tree, '아이디').props.value).toBe('synthetic-user');
  expect(text(tree)).toContain('로그인 검증 실패');
});
