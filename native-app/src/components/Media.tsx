import React, {useEffect, useRef, useState} from 'react';
import {Image, ImageStyle, Pressable, StyleSheet, Text, View} from 'react-native';
import {useServices} from './AppContext';
import {ui} from '../theme/styles';

function useAssetSource(assetKey: string | undefined, privateAsset: boolean) {
  const services = useServices(), epoch = useRef({value: 0, recovered: false}).current;
  const [uri, setUri] = useState(''), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = ++epoch.value; epoch.recovered = false; setUri(''); setError(false);
    if (assetKey) {
      const load = Promise.resolve().then(() => privateAsset ? services.account.assetUrl(assetKey) : services.publicContent.assetUrl(assetKey));
      load.then(value => {if (request === epoch.value) setUri(value);}).catch(() => {if (request === epoch.value) setError(true);});
    }
    return () => {epoch.value++;};
  }, [assetKey, attempt, epoch, privateAsset, services]);
  async function recover() {
    if (epoch.recovered || !assetKey) {setError(true); return;}
    epoch.recovered = true;
    const request = epoch.value;
    try {
      const legacy = privateAsset ? await services.account.legacyAsset(assetKey) : await services.publicContent.legacyAsset(assetKey);
      if (request === epoch.value) {if (legacy) setUri(legacy); else setError(true);}
    } catch {if (request === epoch.value) setError(true);}
  }
  async function open(onPress: (value: string) => void) {
    if (!assetKey || !uri) return;
    const request = epoch.value;
    try {const fresh = privateAsset && !uri.startsWith('data:image/') ? await services.account.assetUrl(assetKey) : uri; if (request === epoch.value) onPress(fresh);}
    catch {if (request === epoch.value) setError(true);}
  }
  return {uri, error, recover, open, retry: () => setAttempt(value => value + 1)};
}
type Props = {assetKey?: string; label: string; style?: ImageStyle; onPress?: (uri: string) => void; privateAsset?: boolean};
export function AssetImage({assetKey, label, style, onPress, privateAsset = false}: Props) {
  const media = useAssetSource(assetKey, privateAsset);
  if (!assetKey || media.error) return <Pressable accessibilityRole="button" accessibilityLabel="사진 다시 불러오기" onPress={media.retry} style={[ui.image, styles.empty, style]}><Text style={ui.muted}>사진을 불러오지 못했어요.</Text><Text style={ui.pillText}>눌러서 다시 불러오기</Text></Pressable>;
  if (!media.uri) return <View style={[ui.image, styles.empty, style]}><Text style={ui.muted}>사진 불러오는 중</Text></View>;
  const source = privateAsset ? {uri: media.uri, cache: 'reload' as const, headers: {'Cache-Control': 'no-store'}} : {uri: media.uri};
  const image = <Image accessibilityLabel={label} source={source} style={[ui.image, style]} resizeMode="cover" onError={() => void media.recover()}/>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label + ' 크게 보기'} onPress={() => void media.open(onPress)}>{image}</Pressable> : image;
}
export function plainText(value: unknown) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
const styles = StyleSheet.create({empty: {alignItems: 'center', justifyContent: 'center', gap: 8}});
