import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const authStyles = StyleSheet.create({
  content: {padding: 16, paddingTop: 16, gap: 0},
  header: {minHeight: 80, justifyContent: 'flex-end', paddingBottom: 18},
  title: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.navy},
  close: {position: 'absolute', top: -4, right: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontFamily: font.regular, color: '#555F6B', fontSize: 24, lineHeight: 34, textAlign: 'center', width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF1F4'},
  tabs: {flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#EEF1F4', marginBottom: 16},
  tab: {minHeight: 39, minWidth: 72, paddingHorizontal: 16, paddingVertical: 8, marginBottom: -2, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent'},
  activeTab: {borderBottomColor: color.yellow},
  tabText: {fontFamily: font.bold, fontSize: 14, lineHeight: 20, color: '#8A94A0'},
  activeTabText: {color: color.navy},
  form: {gap: 12}, input: {minHeight: 48, borderRadius: 8, borderColor: '#D6DBE1', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 22},
  password: {position: 'relative'}, passwordInput: {paddingRight: 64},
  eye: {position: 'absolute', right: 6, top: 2, minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  eyeText: {fontFamily: font.extraBold, fontSize: 12, lineHeight: 16, color: color.navy, backgroundColor: '#EEF1F4', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6},
  checks: {gap: 12}, check: {minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 8},
  box: {width: 13, height: 13, borderWidth: 1, borderColor: '#A0A7AF', borderRadius: 2, alignItems: 'center', justifyContent: 'center'},
  checkedBox: {backgroundColor: color.navy, borderColor: color.navy}, tick: {fontFamily: font.bold, fontSize: 11, lineHeight: 13, color: color.surface},
  checkLabel: {fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: '#555F6B'},
  error: {minHeight: 16, fontSize: 13, lineHeight: 16, color: '#C0392B'},
  actions: {flexDirection: 'row', gap: 10, marginTop: 18}, primary: {flex: 1}, cancel: {width: 72},
  secondary: {marginTop: 24, gap: 10}, links: {flexDirection: 'row', flexWrap: 'wrap', gap: 18},
  link: {minHeight: 44, justifyContent: 'center'}, linkText: {fontFamily: font.regular, fontSize: 13, color: color.muted},
});
