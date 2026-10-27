import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const authStyles = StyleSheet.create({
  content: {padding: 16, paddingTop: 16, gap: 0},
  header: {minHeight: 78, justifyContent: 'flex-end', paddingBottom: 16},
  title: {fontFamily: font.bold, fontSize: 20, lineHeight: 28, color: color.navy},
  close: {position: 'absolute', top: -4, right: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontFamily: font.medium, color: color.muted, fontSize: 22, lineHeight: 32, textAlign: 'center', width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F3F5'},
  tabs: {flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ECEFF2', marginBottom: 16},
  tab: {minHeight: 44, minWidth: 72, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent'},
  activeTab: {borderBottomColor: color.yellow},
  tabText: {fontFamily: font.semibold, fontSize: 14, color: '#8A929B'},
  activeTabText: {color: color.navy},
  form: {gap: 12}, input: {minHeight: 48, borderRadius: 8, borderColor: '#E3E6EA', paddingHorizontal: 13, fontSize: 16},
  password: {position: 'relative'}, passwordInput: {paddingRight: 66},
  eye: {position: 'absolute', right: 4, top: 2, minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  eyeText: {fontFamily: font.bold, fontSize: 12, color: color.navy, backgroundColor: '#F1F3F5', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 5},
  checks: {gap: 1, marginTop: 4}, check: {minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7},
  box: {width: 14, height: 14, borderWidth: 1, borderColor: '#A0A7AF', borderRadius: 3, alignItems: 'center', justifyContent: 'center'},
  checkedBox: {backgroundColor: color.navy, borderColor: color.navy}, tick: {fontFamily: font.bold, fontSize: 11, lineHeight: 13, color: color.surface},
  checkLabel: {fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted},
  actions: {flexDirection: 'row', gap: 10, marginTop: 34}, primary: {flex: 1}, cancel: {width: 70},
  secondary: {marginTop: 24, gap: 10}, links: {flexDirection: 'row', flexWrap: 'wrap', gap: 18},
  link: {minHeight: 44, justifyContent: 'center'}, linkText: {fontFamily: font.regular, fontSize: 13, color: color.muted},
});
