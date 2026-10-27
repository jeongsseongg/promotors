import {StyleSheet} from 'react-native';
import {color, font} from '../../theme/tokens';

export const branchStyles = StyleSheet.create({
  gallery: {width: '100%', overflow: 'hidden', borderRadius: 14, backgroundColor: color.border},
  carousel: {flexGrow: 0}, image: {borderRadius: 0},
  controls: {position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  arrow: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#FFFFFFE8'},
  arrowText: {fontFamily: font.regular, fontSize: 30, lineHeight: 36, color: color.navy},
  page: {fontFamily: font.semibold, fontSize: 12, color: color.surface, backgroundColor: '#171719BB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5},
  contacts: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  contact: {flexGrow: 1, flexBasis: 90, minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: color.navy, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center'},
  contactText: {fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.navy, textAlign: 'center'}, pressed: {opacity: 0.7},
  viewer: {flex: 1, backgroundColor: color.surface},
  viewerHeader: {minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: color.border},
  viewerTitle: {flex: 1, fontFamily: font.bold, fontSize: 18, lineHeight: 26, color: color.navy},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}, closeText: {fontFamily: font.regular, fontSize: 30, lineHeight: 36, color: color.muted},
  zoom: {flex: 1}, zoomContent: {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
  viewerFooter: {padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: color.border},
  viewerMeta: {flexDirection: 'row', alignItems: 'center', gap: 12}, viewerAddress: {flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: color.muted},
  viewerPage: {fontFamily: font.semibold, fontSize: 13, color: color.navy},
});
