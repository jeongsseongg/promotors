import React, {useState} from 'react';
import {NativeModules, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/Controls';
import {NativeBookingSnapshot} from '../domain/types';

const binding = '00000000-0000-4000-8000-000000000015';
function snapshot(active: boolean): NativeBookingSnapshot {
  const appointment = new Date(Date.now() + 45 * 60 * 1000);
  const schedule = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(appointment).replace(/-/g, '.').replace(' ', ' · ');
  return {active, binding, pendingCount: active ? 1 : 0, upcomingCount: active ? 1 : 0,
    branch: '프로모터스 안산점', schedule, bookingId: 'qa-pending',
    startsAt: appointment.getTime() / 1000,
    customerName: '예시 고객', vehicleName: 'BMW 520d', vehiclePlate: '차량번호 비공개'};
}
export function QaNativeControls({customer = false}: {customer?: boolean}) {
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
  async function showNewBooking() {
    if (busy) return; setBusy(true);
    const bridge = NativeModules.PromotorsPush;
    try {
      if (!bridge?.showQaNotification || !bridge?.bindConnection) throw new Error('네이티브 예시 알림 기능이 연결되지 않았습니다.');
      if (await bridge.requestPermission() !== 'granted') throw new Error('앱 알림 권한을 허용해 주세요.');
      await bridge.bindConnection(binding);
      if (!await bridge.showQaNotification()) throw new Error('테스트 전용 알림을 표시하지 못했습니다.');
      setMessage('새 예약 예시 알림 표시 요청 · 운영 서버 요청 없음');
      console.info('PROMOTORS_NATIVE_QA_NOTIFICATION', JSON.stringify({serverRequests: 0}));
    } catch (failure) {setMessage(failure instanceof Error ? failure.message : '예시 알림을 표시하지 못했습니다.');}
    finally {setBusy(false);}
  }
  async function displayCustomer(phase: 'confirmed' | 'visit' | 'repair' | 'completed') {
    const bridge = NativeModules.PromotorsPush; if (busy) return; setBusy(true);
    try {
      if (await bridge.requestPermission() !== 'granted') throw new Error('앱 알림 권한을 허용해 주세요.');
      await bridge.bindConnection(binding);
      const value = {...snapshot(true), audience: 'customer', phase, runId: phase === 'repair' || phase === 'completed' ? 'qa-run' : '',
        pendingCount: 0, upcomingCount: 0, progress: {confirmed: 0, visit: 33, repair: 77, completed: 100}[phase],
        stageLabel: phase === 'completed' ? '정비가 완료되었어요' : '입고 점검 확인 완료',
        expiresAt: phase === 'completed' ? Date.now() / 1000 + 7200 : 0};
      await bridge.syncBookingSchedule(value);
      if (bridge.showQaCustomerNotification) await bridge.showQaCustomerNotification(phase);
      setMessage('고객 상시알림 예시 표시 · ' + phase + ' · 실제 발송 없음');
    } catch (e) {setMessage(e instanceof Error ? e.message : '예시 표시 실패');}
    finally {setBusy(false);}
  }
  if (customer) return <View style={styles.box}><Text style={styles.text}>{message}</Text>
    <View style={styles.row}>{(['confirmed', 'visit', 'repair', 'completed'] as const).map((phase, index) => <View key={phase} style={styles.flex}>
      <Button secondary label={['확정 예시', '방문 예시', '정비 예시', '완료 예시'][index]} disabled={busy} onPress={() => void displayCustomer(phase)}/></View>)}</View></View>;
  return <View style={styles.box}><Text style={styles.text}>{message}</Text><View style={styles.row}>
    <View style={styles.flex}><Button secondary label="상시알림 예시" busy={busy} onPress={() => void display(true)}/></View>
    <View style={styles.flex}><Button secondary label="예시 지우기" disabled={busy} onPress={() => void display(false)}/></View>
  </View><Button secondary label="새 예약 알림 예시" disabled={busy} onPress={() => void showNewBooking()}/></View>;
}
const styles = StyleSheet.create({box: {padding: 8, gap: 4, backgroundColor: '#EAF0F9'}, row: {flexDirection: 'row', gap: 8}, flex: {flex: 1}, text: {fontSize: 11, color: '#071E55', textAlign: 'center'}});
