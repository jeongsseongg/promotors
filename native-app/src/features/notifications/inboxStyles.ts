import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const inboxStyles = StyleSheet.create({
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  heading: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.text},
  caption: {fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: color.muted},
  read: {minHeight: 44, justifyContent: 'center', paddingLeft: 12},
  readText: {fontFamily: font.medium, fontSize: 14, lineHeight: 22, color: color.muted},
  list: {backgroundColor: color.surface, borderRadius: 12},
  item: {padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: color.border},
  unread: {backgroundColor: color.softNavy},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  category: {fontFamily: font.semibold, fontSize: 13, lineHeight: 20, color: color.navy},
  title: {fontFamily: font.semibold, fontSize: 17, lineHeight: 25, color: color.text},
  body: {fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.muted},
  pending: {gap: 8}, meta: {paddingHorizontal: 4},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: color.blue},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8}, flex: {flex: 1},
});
