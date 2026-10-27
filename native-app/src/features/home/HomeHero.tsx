import React, {useState} from 'react';
import {Image, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useNav} from '../../components/AppContext';
import {color, font} from '../../theme/tokens';
import {Button} from '../../components/Controls';

export function HomeHero({viewportHeight}: {viewportHeight: number}) {
  const nav = useNav(), window = useWindowDimensions();
  const [body, setBody] = useState<{width: number; height: number | null}>({width: Math.max(1, window.width - 40), height: null});
  const logoWidth = Math.min(350, body.width);
  const spacingHeight = 186, frameHeight = 84;
  const estimated = Math.min(350, body.width) * 542 / 1202 + body.width * 535 / 1632 + 8 + 105.25 * window.fontScale + Math.max(64, 28 * window.fontScale + 36);
  const bodyHeight = body.height ?? estimated;
  const spacing = Math.min(1, Math.max(0, (viewportHeight - bodyHeight - frameHeight) / spacingHeight));
  const height = Math.max(viewportHeight, bodyHeight + spacing * spacingHeight + frameHeight);
  return <View style={[styles.hero, {height}]}>
    <View onLayout={event => {
      const measured = {width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height - spacing * spacingHeight};
      setBody(current => Math.abs(current.width - measured.width) > 0.5 || current.height === null || Math.abs(current.height - measured.height) > 0.5 ? measured : current);
    }}>
      <Image source={require('../../../assets/logo-lockup.png')} accessibilityLabel="프로모터스 PRO MOTORS 수입차 정비 전문" style={[styles.logo, {width: logoWidth, height: logoWidth * 542 / 1202}]} resizeMode="contain"/>
      <View style={[styles.yellowLine, {marginTop: 18 * spacing}]}/>
      <Text accessibilityRole="header" style={[styles.title, {marginTop: 38 * spacing}]}>정비예약</Text>
      <Text style={[styles.description, {marginTop: 34 * spacing}]}>사진으로 확인하고, 기록으로 관리하세요.{ '\n' }소중한 내 차를 위한 맞춤형 프리미엄 케어 서비스.</Text>
      <View style={[styles.reserve, {marginTop: 34 * spacing}]}>
        <View pointerEvents="none" accessible={false} style={styles.reserveShadow}/>
        <Button hero label="정비 예약" testID="home-reserve" onPress={() => nav.go({name: 'reserve'})}>
          <Text style={styles.reserveText}>예약하기</Text><Text style={styles.arrow}>›</Text>
        </Button>
      </View>
      <Image source={require('../../../assets/brands-color.png')} accessibilityLabel="취급 수입차 브랜드" resizeMode="contain" style={[styles.brands, {marginTop: 44 * spacing, marginBottom: 18 * spacing}]}/>
    </View>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.scrollSpace}>
      <View style={styles.scroll}/>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  hero: {paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, backgroundColor: color.surface, backgroundImage: 'linear-gradient(115deg, #FFFFFF 0%, #F3F4F6 30%, #FFFFFF 55%, #E9EBEF 80%, #FFFFFF 100%)'},
  logo: {alignSelf: 'flex-start'},
  yellowLine: {width: 68, height: 8, borderRadius: 3, backgroundColor: color.yellow},
  title: {fontFamily: font.black, fontSize: 71, lineHeight: 67.45, letterSpacing: -1, includeFontPadding: false, color: color.navy, textShadowColor: 'rgba(30,36,100,0.18)', textShadowOffset: {width: 3, height: 4}, textShadowRadius: 6},
  description: {maxWidth: 350, fontFamily: font.medium, fontSize: 14, lineHeight: 18.9, color: '#2B2F33'},
  reserve: {boxShadow: '0 12px 24px rgba(30,36,100,0.3)', borderRadius: 12},
  reserveShadow: {position: 'absolute', top: 6, bottom: -6, left: 0, right: 0, borderRadius: 12, backgroundColor: color.yellow},
  reserveText: {fontFamily: font.bold, fontSize: 24, lineHeight: 28, includeFontPadding: false, color: color.yellow},
  arrow: {position: 'absolute', right: 24, fontFamily: font.bold, fontSize: 30, color: color.yellow},
  brands: {width: '100%', height: undefined, aspectRatio: 1632 / 535},
  scrollSpace: {flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end'},
  scroll: {width: 18, height: 18, marginBottom: 6, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: 'rgba(30,36,100,0.7)', transform: [{rotate: '45deg'}]},
});
