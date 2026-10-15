import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, Modal, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativePush} from '../../components/AppContext';
import type {SessionSnapshot} from '../../domain/types';
import {Button} from '../../components/Controls';
import {color, font} from '../../theme/tokens';

type Phase = 'idle' | 'checking' | 'connected' | 'denied' | 'error';
type Result = {owner: string; phase: Phase; message?: string};
export function useAutomaticNotifications(push: NativePush, session: SessionSnapshot, eligible: boolean) {
  const owner = session.authenticated && session.status === 'signedIn' ? JSON.stringify([session.profile?.id, session.role, session.branches, session.privacyEpoch]) : '';
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [result, setResult] = useState<Result>({owner: '', phase: 'idle'});
  const [resume, setResume] = useState(0);
  const context = useRef({owner, eligible, active}); context.current = {owner, eligible, active};
  const generation = useRef(0), handled = useRef(''), busy = useRef(false), settingsOwner = useRef('');
  useEffect(() => {
    generation.current++; handled.current = ''; busy.current = false; settingsOwner.current = '';
    setResult({owner, phase: 'idle'});
    return () => {generation.current++;};
  }, [owner, push]);
  const run = useCallback(async (retry = false) => {
    if (!owner || busy.current || !context.current.eligible || !context.current.active || (!retry && handled.current === owner)) return;
    const ticket = generation.current;
    if (retry) settingsOwner.current = '';
    const current = () => ticket === generation.current && context.current.owner === owner;
    busy.current = true; setResult({owner, phase: 'checking'});
    try {
      const before = await push.status();
      if (!current()) return;
      if (!context.current.eligible || !context.current.active) {setResult({owner, phase: 'idle'}); return;}
      handled.current = owner;
      if (before.automatic === false || before.connected) {setResult({owner, phase: 'idle'}); return;}
      if (before.permission === 'denied') {setResult({owner, phase: 'denied'}); return;}
      await push.connect();
      if (!current()) return;
      const after = await push.status();
      if (!current()) return;
      if (!after.connected) throw new Error('알림 연결을 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
      setResult({owner, phase: 'connected'});
    } catch (error) {
      if (!current()) return;
      handled.current = owner;
      let denied = false;
      try {denied = (await push.status()).permission === 'denied';} catch {}
      if (current()) setResult({owner, phase: denied ? 'denied' : 'error', message: error instanceof Error ? error.message : '알림 연결을 완료하지 못했어요. 다시 시도해 주세요.'});
    } finally {if (current()) busy.current = false;}
  }, [owner, push]);
  useEffect(() => {void run(resume > 0 && settingsOwner.current === owner);}, [owner, eligible, active, resume, run]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state === 'active' && settingsOwner.current === context.current.owner) setResume(value => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const phase = result.owner === owner ? result.phase : 'idle';
  const openSettings = useCallback(async () => {
    settingsOwner.current = owner;
    try {await push.openSettings();}
    catch {settingsOwner.current = ''; if (context.current.owner === owner) setResult({owner, phase: 'error', message: '휴대폰 설정을 열지 못했어요. 다시 시도해 주세요.'});}
  }, [owner, push]);
  function dismiss() {handled.current = owner; settingsOwner.current = ''; setResume(0); setResult({owner, phase: 'idle'});}
  return {phase, message: result.owner === owner ? result.message : undefined,
    visible: !!owner && eligible && active && !['idle', 'checking'].includes(phase),
    blocking: !!owner && eligible && (handled.current !== owner || phase !== 'idle'),
    dismiss, openSettings, retry: () => run(true)};
}
type Setup = ReturnType<typeof useAutomaticNotifications>;
export function NotificationPrompt({setup, onSettings, disclosure}: {setup: Setup; onSettings: () => void; disclosure?: string}) {
  const connected = setup.phase === 'connected', denied = setup.phase === 'denied';
  return <Modal transparent animationType="fade" statusBarTranslucent visible={setup.visible} onRequestClose={setup.dismiss}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.backdrop}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card} accessibilityViewIsModal testID="automatic-notification-prompt">
          <Text style={styles.brand}>프로모터스 · 앱 알림</Text>
          <Text accessibilityRole="header" style={styles.title}>{connected ? '앱 알림이 연결됐어요' : denied ? '앱 알림을 켜주세요' : '알림 연결을 확인해 주세요'}</Text>
          <Text style={styles.body}>{connected ? '예약과 정비 소식을 휴대폰으로 알려드릴게요. 받고 싶은 알림은 바로 설정할 수 있어요.' : denied ? '휴대폰 설정에서 프로모터스 알림을 허용하면 앱으로 돌아왔을 때 자동으로 연결돼요.' : setup.message}</Text>
          {connected ? <><Button accent label="알림 설정" onPress={onSettings}/><Button secondary label="확인" onPress={setup.dismiss}/></> :
            <><Button accent label={denied ? '휴대폰 설정' : '다시 시도'} onPress={() => void (denied ? setup.openSettings() : setup.retry())}/><Button secondary label="나중에" onPress={setup.dismiss}/></>}
          {disclosure ? <Text style={styles.detail}>{disclosure}</Text> : null}
          <Text style={styles.detail}>알림을 꺼도 예약과 조회는 이용할 수 있어요. 잠금화면 표시와 소리는 휴대폰 설정을 따라요.</Text>
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
  detail: {fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: color.muted},
});
