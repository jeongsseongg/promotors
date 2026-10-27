import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const bookingEntryStyles = StyleSheet.create({
  content: {padding: 16, paddingTop: 16, gap: 0}, header: {minHeight: 80, paddingBottom: 18, paddingRight: 36, justifyContent: 'flex-end'}, heroHeader: {minHeight: 96},
  title: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.navy},
  close: {position: 'absolute', right: -4, top: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontFamily: font.regular, fontSize: 24, lineHeight: 34, width: 34, height: 34, borderRadius: 17, textAlign: 'center', color: '#555F6B', backgroundColor: '#EEF1F4'},
  heroTitle: {fontFamily: font.black, fontSize: 40, lineHeight: 44, letterSpacing: -1.6, color: color.navy},
  heading: {fontFamily: font.extraBold, fontSize: 18, lineHeight: 24, color: color.navy}, body: {fontFamily: font.regular, fontSize: 16, lineHeight: 26, color: '#56616D'},
  intro: {gap: 14}, actions: {flexDirection: 'row', gap: 10}, entryActions: {marginTop: 20}, formActions: {marginTop: 18}, formError: {marginTop: 12}, flex: {flex: 1},
  phone: {minHeight: 68, marginTop: 14, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: color.navy},
  phoneIcon: {width: 40, height: 40, borderRadius: 20, backgroundColor: color.yellow, alignItems: 'center', justifyContent: 'center'}, phoneGlyph: {fontFamily: font.regular, fontSize: 21, lineHeight: 26, color: color.navy}, phoneTitle: {fontFamily: font.bold, fontSize: 17, color: color.surface},
  phoneHint: {fontFamily: font.regular, fontSize: 13, color: '#D8DEEB', marginTop: 3}, chevron: {fontSize: 28, color: color.yellow},
  branches: {gap: 12}, guestBranches: {gap: 22}, guestBranchList: {marginTop: 2}, branch: {width: '100%', minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1.5, borderColor: color.navy, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface},
  branchText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.navy, textAlign: 'center'},
  lookup: {minHeight: 52, paddingVertical: 0, borderWidth: 2}, lookupText: {fontFamily: font.black, fontSize: 16, lineHeight: 24},
  summary: {padding: 14, backgroundColor: '#F2F5F8', borderRadius: 10, gap: 4}, summaryText: {fontFamily: font.regular, fontSize: 15, lineHeight: 23, color: '#2B2F33'},
  hint: {fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: '#8A94A0'},
  link: {minHeight: 44, alignItems: 'flex-start', justifyContent: 'center'}, linkText: {fontFamily: font.medium, fontSize: 13, color: color.muted, textDecorationLine: 'underline'},
  slots: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4}, slotWrap: {width: '20%', padding: 4},
  cancel: {width: 72}, resultBody: {gap: 18},
});
