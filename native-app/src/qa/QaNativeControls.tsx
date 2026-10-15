import React, {useState} from 'react';
import {NativeModules, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/Controls';
import {NativeBookingSnapshot} from '../domain/types';
import {qaDate} from './fixture-data';

const binding = '00000000-0000-4000-8000-000000000015';
function snapshot(active: boolean): NativeBookingSnapshot {
  return {active, binding, pendingCount: active ? 1 : 0, upcomingCount: active ? 1 : 0,
    branch: '프로모터스 안산점', schedule: qaDate(1) + ' · 10:00', bookingId: 'qa-pending',
    startsAt: Date.parse(qaDate(1).replace(/\./g, '-') + 'T10:00:00+09:00') / 1000,
    customerName: '예시 고객', vehicleName: 'BMW 520d', vehiclePlate: '차량번호 비공개'};
}
export function QaNativeControls() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('상시알림 예시 · 서버 연결 및 발송 없음');
  async function display(active: boolean) {
    if (busy) return; setBusy(true);
    const bridge = NativeModules.PromotorsPush;
    try {
      if (!bridge?.syncBookingSchedule || !bridge?.bindConnection) throw new Error('네이티브 상시알림 기능이 연결되지 않았습니다.');
      if (active) {
        if (await bridge.requestPermission() !== 'granted') throw new Error('앱 알림 권한을 허용해 주세요.');
        await bridge.bindConnection(binding);
      }
      await bridge.syncBookingSchedule(snapshot(active));
      setMessage(active ? '예시 상시알림 표시 요청 · 휴대폰 알림창에서 확인' : '예시 상시알림을 지웠습니다.');
      console.info('PROMOTORS_NATIVE_QA_ONGOING', JSON.stringify({active, serverRequests: 0}));
    } catch (failure) {setMessage(failure instanceof Error ? failure.message : '상시알림을 표시하지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <View style={styles.box}><Text style={styles.text}>{message}</Text><View style={styles.row}>
    <View style={styles.flex}><Button secondary label="상시알림 예시" busy={busy} onPress={() => void display(true)}/></View>
    <View style={styles.flex}><Button secondary label="예시 지우기" disabled={busy} onPress={() => void display(false)}/></View>
  </View></View>;
}
const styles = StyleSheet.create({box: {padding: 8, gap: 4, backgroundColor: '#EAF0F9'}, row: {flexDirection: 'row', gap: 8}, flex: {flex: 1}, text: {fontSize: 11, color: '#071E55', textAlign: 'center'}});
