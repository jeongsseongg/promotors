import React, {useEffect, useRef, useState} from 'react';
import {AppState, Modal, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button} from '../../components/Controls';
import type {StoreUpdates, UpdateRelease} from '../../platform/app-updates';
import {color, font} from '../../theme/tokens';
import release from '../../../release.json';

function useUpdateOffer(updates?: StoreUpdates) {
  const [pending, setPending] = useState<UpdateRelease | null>(null);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const dismissed = useRef(new Set<string>()), generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    if (!updates) return;
    let live = true, checking = false, nextCheck = 0;
    setPending(null);
    const check = async () => {
      if (!live || checking || Date.now() < nextCheck) return;
      checking = true; nextCheck = Date.now() + 5 * 60 * 1000;
      try {
        const found = await updates.check();
        if (live && ticket === generation.current) setPending(found && !dismissed.current.has(found.key) ? found : null);
      } catch {if (live) setPending(null);}
      finally {checking = false;}
    };
    const listener = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state === 'active') void check();
    });
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') void check();
    return () => {live = false; generation.current++; listener.remove();};
  }, [updates]);
  function dismiss(key = pending?.key) {
    if (key) dismissed.current.add(key);
    setPending(current => current?.key === key ? null : current);
  }
  return {pending, active, dismiss, generation};
}
export function UpdateNotice({updates, eligible}: {updates?: StoreUpdates; eligible: boolean}) {
  const {pending, active, dismiss, generation} = useUpdateOffer(updates);
  const [busy, setBusy] = useState(false), [error, setError] = useState<{key: string; message: string} | null>(null);
  useEffect(() => {setBusy(false); setError(null);}, [updates]);
  async function openStore() {
    if (!updates || !pending || busy) return;
    const key = pending.key, ticket = generation.current;
    setBusy(true); setError(null);
    try {
      await updates.openStore();
      if (ticket === generation.current) {
        dismiss(key);
      }
    } catch {if (ticket === generation.current) setError({key, message: '스토어를 열지 못했어요. 다시 눌러 주세요.'});}
    finally {if (ticket === generation.current) setBusy(false);}
  }
  if (!pending) return null;
  return <Modal transparent animationType="fade" statusBarTranslucent visible={eligible && active} onRequestClose={() => dismiss()}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.backdrop}>
      <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.brand}>프로모터스 · 앱 업데이트</Text>
        <Text accessibilityRole="header" style={styles.title}>새 버전이 나왔어요</Text>
        <Text style={styles.body}>더 편리한 예약과 안정적인 알림을 위해 프로모터스를 업데이트해 주세요.</Text>
        <Text style={styles.version}>설치된 버전 {release.version}{pending.version ? '  ·  새 버전 ' + pending.version : ''}</Text>
        {error?.key === pending.key ? <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text> : null}
        <Button label="업데이트" accent busy={busy} onPress={() => void openStore()}/>
        <Button label="나중에" secondary disabled={busy} onPress={() => {dismiss(); setError(null);}}/>
      </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: color.navy + '66'},
  container: {flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24},
  card: {width: '100%', maxWidth: 380, borderRadius: 24, padding: 24, gap: 16, backgroundColor: color.surface},
  brand: {fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.navy},
  title: {fontFamily: font.bold, fontSize: 25, lineHeight: 34, color: color.navy},
  body: {fontFamily: font.regular, fontSize: 16, lineHeight: 25, color: color.text},
  version: {fontFamily: font.medium, fontSize: 13, lineHeight: 20, color: color.muted},
  error: {fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: color.danger},
});
