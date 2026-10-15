import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Tab} from './AppContext';
import {color, font} from '../theme/tokens';

const tabs: {id: Tab; label: string; mark: string}[] = [
  {id: 'home', label: '소개', mark: '⌂'}, {id: 'branches', label: '매장안내', mark: '⌖'},
  {id: 'cases', label: '정비사례', mark: '◇'}, {id: 'notices', label: '공지', mark: '≡'},
  {id: 'my', label: '마이', mark: '○'},
];
export function TabBar({active, onChange}: {active: Tab; onChange: (tab: Tab) => void}) {
  return <SafeAreaView edges={['bottom']} style={styles.safe}><View style={styles.row}>
    {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{selected: active === tab.id}}
      onPress={() => onChange(tab.id)} style={styles.tab} testID={'tab-' + tab.id}>
      <Text accessibilityElementsHidden style={[styles.mark, active === tab.id && styles.active]}>{tab.mark}</Text>
      <Text style={[styles.label, active === tab.id && styles.active]}>{tab.label}</Text>
    </Pressable>)}
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: {backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border},
  row: {flexDirection: 'row'}, tab: {flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 2},
  mark: {fontSize: 26, color: color.muted}, label: {fontFamily: font.semibold, fontSize: 12, color: color.muted},
  active: {color: color.navy},
});
