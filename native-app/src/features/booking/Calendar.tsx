import React from 'react';
import {Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {color, font} from '../../theme/tokens';

export function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('.');
}
export function monthRange(month: Date) {
  return {from: dateKey(new Date(month.getFullYear(), month.getMonth(), 1)), to: dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))};
}
export function Calendar({month, selected, onMonth, onSelect, disabledDate, counts}: {month: Date; selected: string; onMonth: (date: Date) => void; onSelect: (date: string) => void; disabledDate?: (date: string) => boolean; counts?: Record<string, number>}) {
  const compact = useWindowDimensions().width <= 900;
  const year = month.getFullYear(), m = month.getMonth();
  const days = new Date(year, m + 1, 0).getDate(), first = new Date(year, m, 1).getDay();
  const cells = Array.from({length: Math.ceil((first + days) / 7) * 7}, (_, index) => index - first + 1);
  return <View style={styles.calendar}>
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 달" hitSlop={5} onPress={() => onMonth(new Date(year, m - 1, 1))} style={styles.nav}><Text style={styles.arrow}>‹</Text></Pressable>
      <Text style={styles.month}>{year}. {String(m + 1).padStart(2, '0')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={5} onPress={() => onMonth(new Date(year, m + 1, 1))} style={styles.nav}><Text style={styles.arrow}>›</Text></Pressable>
    </View>
    <View style={styles.grid}>{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <Text key={day} style={[styles.weekday, index === 0 && styles.sunday]}>{day}</Text>)}
      {cells.map((day, index) => {
        if (day < 1 || day > days) return <View key={'empty-' + index} style={styles.cellSpace}/>;
        const key = dateKey(new Date(year, m, day)), disabled = disabledDate?.(key) || false, active = key === selected;
        return <View key={key} style={styles.cellSpace}><Pressable accessibilityRole="button" accessibilityLabel={key + (counts?.[key] ? ' 예약 ' + counts[key] + '건' : '')}
          accessibilityState={{selected: active, disabled}} disabled={disabled} onPress={() => onSelect(key)}
          style={[styles.cell, compact && styles.compactCell, active && styles.selected, disabled && styles.disabled]}>
          <Text style={[styles.day, active && styles.selectedText, disabled && styles.disabledText]}>{day}</Text>
          {counts?.[key] ? <Text numberOfLines={1} style={styles.count}>예약 {counts[key]}</Text> : null}
        </Pressable></View>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  calendar: {gap: 12}, head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, compactCell: {minHeight: 44},
  grid: {flexDirection: 'row', flexWrap: 'wrap'}, cellSpace: {width: '14.2857%', padding: 2},
  cell: {minHeight: 52, paddingTop: 6, paddingBottom: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, gap: 2},
  weekday: {width: '14.2857%', textAlign: 'center', fontFamily: font.bold, fontSize: 12, lineHeight: 30, color: '#8A94A0'},
  sunday: {color: '#C0392B'}, day: {fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: '#2B2F33'},
  month: {fontFamily: font.bold, fontSize: 18, lineHeight: 26, color: color.navy},
  count: {position: 'absolute', bottom: 5, alignSelf: 'center', fontFamily: font.extraBold, fontSize: 11, lineHeight: 14, color: color.navy, backgroundColor: color.yellow, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1}, selected: {backgroundColor: color.navy, borderColor: color.navy},
  selectedText: {color: color.surface}, disabled: {backgroundColor: '#F5F6F8'}, disabledText: {color: '#C3CAD3'},
  nav: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border},
  arrow: {fontFamily: font.regular, fontSize: 16, lineHeight: 20, color: color.navy},
});
