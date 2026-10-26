import {StyleSheet} from 'react-native';
import {color, font} from './tokens';

export const ui = StyleSheet.create({
  flex: {flex: 1},
  stack: {gap: 16},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  spread: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  card: {padding: 16, borderRadius: 18, backgroundColor: color.surface, gap: 12},
  title: {fontFamily: font.bold, fontSize: 28, lineHeight: 36, color: color.navy},
  heading: {fontFamily: font.bold, fontSize: 21, lineHeight: 29, color: color.text},
  body: {fontFamily: font.regular, fontSize: 16, lineHeight: 25, color: color.text},
  muted: {fontFamily: font.regular, fontSize: 15, lineHeight: 23, color: color.muted},
  label: {fontFamily: font.semibold, fontSize: 16, lineHeight: 24, color: color.text},
  error: {fontFamily: font.medium, fontSize: 15, lineHeight: 23, color: color.danger},
  divider: {height: 1, backgroundColor: color.border},
  image: {width: '100%', aspectRatio: 1.45, borderRadius: 16, backgroundColor: color.border},
  pill: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: color.softNavy},
  pillText: {fontFamily: font.semibold, fontSize: 14, color: color.navy},
});
