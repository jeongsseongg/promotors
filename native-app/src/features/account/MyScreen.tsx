import React, {useCallback} from 'react';
import {Alert, Image, StyleSheet, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {ui} from '../../theme/styles';
import {color, font} from '../../theme/tokens';
import {runName, runStage} from './runDisplay';

export function MyScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const account = useResource(useCallback(() => session.authenticated && session.role === 'customer' ? services.account.load() : Promise.resolve(null), [services, session.authenticated, session.role]));
  useForegroundRefresh(account.reload, 30000);
  async function logout() {
    try {await services.session.logout(); nav.go({name: 'home'});}
    catch (e) {Alert.alert('로그아웃을 완료하지 못했어요', e instanceof Error ? e.message : '다시 시도해 주세요.');}
  }
  if (!session.authenticated) return <Screen title="마이페이지" testID="my-signed-out"><View style={ui.card}>
    <Image source={require('../../../assets/logo-icon.png')} style={styles.icon}/><Text style={ui.title}>내 차 정비를{ '\n' }한눈에 확인하세요.</Text>
    <Text style={ui.body}>로그인하면 예약과 작업사진,{ '\n' }정비 이력을 확인할 수 있어요.</Text><Button label="로그인" onPress={() => nav.go({name: 'login'})}/>
    <Button secondary label="회원가입" onPress={() => nav.go({name: 'signup'})}/><MenuRow title="비회원 예약 조회" onPress={() => nav.go({name: 'guest-lookup'})}/><MenuRow title="탈퇴 처리 상태" onPress={() => nav.go({name: 'deletion'})}/></View></Screen>;
  const profile = account.data?.profile || session.profile;
  const run = account.data?.runs.find(row => runStage(row) < 4) || account.data?.runs[0];
  const next = account.data?.bookings.filter(row => !['취소', '거절', '완료'].includes(row.status) && row.date >= [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('.')).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const stage = run ? runStage(run) : next ? 0 : -1;
  const labels = ['접수', '진단', '작업', '검수', '출고'];
  return <Screen title="마이페이지" refreshing={account.loading} onRefresh={account.reload} testID="my-screen">
    <Text style={ui.title}>{profile?.name || (session.role === 'customer' ? '고객' : '관리자')}님,{ '\n' }안녕하세요.</Text>
    {session.role !== 'customer' ? <View style={ui.card}><Text style={ui.heading}>매장 운영</Text><Text style={ui.muted}>{session.branches.length ? session.branches.join(' · ') : '전체 지점'}</Text>
      <Button label="예약 관리" onPress={() => nav.go({name: 'admin'})}/><MenuRow title="매장 관리" detail="작업·고객·콘텐츠·운영 설정" onPress={() => nav.go({name: 'management'})}/><MenuRow title="예약 알림함" onPress={() => nav.go({name: 'notifications'})}/></View> : <>
      <DataState loading={account.loading && !account.data} error={account.error} onRetry={account.reload}/>
      <View style={styles.vehicle}><View style={ui.spread}><Text style={styles.plate}>{profile?.car || '등록된 차량'}</Text><Text style={styles.badge}>{stage < 0 ? '예약 전' : labels[stage]}</Text></View>
        <Text style={styles.model}>{profile?.model || '차량정보를 확인해 주세요.'}</Text>
        <Text style={styles.vehicleText}>{run ? runName(run) : next ? next.branch + ' 방문 예정' : '필요할 때 간편하게 예약하세요.'}</Text>
        <View style={styles.track}><View style={[styles.progress, {width: (stage < 0 ? 0 : (stage + 1) * 20) + '%' as `${number}%`}]}/></View>
        <View style={ui.spread}>{labels.map((label, i) => <Text key={label} style={[styles.step, i === stage && styles.currentStep]}>{label}</Text>)}</View>
      </View>
      <View style={ui.card}><MenuRow title={next ? '다음 예약' : '정비 예약'} detail={next ? next.date + ' ' + next.time + ' · ' + next.branch : '방문 일정을 선택해 주세요.'} onPress={() => nav.go(next ? {name: 'booking', id: next.id} : {name: 'reserve'})}/></View>
      <View style={ui.card}><Text style={ui.heading}>내 차</Text><MenuRow title="내 차 관리" detail={profile?.model} onPress={() => nav.go({name: 'profile'})}/>
        <MenuRow title="정비 이력" onPress={() => nav.go({name: 'history'})}/><MenuRow title="작업사진·현황" onPress={() => nav.go({name: 'work'})}/></View>
      <View style={ui.card}><Text style={ui.heading}>예약과 혜택</Text><MenuRow title="예약 내역" onPress={() => nav.go({name: 'bookings'})}/>
        <MenuRow title="정비 예약하기" onPress={() => nav.go({name: 'reserve'})}/><MenuRow title="내 쿠폰" onPress={() => nav.go({name: 'coupons'})}/>
        <MenuRow title="이벤트" onPress={() => nav.go({name: 'events'})}/><MenuRow title="공업사의 TIP · 문의" onPress={() => nav.go({name: 'inquiry'})}/></View>
    </>}
    <View style={ui.card}><Text style={ui.heading}>설정</Text><MenuRow title="알림" onPress={() => nav.go({name: 'notifications'})}/>
      <MenuRow title="앱 알림 설정" onPress={() => nav.go({name: 'notification-settings'})}/><MenuRow title="개인정보 처리방침" onPress={() => nav.go({name: 'privacy'})}/>
      <MenuRow title="이용약관" onPress={() => nav.go({name: 'terms'})}/><MenuRow title="로그아웃" onPress={() => {Alert.alert('로그아웃', '이 기기의 로그인과 계정 알림 연결을 해제합니다.', [{text: '취소', style: 'cancel'}, {text: '로그아웃', onPress: () => void logout()}]);}}/></View>
  </Screen>;
}
const styles = StyleSheet.create({
  icon: {width: 80, height: 80, borderRadius: 20}, vehicle: {backgroundColor: color.navy, padding: 24, borderRadius: 24, gap: 16},
  plate: {color: color.surface, fontFamily: font.medium, fontSize: 15}, badge: {backgroundColor: color.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, color: color.navy, fontFamily: font.bold, fontSize: 13},
  model: {color: color.surface, fontFamily: font.bold, fontSize: 26, lineHeight: 34}, vehicleText: {color: '#D6DEED', fontFamily: font.regular, fontSize: 16, lineHeight: 24},
  track: {height: 6, backgroundColor: '#304678', borderRadius: 3}, progress: {height: 6, backgroundColor: color.yellow, borderRadius: 3},
  step: {fontFamily: font.medium, fontSize: 13, color: '#D6DEED'}, currentStep: {color: color.yellow},
});
