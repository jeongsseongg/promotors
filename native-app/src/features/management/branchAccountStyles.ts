import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const branchAccountStyles = StyleSheet.create({
  hero: {backgroundColor: color.navy, borderRadius: 18, padding: 20, gap: 10},
  eyebrow: {fontFamily: font.semibold, fontSize: 13, color: color.yellow},
  title: {fontFamily: font.extraBold, fontSize: 24, lineHeight: 32, color: color.surface},
  description: {fontFamily: font.regular, fontSize: 15, lineHeight: 23, color: '#FFFFFFDE'},
  card: {backgroundColor: color.surface, borderRadius: 18, padding: 18, gap: 16},
  heading: {fontFamily: font.bold, fontSize: 19, lineHeight: 27, color: color.navy},
  note: {fontFamily: font.regular, fontSize: 14, lineHeight: 22, color: color.muted},
  choices: {gap: 8}, list: {gap: 12},
  account: {backgroundColor: color.surface, borderRadius: 16, padding: 18, gap: 8},
  row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  label: {flex: 1, fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.navy},
  badge: {fontFamily: font.semibold, fontSize: 12, lineHeight: 18, color: color.navy,
    backgroundColor: color.softNavy, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4},
  loginId: {fontFamily: font.medium, fontSize: 15, lineHeight: 23, color: color.text},
  notice: {backgroundColor: color.softNavy, borderRadius: 14, padding: 16, gap: 6},
  noticeTitle: {fontFamily: font.bold, fontSize: 16, lineHeight: 24, color: color.navy},
});
