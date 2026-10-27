import React, {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useNav, useServices} from '../../components/AppContext';
import {Button, Choice, Field} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {Screen} from '../../components/Screen';
import {ApiError} from '../../api/errors';
import {ui} from '../../theme/styles';
import {branchAccountStyles as styles} from './branchAccountStyles';

function accountError(failure: unknown) {
  if (failure instanceof ApiError && failure.status === 404) return '업체 계정 관리가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.';
  return failure instanceof Error ? failure.message : '업체 계정을 저장하지 못했어요. 다시 시도해 주세요.';
}
export function BranchAccountsManager() {
  const services = useServices(), nav = useNav(), state = services.session.snapshot();
  if (!state.authenticated || state.role !== 'main') return <Screen title="업체 계정 관리" onBack={nav.back}>
    <Text accessibilityRole="alert" style={ui.body}>통합관리자만 업체 계정을 생성하고 확인할 수 있어요.</Text></Screen>;
  return <BranchAccountsWorkspace/>;
}
function BranchAccountsWorkspace() {
  const services = useServices(), nav = useNav();
  const resource = useResource(useCallback(async () => {
    try {
      const [accounts, content] = await Promise.all([services.branchAdminAccounts.list(), services.publicContent.load()]);
      return {accounts, branches: content.branches.map(row => row.name).filter(Boolean)};
    } catch (failure) {throw new Error(accountError(failure));}
  }, [services]));
  return <Screen title="업체 계정 관리" onBack={nav.back}>
    <View style={styles.hero}><Text style={styles.eyebrow}>통합관리자 전용</Text><Text style={styles.title}>업체별 계정을 한곳에서</Text>
      <Text style={styles.description}>로그인 아이디와 담당 지점을 지정해 주세요. 업체 관리자는 지정한 지점의 예약과 정비만 관리할 수 있어요.</Text></View>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {resource.data ? <><AccountCreateForm branches={resource.data.branches} onSaved={resource.reload}/>
      <View style={styles.list}><Text style={styles.heading}>등록된 업체 계정 {resource.data.accounts.length}개</Text>
        {!resource.data.accounts.length ? <Text style={styles.note}>등록된 업체 계정이 없습니다.</Text> : null}
        {resource.data.accounts.map(account => <View key={account.id} style={styles.account}>
          <View style={styles.row}><Text style={styles.label}>{account.label}</Text><Text style={styles.badge}>{account.active ? '사용 중' : '사용 중지'}</Text></View>
          <Text style={styles.loginId}>{account.loginId ? `아이디 · ${account.loginId}` : '기존 비밀번호 로그인'}</Text>
          <Text style={styles.note}>{account.branches.length ? account.branches.join(' · ') : '담당 지점 미지정 · 지점 알림을 받을 수 없어요.'}</Text>
        </View>)}</View></> : null}
  </Screen>;
}
function formError(loginId: string, label: string, password: string, branches: string[]) {
  if (!/^[A-Za-z0-9._-]{4,40}$/.test(loginId)) return '아이디는 영문·숫자·점·밑줄·하이픈으로 4~40자 입력해 주세요.';
  if (!label || label.length > 60) return '업체 이름을 1~60자로 입력해 주세요.';
  if (password.length < 10 || password.length > 72 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.';
  return branches.length ? '' : '담당 지점을 한 곳 이상 선택해 주세요.';
}
function AccountCreateForm({branches, onSaved}: {branches: string[]; onSaved(): Promise<void>}) {
  const services = useServices(), saving = useRef(false);
  const [loginId, setLoginId] = useState(''), [label, setLabel] = useState(''), [password, setPassword] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [created, setCreated] = useState('');
  function toggle(branch: string) {setSelected(current => current.includes(branch) ? current.filter(value => value !== branch) : [...current, branch]);}
  async function create() {
    if (saving.current) return;
    const invalid = formError(loginId.trim(), label.trim(), password, selected); setError(invalid); setCreated('');
    if (invalid) return;
    saving.current = true; setBusy(true);
    try {
      const account = await services.branchAdminAccounts.create({loginId: loginId.trim(), label: label.trim(), password, branches: selected});
      setPassword(''); setLoginId(''); setLabel(''); setSelected([]); setCreated(account.label);
      await onSaved();
    } catch (failure) {setError(accountError(failure));}
    finally {saving.current = false; setBusy(false);}
  }
  return <View style={styles.card}><Text style={styles.heading}>업체 계정 만들기</Text>
    <Field label="업체 이름" value={label} onChangeText={setLabel} maxLength={60} testID="branch-account-label"/>
    <Field label="업체 아이디" value={loginId} onChangeText={setLoginId} autoCapitalize="none" autoCorrect={false} textContentType="username" maxLength={40} testID="branch-account-id"/>
    <Field label="업체 비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" testID="branch-account-password"/>
    <Text style={styles.note}>비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요. 생성 후에는 다시 표시되지 않아요.</Text>
    <View style={styles.choices}><Text style={ui.label}>담당 지점 · 필수 선택</Text>{branches.map(branch => <Choice key={branch} label={branch} selected={selected.includes(branch)} onPress={() => toggle(branch)}/>)}
      {!branches.length ? <Text style={styles.note}>선택할 지점을 불러오지 못했어요. 화면을 다시 불러와 주세요.</Text> : null}</View>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    <Button accent label="업체 계정 생성" busy={busy} onPress={() => void create()} testID="branch-account-create"/>
    {created ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeTitle}>{created} 계정을 만들었어요.</Text>
      <Text style={styles.note}>이 계정으로 앱에 로그인하고 알림을 허용하면 담당 지점 알림이 자동 연결됩니다.</Text></View> : null}
  </View>;
}
