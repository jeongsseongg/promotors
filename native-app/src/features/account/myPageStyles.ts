import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const myPage = StyleSheet.create({
  content: {padding: 16, paddingTop: 20, paddingBottom: 28, gap: 20, backgroundColor: '#F7F7F8'},
  greeting: {paddingHorizontal: 4, paddingTop: 2, gap: 8}, greetingRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  hello: {flex: 1, fontFamily: font.extraBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: '#171C4F'},
  subtitle: {fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: '#37383C9C'},
  notificationButton: {width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: color.surface, borderRadius: 12, borderWidth: 1, borderColor: color.border},
  notificationIcon: {width: 20, height: 20}, notificationLabel: {fontFamily: font.semibold, fontSize: 10, lineHeight: 13, color: color.navy},
  icon: {width: 80, height: 80, borderRadius: 20},
  group: {gap: 8}, groupTitle: {fontFamily: font.bold, fontSize: 12, lineHeight: 17, color: '#37383C9C', paddingHorizontal: 4, marginBottom: 18},
  groupList: {backgroundColor: color.surface, borderWidth: 1, borderColor: '#70737C14', borderRadius: 14, overflow: 'hidden'},
  vehicle: {borderRadius: 18, backgroundColor: color.navy, overflow: 'hidden', boxShadow: '0 12px 28px rgba(30,36,100,0.2)'},
  vehicleBody: {paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18, gap: 16},
  vehicleHead: {gap: 23},
  tags: {flexDirection: 'row', alignItems: 'center', gap: 8},
  plate: {minHeight: 28, borderWidth: 1, borderColor: '#FFFFFF73', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, color: color.surface, fontFamily: font.bold, fontSize: 12, lineHeight: 14, maxWidth: '68%'},
  badge: {minHeight: 28, backgroundColor: color.yellow, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, color: color.navy, fontFamily: font.bold, fontSize: 12, lineHeight: 14},
  model: {color: color.surface, fontFamily: font.extraBold, fontSize: 27, lineHeight: 34, letterSpacing: -0.7},
  description: {color: '#FFFFFFE0', fontFamily: font.semibold, fontSize: 13, lineHeight: 19.5},
  rateRow: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12},
  rate: {color: color.yellow, fontFamily: font.extraBold, fontSize: 36, lineHeight: 40},
  percent: {fontSize: 18}, status: {flex: 1, maxWidth: '58%', textAlign: 'right', color: '#FFFFFFEB', fontFamily: font.semibold, fontSize: 12, lineHeight: 16.8},
  track: {height: 8, backgroundColor: '#FFFFFF33', borderRadius: 4}, progress: {height: 8, backgroundColor: color.yellow, borderRadius: 4},
  stages: {flexDirection: 'row', justifyContent: 'space-between', gap: 6},
  stage: {minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, paddingHorizontal: 2, paddingVertical: 6, borderRadius: 9, backgroundColor: '#FFFFFF1C'},
  doneStage: {backgroundColor: color.surface}, currentStage: {backgroundColor: color.yellow},
  stageIcon: {width: 14, height: 14, tintColor: '#FFFFFFB8'}, step: {fontFamily: font.bold, fontSize: 10, lineHeight: 14, color: '#FFFFFFB8'},
  current: {color: color.navy}, currentIcon: {tintColor: color.navy}, doneIcon: {tintColor: color.navy}, done: {color: color.navy},
  next: {minHeight: 54, paddingHorizontal: 16, backgroundColor: '#171C4F', flexDirection: 'row', alignItems: 'center', gap: 8},
  nextIcon: {width: 18, height: 18, tintColor: color.yellow}, nextTitle: {fontFamily: font.semibold, fontSize: 13, color: color.surface},
  nextDate: {flex: 1, fontFamily: font.bold, fontSize: 13, color: color.surface, textAlign: 'right'}, chevron: {fontSize: 20, color: '#FFFFFF9E'},
});

export function myPageAtWidth(width: number) {
  const hello = Math.max(20, Math.min(width * 0.056, 24));
  const model = Math.max(22, Math.min(width * 0.064, 28));
  const rate = Math.max(32, Math.min(width * 0.09, 38));
  return {content: {paddingHorizontal: width <= 360 ? 12 : 16}, hello: {fontSize: hello, lineHeight: hello * 1.2},
    body: {paddingHorizontal: width <= 360 ? 14 : 16}, model: {fontSize: model, lineHeight: model * 1.15},
    rate: {fontSize: rate, lineHeight: rate}, percent: {fontSize: rate * 0.58}, stages: {gap: width <= 360 ? 4 : 6}};
}
