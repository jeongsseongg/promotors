import React from 'react';
import {Switch} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {Field, MenuRow, Button} from '../../components/Controls';
import {Screen} from '../../components/Screen';
import {TabBar} from '../../components/Navigation';
import {NativeServices} from '../../components/AppContext';
import {createQaEnvironment} from '../../qa/fixture-services';
import {createQaSession} from '../../qa/fixture-session';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
const values = [['아이디', 'signup-example'], ['비밀번호', 'Example12345!'], ['비밀번호 확인', 'Example12345!'],
  ['이름', '예시 가입자'], ['차량명', '예시 차량'], ['차량번호', '12가3456'], ['휴대폰번호', '01000000000'],
  ['생일', '1990-01-01'], ['이메일 (선택)', 'example@example.invalid'], ['주소 (선택)', '예시 주소']];

async function mount() {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa'), auth = createQaSession(false, true);
  const services = {...environment.services, session: auth.session} as unknown as NativeServices;
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={services} push={environment.push} initialRoute={{name: 'signup'}}/>);});
  trees.push(tree); return {tree, auth};
}
function fields(tree: ReactTestRenderer) {return tree.root.findAllByType(Field);}
async function fill(tree: ReactTestRenderer) {
  for (const [label, value] of values) await act(async () => {fields(tree).find(row => row.props.label === label)!.props.onChangeText(value);});
  await act(async () => {tree.root.findAllByType(Switch).find(row => row.props.accessibilityLabel === '필수 이용 안내 동의')!.props.onValueChange(true);});
}
async function menu(tree: ReactTestRenderer, title: string) {
  await act(async () => {tree.root.findAllByType(MenuRow).find(row => row.props.title === title)!.props.onPress();});
}
async function back(tree: ReactTestRenderer, title: string) {
  await act(async () => {tree.root.findAllByType(Screen).find(row => row.props.title === title)!.props.onBack();});
}
function assertBlank(tree: ReactTestRenderer) {
  for (const [label] of values) expect(fields(tree).find(row => row.props.label === label)?.props.value).toBe('');
  expect(tree.root.findAllByType(Switch).find(row => row.props.accessibilityLabel === '필수 이용 안내 동의')?.props.value).toBe(false);
}
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());});});

test.each(['이용약관', '개인정보 처리방침'])('회원가입 입력과 동의를 보존하고 %s을 읽은 뒤 복귀한다', async title => {
  const {tree} = await mount(); await fill(tree);
  await menu(tree, title); await back(tree, title);
  for (const [label, value] of values) expect(fields(tree).find(row => row.props.label === label)?.props.value).toBe(value);
  expect(tree.root.findAllByType(Switch).find(row => row.props.accessibilityLabel === '필수 이용 안내 동의')?.props.value).toBe(true);
});

test('가입 화면을 완전히 떠났다가 다시 열면 민감 입력이 남지 않는다', async () => {
  const {tree} = await mount(); await fill(tree); await back(tree, '회원가입');
  await act(async () => {tree.root.findByType(TabBar).props.onChange('my');});
  await act(async () => {tree.root.findAllByType(Button).find(row => row.props.label === '회원가입')!.props.onPress();});
  assertBlank(tree);
});

test('개인정보 화면에서 다른 기능으로 떠났다가 복귀해도 가입 입력은 폐기된다', async () => {
  const {tree} = await mount(); await fill(tree); await menu(tree, '개인정보 처리방침');
  await act(async () => {tree.root.findAllByType(Button).find(row => row.props.label === '탈퇴·삭제 요청')!.props.onPress();});
  await back(tree, '회원 탈퇴'); await back(tree, '개인정보 처리방침');
  assertBlank(tree);
});

test('약관을 보는 동안 로그인·로그아웃하거나 계정이 바뀌면 이전 가입 입력을 지운다', async () => {
  const {tree, auth} = await mount(); await fill(tree); await menu(tree, '이용약관');
  await act(async () => {await auth.session.loginMember('qa-other', 'not-a-real-password');});
  await act(async () => {auth.update({profile: {id: 'qa-second', name: '다른 예시 계정'}});});
  await act(async () => {await auth.session.logout();});
  await back(tree, '이용약관'); assertBlank(tree);
});
