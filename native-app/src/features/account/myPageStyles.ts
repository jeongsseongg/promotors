import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const myPage = StyleSheet.create({
  content: {padding: 16, paddingBottom: 28, gap: 20},
  greeting: {paddingHorizontal: 4, gap: 8},
  hello: {fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: '#171C4F'},
  subtitle: {fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: color.muted},
  icon: {width: 80, height: 80, borderRadius: 20},
  group: {gap: 10}, groupTitle: {fontFamily: font.bold, fontSize: 15, lineHeight: 22, color: color.text, paddingHorizontal: 4},
  groupList: {backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: 16, paddingHorizontal: 14, overflow: 'hidden'},
  vehicle: {borderRadius: 18, backgroundColor: color.navy, overflow: 'hidden'},
  vehicleBody: {paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18, gap: 16},
  tags: {flexDirection: 'row', alignItems: 'center', gap: 8},
  plate: {borderWidth: 1, borderColor: '#FFFFFF73', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, color: color.surface, fontFamily: font.bold, fontSize: 12, maxWidth: '68%'},
  badge: {backgroundColor: color.yellow, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, color: color.navy, fontFamily: font.bold, fontSize: 12},
  model: {color: color.surface, fontFamily: font.bold, fontSize: 27, lineHeight: 34, letterSpacing: -0.7},
  description: {color: '#FFFFFFE0', fontFamily: font.semibold, fontSize: 13, lineHeight: 20},
  rateRow: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12},
  rate: {color: color.yellow, fontFamily: font.bold, fontSize: 36, lineHeight: 40},
  percent: {fontSize: 18}, status: {flex: 1, textAlign: 'right', color: '#FFFFFFE0', fontFamily: font.medium, fontSize: 12, lineHeight: 18},
  track: {height: 6, backgroundColor: '#FFFFFF33', borderRadius: 3}, progress: {height: 6, backgroundColor: color.yellow, borderRadius: 3},
  stages: {flexDirection: 'row', justifyContent: 'space-between', gap: 4}, stage: {alignItems: 'center', gap: 5, flex: 1},
  stageIcon: {width: 19, height: 19, tintColor: '#FFFFFF8C'}, step: {fontFamily: font.medium, fontSize: 12, color: '#FFFFFF8C'},
  current: {color: color.yellow}, currentIcon: {tintColor: color.yellow}, doneIcon: {tintColor: color.surface}, done: {color: color.surface},
  next: {minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#171C4F', flexDirection: 'row', alignItems: 'center', gap: 10},
  nextIcon: {width: 20, height: 20, tintColor: color.yellow}, nextTitle: {fontFamily: font.semibold, fontSize: 12, color: '#FFFFFFCC'},
  nextDate: {flex: 1, fontFamily: font.bold, fontSize: 14, color: color.surface, textAlign: 'right'}, chevron: {fontSize: 25, color: color.yellow},
});
