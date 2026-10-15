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
export function TabBar({active, onChange}: {active: Tab; onChange: (tab: Tab) => void}) {
  return <SafeAreaView edges={['bottom']} style={styles.safe}><View style={styles.row}>
    {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{selected: active === tab.id}}
      onPress={() => onChange(tab.id)} style={styles.tab} testID={'tab-' + tab.id}>
      <Image accessible={false} source={tab.icon} style={[styles.icon, active === tab.id && styles.activeIcon]}/>
      <Text style={[styles.label, active === tab.id && styles.active]}>{tab.label}</Text>
    </Pressable>)}
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: {backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border},
  row: {flexDirection: 'row'}, tab: {flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 2},
  icon: {width: 26, height: 26, tintColor: color.muted}, activeIcon: {tintColor: color.navy},
  label: {fontFamily: font.semibold, fontSize: 12, color: color.muted}, active: {color: color.navy},
});
