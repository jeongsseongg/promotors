import React, {useCallback} from 'react';
import {Alert, useWindowDimensions} from 'react-native';
import {Screen} from '../../components/Screen';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {runName, runStage} from './runDisplay';
import {myPage as styles, myPageAtWidth} from './myPageStyles';
import {MyVehicleCard} from './MyVehicleCard';
import {MyAccountMenu, MyCustomerMenus, MyGreeting} from './MyMenuSection';
import {AuthScreen} from '../auth/AuthScreen';
import {AdminMyDashboard} from './AdminMyDashboard';

function serviceStatus(service: string, stage: number) {
  if (stage === 3) return `${service} 검수 중이에요`;
  const match = service.trim().match(/^(.+?)\s*(교체|교환|점검|정비|수리)$/);
  if (!match) return stage === 4 ? `${service} 작업을 완료했어요` : `지금 ${service} 작업을 하고있어요`;
  const target = match[1].trim(), code = target.charCodeAt(target.length - 1) - 0xAC00;
  const particle = code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
  return stage === 4 ? `${target} ${match[2]}를 완료했어요` : `지금 ${target}${particle} ${match[2]}하고있어요`;
}
export function MyScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const layout = myPageAtWidth(useWindowDimensions().width);
  const account = useResource(useCallback(() => session.authenticated && session.role === 'customer' ? services.account.load() : Promise.resolve(null), [services, session.authenticated, session.role]));
  useForegroundRefresh(account.reload, 30000);
  async function logout() {
    try {await services.session.logout(); nav.go({name: 'home'});}
    catch (e) {Alert.alert('로그아웃을 완료하지 못했어요', e instanceof Error ? e.message : '다시 시도해 주세요.');}
  }
  if (!session.authenticated) return <AuthScreen/>;
  const profile = account.data?.profile || session.profile;
  const run = account.data?.runs.find(row => runStage(row) < 4) || account.data?.runs[0];
  const next = account.data?.bookings.filter(row => !['취소', '거절', '완료'].includes(row.status) && row.date >= [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('.')).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const stage = run ? runStage(run) : next ? 0 : -1;
  const service = run ? runName(run) : next?.services?.[0] || '정비 내역 없음';
  return <Screen title="마이페이지" hideHeader backgroundColor="#F7F7F8" contentStyle={[styles.content, layout.content]} refreshing={session.role === 'customer' && account.loading}
    onRefresh={session.role === 'customer' ? account.reload : undefined} testID="my-screen">
    {session.role !== 'customer' ? <AdminMyDashboard/> : <>
      <MyGreeting title={`${profile?.name || '고객'}님, 안녕하세요`}
        subtitle={stage >= 0 ? '내 차 정비 진행상황을 확인해보세요.' : '정비가 필요할 때 간편하게 예약해보세요.'}/>
      <DataState loading={account.loading && !account.data} error={account.error} onRetry={account.reload}/>
      <MyVehicleCard profile={profile} stage={stage} service={service} branch={run?.branch || next?.branch || '예약 지점을 선택해주세요'}
        status={run ? serviceStatus(service, stage) : next ? '예약이 접수되었어요' : '진행 중인 예약이 없어요'} next={next}/>
      <MyCustomerMenus name={profile?.name} model={profile?.model} historyCount={account.data?.runs.length}
        bookingCount={account.data?.bookings.length} messageCount={account.data?.messages.filter(row => row.from === 'admin').length}
        noticeCount={account.data?.messages.filter(row => !!row.serviceContext && typeof row.serviceContext === 'object' && !!(row.serviceContext as {runId?: string}).runId).length}/>
    </>}
    <MyAccountMenu onLogout={() => Alert.alert('로그아웃', '이 기기의 로그인과 계정 알림 연결을 해제합니다.', [{text: '취소', style: 'cancel'}, {text: '로그아웃', onPress: () => void logout()}])}/>
  </Screen>;
}
