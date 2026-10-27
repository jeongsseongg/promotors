import React from 'react';
import {Image, ImageSourcePropType, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Tab} from './AppContext';
import {color, font} from '../theme/tokens';

const tabs: {id: Tab; label: string; icon: ImageSourcePropType}[] = [
  {id: 'home', label: '소개', icon: require('../../assets/navigation/home.png')},
  {id: 'branches', label: '매장안내', icon: require('../../assets/navigation/branches.png')},
  {id: 'cases', label: '정비사례', icon: require('../../assets/navigation/cases.png')},
  {id: 'notices', label: '게시판', icon: require('../../assets/navigation/notices.png')},
  {id: 'my', label: '마이', icon: require('../../assets/navigation/my.png')},
];
export function tabBarHeight(fontScale = 1) {return 13 + Math.max(44, 31 + 13 * fontScale);}
export function TabBar({active, onChange}: {active: Tab; onChange: (tab: Tab) => void}) {
  return <SafeAreaView edges={['bottom']} style={styles.safe}><View style={styles.row}>
    {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{selected: active === tab.id}}
      onPress={() => onChange(tab.id)} hitSlop={{top: 2, bottom: 2}} style={styles.tab} testID={'tab-' + tab.id}>
      <Image accessible={false} source={tab.icon} style={[styles.icon, active === tab.id && styles.activeIcon]}/>
      <Text style={[styles.label, active === tab.id && styles.active]}>{tab.label}</Text>
    </Pressable>)}
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: {backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: '#E5E8EC', boxShadow: '0 -6px 18px rgba(15,23,42,0.08)'},
  row: {flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 6},
  tab: {flex: 1, minHeight: 44, paddingTop: 4, paddingBottom: 2, alignItems: 'center', justifyContent: 'center', gap: 3},
  icon: {width: 22, height: 22, tintColor: '#8A94A0'}, activeIcon: {tintColor: color.navy},
  label: {fontFamily: font.bold, fontSize: 11, lineHeight: 13, includeFontPadding: false, color: '#8A94A0'}, active: {color: color.navy},
});
