import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const bookingStyles = StyleSheet.create({
  card: {backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16},
  stack: {gap: 8}, row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  divider: {height: 1, backgroundColor: color.border},
  time: {fontFamily: font.bold, fontSize: 26, lineHeight: 34, color: color.navy},
  name: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.text},
  body: {fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: color.text},
  caption: {fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: color.muted},
  heading: {fontFamily: font.bold, fontSize: 18, lineHeight: 26, color: color.text},
  status: {backgroundColor: color.softNavy, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  statusText: {fontFamily: font.semibold, fontSize: 13, lineHeight: 20, color: color.navy},
  link: {fontFamily: font.semibold, fontSize: 14, lineHeight: 22, color: color.navy},
  vehicle: {backgroundColor: color.background, borderRadius: 8, padding: 12, gap: 4},
  infoRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 16},
  infoLabel: {width: 68, fontFamily: font.regular, fontSize: 15, lineHeight: 24, color: color.muted},
  infoValue: {flex: 1, fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: color.text},
  date: {fontFamily: font.semibold, fontSize: 16, lineHeight: 24, color: color.navy},
  hero: {backgroundColor: color.surface, borderRadius: 16, borderWidth: 1, borderColor: color.border, padding: 20, gap: 16},
  history: {backgroundColor: color.surface, borderRadius: 12, padding: 16, gap: 12},
});
