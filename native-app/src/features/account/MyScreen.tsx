import React, {useCallback} from 'react';
import {Alert, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {ui} from '../../theme/styles';
import {runName, runStage} from './runDisplay';
import {myPage as styles} from './myPageStyles';
import {MyVehicleCard} from './MyVehicleCard';
import {MyAccountMenu, MyCustomerMenus} from './MyMenuSection';
import {AuthScreen} from '../auth/AuthScreen';

export function MyScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
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
  return <Screen title="마이페이지" contentStyle={styles.content} refreshing={account.loading} onRefresh={account.reload} testID="my-screen">
    <View style={styles.greeting}><Text style={styles.hello}>{profile?.name || (session.role === 'customer' ? '고객' : '관리자')}님, 안녕하세요</Text>
      <Text style={styles.subtitle}>{session.role !== 'customer' ? '매장 운영현황을 확인해보세요.' : stage >= 0 ? '내 차 정비 진행상황을 확인해보세요.' : '정비가 필요할 때 간편하게 예약해보세요.'}</Text></View>
    {session.role !== 'customer' ? <View style={ui.card}><Text style={ui.heading}>매장 운영</Text><Text style={ui.muted}>{session.branches.length ? session.branches.join(' · ') : '전체 지점'}</Text>
      <Button label="예약 관리" onPress={() => nav.go({name: 'admin'})}/><MenuRow title="매장 관리" detail="작업·고객·콘텐츠·운영 설정" onPress={() => nav.go({name: 'management'})}/><MenuRow title="예약 알림함" onPress={() => nav.go({name: 'notifications'})}/></View> : <>
      <DataState loading={account.loading && !account.data} error={account.error} onRetry={account.reload}/>
      <MyVehicleCard profile={profile} stage={stage} service={service} branch={run?.branch || next?.branch || '예약 지점을 선택해주세요'}
        status={run ? stage === 4 ? '정비가 완료되었어요' : service + ' 진행 중이에요' : next ? '예약이 접수되었어요' : '진행 중인 예약이 없어요'} next={next}/>
      <MyCustomerMenus model={profile?.model}/>
    </>}
    <MyAccountMenu onLogout={() => Alert.alert('로그아웃', '이 기기의 로그인과 계정 알림 연결을 해제합니다.', [{text: '취소', style: 'cancel'}, {text: '로그아웃', onPress: () => void logout()}])}/>
  </Screen>;
}
