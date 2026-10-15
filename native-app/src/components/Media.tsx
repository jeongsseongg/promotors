import React, {useEffect, useState} from 'react';
import {Image, ImageStyle, Pressable, StyleSheet, Text, View} from 'react-native';
import {useServices} from './AppContext';
import {ui} from '../theme/styles';

export function AssetImage({assetKey, label, style, onPress, privateAsset = false}: {assetKey?: string; label: string; style?: ImageStyle; onPress?: (uri: string) => void; privateAsset?: boolean}) {
  const services = useServices();
  const [uri, setUri] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setUri(''); setError(false);
    if (assetKey) {
      const request = privateAsset ? services.account.assetUrl(assetKey) : services.publicContent.assetUrl(assetKey);
      void Promise.resolve(request).then(value => {if (active) setUri(value);}).catch(() => {if (active) setError(true);});
    }
    return () => {active = false;};
  }, [assetKey, privateAsset, services]);
  if (!assetKey || error) return <View style={[ui.image, styles.empty, style]}><Text style={ui.muted}>사진을 불러오지 못했어요.</Text></View>;
  if (!uri) return <View style={[ui.image, styles.empty, style]}><Text style={ui.muted}>사진 불러오는 중</Text></View>;
  const source = privateAsset ? {uri, cache: 'reload' as const, headers: {'Cache-Control': 'no-store'}} : {uri};
  const image = <Image accessibilityLabel={label} source={source} style={[ui.image, style]} resizeMode="cover" onError={() => setError(true)}/>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label + ' 크게 보기'} onPress={() => onPress(uri)}>{image}</Pressable> : image;
}
export function plainText(value: unknown) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
const styles = StyleSheet.create({empty: {alignItems: 'center', justifyContent: 'center'}});
