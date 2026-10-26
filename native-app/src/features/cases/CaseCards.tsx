import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNav} from '../../components/AppContext';
import {AssetImage, plainText} from '../../components/Media';
import {PublicPost} from '../../domain/types';
import {color, font} from '../../theme/tokens';
import {ui} from '../../theme/styles';

export function CasePhoto({uri, title, onPress}: {uri: string; title: string; onPress?: (uri: string) => void}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (failed) return <Pressable accessibilityRole="button" onPress={() => setFailed(false)} style={[styles.photo, styles.empty]}><Text style={ui.muted}>사진을 불러오지 못했어요.</Text><Text style={ui.pillText}>눌러서 다시 불러오기</Text></Pressable>;
  const image = <Image source={{uri}} accessibilityLabel={title} resizeMode="cover" style={styles.photo} onError={() => setFailed(true)}/>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title + ' 크게 보기'} onPress={() => onPress(uri)}>{image}</Pressable> : image;
}
export function CaseCards({rows, kind = 'case'}: {rows: PublicPost[]; kind?: 'case' | 'notice'}) {
  const nav = useNav();
  return <>{rows.map((row, index) => <Pressable key={String(row.id || index)} accessibilityRole="button" accessibilityLabel={row.title}
    style={styles.card} onPress={() => nav.go({name: kind, id: String(row.id || index)})}>
    {row.imageUrls?.[0] ? <CasePhoto uri={row.imageUrls[0]} title={row.title}/> : row.imageKeys?.[0] ? <AssetImage assetKey={row.imageKeys[0]} label={row.title} style={styles.photo}/> : null}
    <View style={styles.body}><Text style={styles.date}>{[row.branch, row.date].filter(Boolean).join(' · ')}</Text>
      <Text numberOfLines={2} style={styles.title}>{row.title}</Text>
      {row.bodyHtml || row.body ? <Text numberOfLines={2} style={styles.summary}>{plainText(row.bodyHtml || row.body)}</Text> : null}
    </View>
  </Pressable>)}</>;
}
const styles = StyleSheet.create({
  card: {backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: 12, overflow: 'hidden'},
  photo: {width: '100%', aspectRatio: 1.5, borderRadius: 0, backgroundColor: color.background}, empty: {alignItems: 'center', justifyContent: 'center', gap: 8},
  body: {padding: 16, gap: 10}, date: {alignSelf: 'flex-start', fontFamily: font.semibold, fontSize: 11, lineHeight: 17, color: '#7A8798', backgroundColor: '#F1F4F8', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2},
  title: {fontFamily: font.bold, fontSize: 17, lineHeight: 24, color: color.navy},
  summary: {fontFamily: font.regular, fontSize: 13, lineHeight: 21, color: color.muted},
});
