import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const adminMy = StyleSheet.create({
  counts: {flexDirection: 'row', gap: 6},
  count: {flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingHorizontal: 2, paddingVertical: 6, borderRadius: 9, backgroundColor: '#FFFFFF1F'},
  alertCount: {backgroundColor: color.yellow},
  countValue: {fontFamily: font.bold, fontSize: 18, lineHeight: 24, color: '#FFFFFFEB'},
  countLabel: {fontFamily: font.semibold, fontSize: 10, lineHeight: 14, color: '#FFFFFFEB'},
  alertText: {color: color.navy},
});
