import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {color, font} from '../../theme/tokens';
import {ui} from '../../theme/styles';

export function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('.');
}
export function monthRange(month: Date) {
  return {from: dateKey(new Date(month.getFullYear(), month.getMonth(), 1)), to: dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))};
}
export function Calendar({month, selected, onMonth, onSelect, disabledDate, counts}: {month: Date; selected: string; onMonth: (date: Date) => void; onSelect: (date: string) => void; disabledDate?: (date: string) => boolean; counts?: Record<string, number>}) {
  const year = month.getFullYear(), m = month.getMonth();
  const days = new Date(year, m + 1, 0).getDate(), first = new Date(year, m, 1).getDay();
  const cells = Array.from({length: Math.ceil((first + days) / 7) * 7}, (_, index) => index - first + 1);
  return <View style={ui.stack}>
    <View style={ui.spread}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => onMonth(new Date(year, m - 1, 1))} style={styles.nav}><Text style={styles.arrow}>‹</Text></Pressable>
      <Text style={styles.month}>{year}. {String(m + 1).padStart(2, '0')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => onMonth(new Date(year, m + 1, 1))} style={styles.nav}><Text style={styles.arrow}>›</Text></Pressable>
    </View>
    <View style={styles.grid}>{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <Text key={day} style={[styles.weekday, index === 0 && styles.sunday]}>{day}</Text>)}
      {cells.map((day, index) => {
        if (day < 1 || day > days) return <View key={'empty-' + index} style={styles.cellSpace}/>;
        const key = dateKey(new Date(year, m, day)), disabled = disabledDate?.(key) || false, active = key === selected;
        return <View key={key} style={styles.cellSpace}><Pressable accessibilityRole="button" accessibilityLabel={key + (counts?.[key] ? ' 예약 ' + counts[key] + '건' : '')}
          accessibilityState={{selected: active, disabled}} disabled={disabled} onPress={() => onSelect(key)}
          style={[styles.cell, active && styles.selected, disabled && styles.disabled]}>
          <Text style={[styles.day, active && styles.selectedText]}>{day}</Text>
          {counts?.[key] ? <Text numberOfLines={1} style={styles.count}>예약 {counts[key]}</Text> : null}
        </Pressable></View>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'}, cellSpace: {width: '14.2857%', padding: 2},
  cell: {minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, gap: 2},
  weekday: {width: '14.2857%', textAlign: 'center', fontFamily: font.semibold, fontSize: 14, lineHeight: 36, color: color.muted},
  sunday: {color: color.danger}, day: {fontFamily: font.semibold, fontSize: 17, color: color.text},
  month: {fontFamily: font.bold, fontSize: 24, lineHeight: 32, color: color.navy},
  count: {fontFamily: font.bold, fontSize: 10, color: color.navy, backgroundColor: color.yellow, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1}, selected: {backgroundColor: color.navy, borderColor: color.navy},
  selectedText: {color: color.surface}, disabled: {opacity: 0.3},
  nav: {minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border},
  arrow: {fontSize: 30, color: color.navy},
});
