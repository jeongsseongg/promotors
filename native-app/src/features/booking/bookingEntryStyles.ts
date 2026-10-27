import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const bookingEntryStyles = StyleSheet.create({
  content: {padding: 16, paddingTop: 16, gap: 18}, header: {minHeight: 62, paddingTop: 20, paddingBottom: 4, paddingRight: 36, justifyContent: 'center'},
  title: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.navy},
  close: {position: 'absolute', right: -4, top: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontFamily: font.medium, fontSize: 22, lineHeight: 32, width: 34, height: 34, borderRadius: 17, textAlign: 'center', color: color.muted, backgroundColor: '#F1F3F5'},
  heroTitle: {fontFamily: font.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1.5, color: color.navy, marginBottom: 8},
  heading: {fontFamily: font.bold, fontSize: 18, lineHeight: 26, color: color.navy}, body: {fontFamily: font.regular, fontSize: 16, lineHeight: 26, color: '#56616D'},
  intro: {gap: 14}, actions: {flexDirection: 'row', gap: 10}, flex: {flex: 1},
  phone: {minHeight: 74, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: color.navy},
  phoneIcon: {fontSize: 30, color: color.yellow}, phoneTitle: {fontFamily: font.bold, fontSize: 17, color: color.surface},
  phoneHint: {fontFamily: font.regular, fontSize: 13, color: '#D8DEEB', marginTop: 3}, chevron: {fontSize: 28, color: color.yellow},
  branches: {gap: 12, marginTop: 4}, branch: {width: '100%', minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1.5, borderColor: color.navy, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface},
  branchText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.navy, textAlign: 'center'},
  lookup: {minHeight: 52, borderWidth: 2, marginBottom: 2},
  summary: {padding: 14, backgroundColor: '#F2F5F8', borderRadius: 10, gap: 4}, summaryText: {fontFamily: font.regular, fontSize: 15, lineHeight: 23, color: '#2B2F33'},
  hint: {fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: '#8A94A0'},
  link: {minHeight: 44, alignItems: 'flex-start', justifyContent: 'center'}, linkText: {fontFamily: font.medium, fontSize: 13, color: color.muted, textDecorationLine: 'underline'},
  slots: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4}, slotWrap: {width: '20%', padding: 4},
  cancel: {width: 80},
});
