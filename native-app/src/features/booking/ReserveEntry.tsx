import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav} from '../../components/AppContext';
import {bookingEntryStyles as styles} from './bookingEntryStyles';

export function BookingHeader({title, onClose, hero = false}: {title: string; onClose(): void; hero?: boolean}) {
  return <View style={styles.header}><Text accessibilityRole="header" style={hero ? styles.heroTitle : styles.title}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>;
}
export function ReserveEntry({onGuest}: {onGuest(): void}) {
  const nav = useNav();
  return <Screen title="정비예약" plain hideHeader onBack={nav.back} contentStyle={styles.content}>
    <BookingHeader title="정비예약" onClose={nav.back} hero/>
    <View style={styles.intro}><Text style={styles.heading}>프로모터스에서 내 차를 더 편리하게</Text>
      <Text style={styles.body}>회원가입 후 내 차량을 등록하면</Text>
      <Text style={styles.body}>예약 내역 · 정비 현황 · 작업 사진을{ '\n' }한곳에서 편리하게 확인할 수 있습니다.</Text>
      <Text style={styles.body}>회원 전용 쿠폰과 이벤트 혜택도{ '\n' }함께 이용해 보세요.</Text></View>
    <View style={styles.actions}><View style={styles.flex}><Button brand label="로그인" onPress={() => nav.go({name: 'login'})}/></View>
      <View style={styles.flex}><Button brand secondary label="회원가입" onPress={() => nav.go({name: 'signup'})}/></View>
      <View style={styles.flex}><Button brand secondary label="비회원 예약" onPress={onGuest}/></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="전화예약 · 지점 선택" onPress={() => nav.go({name: 'branches'})} style={styles.phone}>
      <Text style={styles.phoneIcon} accessible={false}>☎</Text><View style={styles.flex}><Text style={styles.phoneTitle}>전화예약</Text>
        <Text style={styles.phoneHint}>지점 안내 및 전화 연결</Text></View><Text accessible={false} style={styles.chevron}>›</Text></Pressable>
  </Screen>;
}
