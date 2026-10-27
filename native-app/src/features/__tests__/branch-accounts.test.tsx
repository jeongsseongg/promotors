import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {AppContext, NativeServices, Route} from '../../components/AppContext';
import {Button, Choice, Field, MenuRow} from '../../components/Controls';
import {createQaEnvironment} from '../../qa/fixture-services';
import type {Role} from '../../domain/types';
import {ManagementScreen} from '../management/ManagementScreen';
import {AuthScreen} from '../auth/AuthScreen';
import {ApiError} from '../../api/errors';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const ANSAN = '프로모터스 안산점', trees: ReactTestRenderer[] = [];
const record = {id: 'branch-ansan', loginId: 'branch-ansan', label: '안산점 관리자', branches: [ANSAN],
  active: true, loginMode: 'id_password', createdAt: '2001-01-01T00:00:00Z'};
function words(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).filter(value => typeof value === 'string' || typeof value === 'number').join('')).join(' ');
}
async function mount(role: Role = 'main', options: {section?: 'accounts'; auth?: boolean; unavailable?: boolean} = {}) {
  const env = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa'), rows: typeof record[] = [];
  const list = jest.fn(async () => {if (options.unavailable) throw new ApiError('SERVER_ERROR', {status: 404}); return rows;});
  const create = jest.fn(async () => {rows.push(record); return record;});
  const loginAdmin = jest.fn(async () => {}), loginBranchAdmin = jest.fn(async () => {}), go = jest.fn((_route: Route) => {});
  const state = {...env.services.session.snapshot(), role};
  const services = {...env.services, session: {...env.services.session, snapshot: () => state, loginAdmin, loginBranchAdmin},
    branchAdminAccounts: {list, create}} as unknown as NativeServices;
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<AppContext services={services} push={env.push} navigation={{go, back: jest.fn()}}>
    {options.auth ? <AuthScreen/> : <ManagementScreen section={options.section}/>}</AppContext>);});
  trees.push(tree); return {tree, create, list, loginAdmin, loginBranchAdmin, go};
}
async function input(tree: ReactTestRenderer, label: string, value: string) {
  await act(async () => {tree.root.findAllByType(Field).find(node => node.props.label === label)!.props.onChangeText(value);});
}
async function button(tree: ReactTestRenderer, label: string) {
  await act(async () => {await tree.root.findAllByType(Button).find(node => node.props.label === label)!.props.onPress();});
}
async function choice(tree: ReactTestRenderer, label: string) {
  await act(async () => {tree.root.findAllByType(Choice).find(node => node.props.label === label)!.props.onPress();});
}
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());}); jest.restoreAllMocks();});

test('업체 계정 메뉴와 직접 접근은 통합관리자에게만 허용한다', async () => {
  const main = await mount();
  const row = main.tree.root.findAllByType(MenuRow).find(node => node.props.title === '업체 계정 관리');
  expect(row).toBeDefined();
  await act(async () => {row!.props.onPress();});
  expect(main.go).toHaveBeenCalledWith({name: 'management', section: 'accounts'});
  for (const role of ['general', 'developer', 'customer'] as Role[]) {
    const menu = await mount(role);
    expect(menu.tree.root.findAllByType(MenuRow).some(node => node.props.title === '업체 계정 관리')).toBe(false);
    const direct = await mount(role, {section: 'accounts'});
    expect(direct.list).not.toHaveBeenCalled(); expect(direct.create).not.toHaveBeenCalled();
    expect(direct.tree.root.findAllByType(Field)).toHaveLength(0);
  }
});

test('업체 생성은 지점 선택을 요구하며 성공 후 비밀번호를 지우고 알림 연결 조건을 알린다', async () => {
  const {tree, create} = await mount('main', {section: 'accounts'});
  await input(tree, '업체 이름', record.label); await input(tree, '업체 아이디', record.loginId);
  await input(tree, '업체 비밀번호', 'SyntheticPass12'); await button(tree, '업체 계정 생성');
  expect(create).not.toHaveBeenCalled(); expect(words(tree)).toContain('담당 지점을 한 곳 이상 선택해 주세요.');
  await choice(tree, ANSAN); await button(tree, '업체 계정 생성');
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith({loginId: record.loginId, label: record.label, password: 'SyntheticPass12', branches: [ANSAN]});
  expect(tree.root.findAllByType(Field).find(node => node.props.label === '업체 비밀번호')!.props.value).toBe('');
  expect(words(tree)).not.toContain('SyntheticPass12'); expect(words(tree)).toContain('아이디 · branch-ansan');
  expect(words(tree)).toContain('이 계정으로 앱에 로그인하고 알림을 허용하면 담당 지점 알림이 자동 연결됩니다.');
});

test('업체 계정 서버 기능이 없으면 기술 오류 대신 한국어 안내를 보여준다', async () => {
  const {tree} = await mount('main', {section: 'accounts', unavailable: true});
  expect(words(tree)).toContain('업체 계정 관리가 아직 준비되지 않았어요.');
  expect(tree.root.findAllByType(Field)).toHaveLength(0);
});

test('기존 관리자 비밀번호 로그인은 아이디 입력 없이 유지한다', async () => {
  const {tree, loginAdmin, loginBranchAdmin} = await mount('main', {auth: true});
  await choice(tree, '관리자 로그인');
  expect(tree.root.findAllByType(Field).some(node => node.props.label === '아이디' || node.props.label === '업체 아이디')).toBe(false);
  await input(tree, '관리자 비밀번호', 'SyntheticPass12'); await button(tree, '로그인');
  expect(loginAdmin).toHaveBeenCalledWith('SyntheticPass12', true); expect(loginBranchAdmin).not.toHaveBeenCalled();
});

test('업체 아이디 로그인은 명시 선택 후 아이디와 비밀번호를 새 인증 경로로 전달한다', async () => {
  const {tree, loginAdmin, loginBranchAdmin} = await mount('main', {auth: true});
  await choice(tree, '관리자 로그인');
  const toggle = tree.root.findAll(node => node.props.accessibilityLabel === '업체 아이디로 로그인' && typeof node.props.onPress === 'function')[0];
  await act(async () => {toggle!.props.onPress();});
  await input(tree, '업체 아이디', record.loginId); await input(tree, '관리자 비밀번호', 'SyntheticPass12');
  await button(tree, '로그인');
  expect(loginBranchAdmin).toHaveBeenCalledWith(record.loginId, 'SyntheticPass12', true); expect(loginAdmin).not.toHaveBeenCalled();
});


test('업체 계정 QA는 통합관리자 예시만 보여주고 비밀번호 저장이나 운영 요청 없이 생성한다', async () => {
  const env = createQaEnvironment({screen: 'branch-accounts'}, 'data:image/png;base64,qa');
  const originalFetch = globalThis.fetch, network = jest.fn(async () => {throw new Error('운영 네트워크 호출 금지');});
  globalThis.fetch = network;
  try {
    expect(env.services.session.snapshot().role).toBe('main');
    expect(env.initialRoute).toEqual({name: 'management', section: 'accounts'});
    let tree!: ReactTestRenderer;
    await act(async () => {tree = TestRenderer.create(<AppContext services={env.services} push={env.push} navigation={{go: jest.fn(), back: jest.fn()}}>
      <ManagementScreen section="accounts"/></AppContext>);});
    trees.push(tree);
    expect(words(tree)).toContain('등록된 업체 계정 2개'); expect(words(tree)).toContain('기존 비밀번호 로그인');
    expect(words(tree)).not.toContain('qa-internal-legacy');
    await input(tree, '업체 이름', '부천점 예시 관리자'); await input(tree, '업체 아이디', 'qa-created-company');
    await input(tree, '업체 비밀번호', 'SyntheticQaPass12'); await choice(tree, ANSAN); await button(tree, '업체 계정 생성');
    expect(words(tree)).toContain('등록된 업체 계정 3개');
    const records = await env.services.branchAdminAccounts.list();
    expect(JSON.stringify(records)).not.toContain('SyntheticQaPass12');
    expect(records.some(row => Object.keys(row).some(key => /^(password|password_hash|token)$/i.test(key)))).toBe(false);
    expect(env.calls).toContain('branch-account:create'); expect(env.calls.join(' ')).not.toContain('SyntheticQaPass12');
    expect(network).not.toHaveBeenCalled();
  } finally {globalThis.fetch = originalFetch;}
});
