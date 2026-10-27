import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useSafeAreaFrame, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Screen} from '../../components/Screen';
import {Button, Choice, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {ui} from '../../theme/styles';
import {color} from '../../theme/tokens';
import {HomeHero} from './HomeHero';
import {CaseCards} from '../cases/CaseCards';
import {tabBarHeight} from '../../components/Navigation';

export function HomeScreen() {
  const services = useServices(), nav = useNav();
  const frame = useSafeAreaFrame(), insets = useSafeAreaInsets(), window = useWindowDimensions();
  const viewportHeight = Math.max(0, frame.height - insets.top - insets.bottom - tabBarHeight(window.fontScale));
  const [branch, setBranch] = useState('프로모터스 안산점');
  const content = useResource(useCallback(() => services.publicContent.caseFeed(true), [services]));
  const posts = content.data?.cases.filter(row => row.branch === branch) || [];
  return <Screen title="프로모터스" hideHeader contentStyle={styles.content} refreshing={content.loading} onRefresh={content.reload} testID="home-screen">
    <HomeHero viewportHeight={viewportHeight}/>
    <View style={styles.details}>
    <Text style={ui.heading}>프로모터스의 작업 기록</Text>
    <View style={ui.wrap}>{content.data?.branches.map(row => <Choice key={row.name} label={row.name.replace(/^프로모터스\s*/, '')} selected={row.name === branch} onPress={() => setBranch(row.name)}/>)}</View>
    <DataState loading={content.loading && !content.data} error={content.error} empty={!content.loading && !content.error && !content.data?.caseFeedErrors?.length && !posts.length ? '이 지점의 정비사례가 없습니다.' : ''} onRetry={content.reload}/>
    {content.data?.caseFeedErrors?.length ? <Text accessibilityRole="alert" style={ui.error}>{content.data.caseFeedErrors.join(' · ')} 정비사례를 불러오지 못했습니다. 화면을 당겨 다시 확인해 주세요.</Text> : null}
    <CaseCards rows={posts.slice(0, 12)}/>
    <Button brand secondary label="정비사례 더보기" onPress={() => nav.go({name: 'cases'})}/>
    <Text style={ui.heading}>프로모터스 소개</Text>
    {content.data?.introSlides.map(slide => <AssetImage key={slide.key} assetKey={slide.key} label={slide.alt || '프로모터스 소개'}/>)}
    <View style={ui.card}><MenuRow title="매장안내" detail="지점 위치와 전화번호" onPress={() => nav.go({name: 'branches'})}/>
      <MenuRow title="공지사항" onPress={() => nav.go({name: 'notices'})}/></View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  content: {padding: 0, paddingBottom: 0, gap: 0, backgroundColor: color.surface},
  details: {padding: 20, gap: 20, backgroundColor: color.background},
});
