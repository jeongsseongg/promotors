import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav} from '../../components/AppContext';
import {color, font} from '../../theme/tokens';

export function ReserveEntry({onGuest}: {onGuest(): void}) {
  const nav = useNav();
  return <Screen title="정비예약" plain onBack={nav.back} contentStyle={styles.content}>
    <Text style={styles.title}>정비예약</Text><Text style={styles.heading}>프로모터스에서 내 차를 더 편리하게</Text>
    <Text style={styles.body}>회원가입 후 내 차량을 등록하면{ '\n\n' }예약 내역 · 정비 현황 · 작업 사진을{ '\n' }한곳에서 편리하게 확인할 수 있습니다.{ '\n\n' }회원 전용 쿠폰과 이벤트 혜택도{ '\n' }함께 이용해 보세요.</Text>
    <View style={styles.actions}><View style={styles.flex}><Button brand label="로그인" onPress={() => nav.go({name: 'login'})}/></View>
      <View style={styles.flex}><Button brand secondary label="회원가입" onPress={() => nav.go({name: 'signup'})}/></View>
      <View style={styles.flex}><Button brand secondary label="비회원 예약" onPress={onGuest}/></View></View>
    <Button brand label="전화예약 · 지점 선택" onPress={() => nav.go({name: 'branches'})}/>
    <Button brand secondary label="예약 확인하기" onPress={() => nav.go({name: 'guest-lookup'})}/>
  </Screen>;
}
const styles = StyleSheet.create({
  content: {padding: 16, gap: 18}, title: {fontFamily: font.bold, fontSize: 40, lineHeight: 50, color: color.navy, letterSpacing: -1},
  heading: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.navy},
  body: {fontFamily: font.regular, fontSize: 15, lineHeight: 26, color: color.muted}, actions: {flexDirection: 'row', gap: 8}, flex: {flex: 1},
});
