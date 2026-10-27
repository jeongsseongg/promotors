import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {useNav} from '../../components/AppContext';
import {color, font} from '../../theme/tokens';
import {Button} from '../../components/Controls';

export function HomeHero() {
  const nav = useNav();
  return <View style={styles.hero}>
    <Image source={require('../../../assets/logo-lockup.png')} accessibilityLabel="프로모터스 PRO MOTORS 수입차 정비 전문" style={styles.logo} resizeMode="contain"/>
    <View style={styles.yellowLine}/>
    <Text accessibilityRole="header" style={styles.title}>정비예약</Text>
    <Text style={styles.description}>사진으로 확인하고, 기록으로 관리하세요.{ '\n' }소중한 내 차를 위한 맞춤형 프리미엄 케어 서비스.</Text>
    <View style={styles.reserve}><Button hero label="정비 예약" testID="home-reserve" onPress={() => nav.go({name: 'reserve'})}>
      <Text style={styles.reserveText}>예약하기</Text><Text style={styles.arrow}>›</Text>
    </Button></View>
    <Image source={require('../../../assets/brands-color.png')} accessibilityLabel="취급 수입차 브랜드" resizeMode="contain" style={styles.brands}/>
    <Text accessibilityElementsHidden style={styles.scroll}>⌄</Text>
  </View>;
}
const styles = StyleSheet.create({
  hero: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, minHeight: 680, backgroundColor: color.surface, backgroundImage: 'linear-gradient(115deg, #FFFFFF 0%, #F3F4F6 30%, #FFFFFF 55%, #E9EBEF 80%, #FFFFFF 100%)'},
  logo: {width: '100%', height: undefined, aspectRatio: 1202 / 542},
  yellowLine: {width: 66, height: 8, borderRadius: 4, backgroundColor: color.yellow, marginTop: 10},
  title: {fontFamily: font.bold, fontSize: 68, lineHeight: 84, letterSpacing: -2, color: color.navy, marginTop: 28, textShadowColor: 'rgba(30,36,100,0.18)', textShadowOffset: {width: 3, height: 4}, textShadowRadius: 6},
  description: {fontFamily: font.medium, fontSize: 13, lineHeight: 20, color: '#2B2F33', marginTop: 20},
  reserve: {marginTop: 32, boxShadow: '0 12px 24px rgba(30,36,100,0.3)', borderRadius: 12},
  reserveText: {fontFamily: font.bold, fontSize: 23, color: color.yellow},
  arrow: {position: 'absolute', right: 24, fontFamily: font.bold, fontSize: 30, color: color.yellow},
  brands: {width: '100%', height: undefined, aspectRatio: 1632 / 535, marginTop: 44},
  scroll: {marginTop: 54, textAlign: 'center', fontSize: 30, color: '#C3C8D0'},
});
