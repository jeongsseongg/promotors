import React, {useCallback, useState} from 'react';
import {Alert, Switch, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {DeletionStatus} from '../../domain/types';
import {ui} from '../../theme/styles';

const headings: Record<DeletionStatus, string> = {none: '회원 탈퇴 안내', pending: '탈퇴 신청이 접수되었습니다', processing: '계정 삭제를 처리하고 있습니다', needs_review: '삭제 요청을 확인하고 있습니다', cancelled: '탈퇴 신청이 취소되었습니다', completed: '계정 삭제가 완료되었습니다'};
function date(value?: string) {return value ? new Date(value).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ' (한국 시간)' : '';}
export function DeletionScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const [password, setPassword] = useState(''), [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const resource = useResource(useCallback(() => session.authenticated ? services.deletion.state() : services.deletion.receipt(), [services, session.authenticated]));
  async function perform(cancel: boolean) {
    if (busy) return; setBusy(true); setError('');
    try {if (cancel) await services.deletion.cancel(); else await services.deletion.request(password); setPassword(''); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '요청을 완료하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }
  function request() {
    if (!password || !agreed) {setError('현재 비밀번호와 삭제 안내 동의를 확인해 주세요.'); return;}
    Alert.alert('탈퇴를 신청할까요?', '신청 72시간 후부터 불필요한 개인정보를 삭제합니다. 실제 삭제가 시작되기 전에는 언제든 취소할 수 있습니다.', [{text: '돌아가기', style: 'cancel'}, {text: '탈퇴 신청', style: 'destructive', onPress: () => void perform(false)}]);
  }
  const state = resource.data;
  return <Screen title="회원 탈퇴" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}>
    <DataState loading={resource.loading && !state} error={resource.error} onRetry={resource.reload}/>
    <View style={ui.card}><Text style={ui.heading}>정비 기록과 개인정보 처리</Text>
      <Text style={ui.body}>탈퇴 신청 72시간 후 계정·연락처·개인 작업사진 등 불필요한 개인정보를 삭제합니다. 실제 삭제가 시작되기 전에는 신청을 취소할 수 있습니다.</Text>
      <Text style={ui.body}>정비 이력은 개인 식별정보를 제거해 남깁니다. 법정 보관이 필요한 완료 정비기록은 최소 항목만 분리 보관하며, 보관 기간이 끝나면 파기합니다.</Text>
      <Text style={ui.muted}>진행 중인 정비, 소유권 확인이 필요한 자료, 명시적인 분쟁 자료는 추가 확인 후 처리합니다.</Text></View>
    {state ? <View style={ui.card}><Text style={ui.heading}>{headings[state.status]}</Text>
      {state.requestedAt ? <Text style={ui.body}>신청 시간: {date(state.requestedAt)}</Text> : null}
      {state.scheduledFor && state.status !== 'completed' ? <Text style={ui.body}>삭제 예정: {date(state.scheduledFor)}</Text> : null}
      {state.completedAt ? <Text style={ui.body}>삭제 완료: {date(state.completedAt)}</Text> : null}
      {state.status === 'completed' ? <Text style={ui.body}>삭제 대상 개인정보 처리가 완료되었습니다. 개인 식별정보를 제거한 정비 이력과 법정 보관 자료는 보관 기준을 따릅니다.</Text> : null}
      {state.status === 'needs_review' ? <Text style={ui.body}>추가 확인이 필요합니다. 완료로 표시되기 전까지는 삭제가 끝난 상태가 아닙니다.</Text> : null}
      {state.canCancel && session.authenticated ? <Button secondary label="탈퇴 신청 취소" busy={busy} onPress={() => Alert.alert('탈퇴 신청 취소', '신청을 취소하고 계정을 계속 사용하시겠어요?', [{text: '돌아가기', style: 'cancel'}, {text: '신청 취소', onPress: () => void perform(true)}])}/> : null}
    </View> : null}
    {session.authenticated && state && ['none', 'cancelled'].includes(state.status) ? <View style={ui.card}><Field label="현재 비밀번호" value={password} onChangeText={setPassword} secureTextEntry textContentType="password"/>
      <View style={ui.spread}><Text style={[ui.body, ui.flex]}>삭제 일정과 보관·취소 안내를 확인했습니다.</Text><Switch accessibilityLabel="탈퇴 처리 안내 확인" value={agreed} onValueChange={setAgreed}/></View>
      <Button label="회원 탈퇴 신청" danger busy={busy} disabled={!agreed || !password} onPress={request}/></View> : null}
    {!session.authenticated && state?.canCancel ? <Button label="로그인하여 취소" onPress={() => nav.go({name: 'login'})}/> : null}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    <Text style={ui.muted}>이 기기의 안전한 저장소에 보관된 조회 정보로 완료·취소 후 30일까지 처리 상태를 확인할 수 있습니다.</Text>
  </Screen>;
}
