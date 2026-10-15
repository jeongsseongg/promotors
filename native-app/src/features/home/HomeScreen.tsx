import React, {useCallback} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {ui} from '../../theme/styles';
import {color, font} from '../../theme/tokens';

export function HomeScreen() {
  const services = useServices(), nav = useNav();
  const content = useResource(useCallback(() => services.publicContent.load(), [services]));
  const first = content.data?.introSlides[0];
  return <Screen title="프로모터스" refreshing={content.loading} onRefresh={content.reload} testID="home-screen">
    <View style={styles.brand}><Image source={require('../../../assets/logo-lockup.png')} style={styles.logo} resizeMode="contain"/></View>
    <View style={styles.hero}><Text style={styles.eyebrow}>수입차 정비 전문</Text>
      <Text style={styles.heroTitle}>사진으로 확인하고,{ '\n' }기록으로 관리하세요.</Text>
      <Text style={styles.heroBody}>내 차를 위한 정비 예약부터{ '\n' }작업 과정과 정비 이력까지.</Text>
      <Button label="정비 예약" onPress={() => nav.go({name: 'reserve'})} testID="home-reserve"/>
    </View>
    <DataState loading={content.loading && !content.data} error={content.error} onRetry={content.reload}/>
    {first?.key ? <AssetImage assetKey={first.key} label="프로모터스 소개"/> : null}
    <View style={ui.card}><Text style={ui.heading}>내 차 관리가 편해지는 순간</Text>
      <MenuRow title="간편한 예약" detail="지점과 방문 일정을 선택하세요." onPress={() => nav.go({name: 'reserve'})}/>
      <MenuRow title="눈으로 확인하는 정비 과정" detail="승인된 작업사진과 진행 단계를 확인하세요." onPress={() => nav.go({name: 'work'})}/>
      <MenuRow title="차곡차곡 쌓이는 정비 이력" detail="내 차의 정비 기록을 한곳에서 관리하세요." onPress={() => nav.go({name: 'history'})}/>
    </View>
    <View style={ui.card}><MenuRow title="매장안내" detail="지점 위치와 전화번호" onPress={() => nav.go({name: 'branches'})}/>
      <MenuRow title="공지사항" onPress={() => nav.go({name: 'notices'})}/></View>
  </Screen>;
}
const styles = StyleSheet.create({
  brand: {paddingVertical: 8}, logo: {width: '80%', maxWidth: 300, height: 94},
  hero: {backgroundColor: color.navy, padding: 24, borderRadius: 24, gap: 20},
  eyebrow: {fontFamily: font.semibold, fontSize: 15, color: color.yellow},
  heroTitle: {fontFamily: font.bold, fontSize: 29, lineHeight: 39, color: color.surface},
  heroBody: {fontFamily: font.regular, fontSize: 16, lineHeight: 25, color: '#D6DEED'},
});
