import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Button} from '../../components/Controls';
import {usePush, useServices} from '../../components/AppContext';
import {useResource} from '../../components/DataState';
import {ui} from '../../theme/styles';

export function ConnectionCard() {
  const push = usePush(), services = useServices(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const resource = useResource(useCallback(() => push.status(), [push]));
  async function act(action: 'connect' | 'disconnect' | 'test') {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'connect') {await push.connect(); if (!(await push.status()).connected) throw new Error('알림 연결이 완료되지 않았습니다. 기기 권한과 로그인 상태를 확인해 주세요.'); setMessage('이 기기의 앱 알림을 연결했습니다.');}
      if (action === 'disconnect') {await push.disconnect(); setMessage('이 기기의 앱 알림 연결을 해제했습니다.');}
      if (action === 'test') {
        const status = await push.status();
        if (!status.connected || !status.deviceId) throw new Error('이 기기의 앱 알림을 먼저 연결해 주세요.');
        await services.notifications.test(status.deviceId); setMessage('테스트 알림을 요청했습니다. 휴대폰 알림창에서 실제 도착을 확인해 주세요.');
      }
      await resource.reload();
    } catch (e) {setError(e instanceof Error ? e.message : '앱 알림을 연결하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }
  const status = resource.data;
  return <View style={ui.card}><Text style={ui.heading}>이 기기의 앱 알림</Text>
    <Text style={ui.body}>{status?.connected ? '연결됨 · 프로모터스 앱으로 알려드려요.' : status?.permission === 'denied' ? '휴대폰 설정에서 앱 알림이 꺼져 있어요.' : '예약과 정비 알림을 받으려면 연결해 주세요.'}</Text>
    <Text style={ui.muted}>앱을 닫아도 휴대폰 알림창과 잠금화면에서 확인할 수 있습니다. 잠금화면 표시와 소리는 휴대폰 설정을 따릅니다.</Text>
    {(error || resource.error) ? <Text accessibilityRole="alert" style={ui.error}>{error || resource.error}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={ui.body}>{message}</Text> : null}
    {status?.permission === 'denied' ? <Button label="휴대폰 설정" onPress={() => void push.openSettings().catch(() => setError('휴대폰 설정을 열지 못했습니다.'))}/> :
      <Button label={status?.connected ? '테스트 알림 보내기' : '앱 알림 연결'} busy={busy} onPress={() => void act(status?.connected ? 'test' : 'connect')} testID="native-push-connect"/>}
    {status?.connected ? <Button secondary label="이 기기 연결 해제" disabled={busy} onPress={() => void act('disconnect')}/> : null}
  </View>;
}
