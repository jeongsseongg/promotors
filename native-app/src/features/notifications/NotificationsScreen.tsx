import React, {useCallback, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {Route, useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {NotificationTarget} from '../../domain/types';
import {ui} from '../../theme/styles';

export function routeForNotification(target: NotificationTarget, admin: boolean): Route {
  if (target.kind === 'booking' && target.id) return {name: admin ? 'admin-booking' : 'booking', id: target.id, notice: target.actionFailed ? '알림에서 예약 처리를 완료하지 못했습니다. 최신 정보를 확인하고 아래 버튼으로 다시 처리해 주세요.' : target.actionCompleted ? '알림의 처리 결과입니다. 아래 최신 예약 상태를 확인해 주세요.' : undefined};
  if (target.kind === 'bookingSchedule') return {name: admin ? 'admin' : 'bookings'};
  if (target.kind === 'repair') return admin ? {name: 'management', section: 'work', id: target.id} : {name: 'work'};
  if (target.kind === 'inquiry') return admin ? {name: 'management', section: 'inquiries', id: target.id} : {name: 'inquiry'};
  if (target.kind === 'events') return admin ? {name: 'management', section: 'promotions'} : {name: 'events'};
  return {name: 'notifications'};
}
export function NotificationsScreen() {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const resource = useResource(useCallback(() => services.notifications.state(), [services]));
  useForegroundRefresh(resource.reload, 15000);
  async function open(id: string) {
    if (busy) return; setBusy(id); setError('');
    try {const target = await services.notifications.resolve(id); await services.notifications.read(id); nav.go(routeForNotification(target, !!resource.data?.admin));}
    catch (e) {setError(e instanceof Error ? e.message : '알림 상세를 열지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy('');}
  }
  async function readAll() {
    if (busy) return; setBusy('all'); setError('');
    try {await services.notifications.read(); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '읽음 처리를 완료하지 못했습니다.');}
    finally {setBusy('');}
  }
  return <Screen title="알림" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    action={<Button secondary label="설정" onPress={() => nav.go({name: 'notification-settings'})}/>} testID="notification-inbox">
    <Text style={ui.title}>프로모터스 알림</Text><Text style={ui.muted}>예약과 정비 소식을 확인하세요. 예약 승인은 상세 화면에서 처리할 수 있습니다.</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !resource.data?.items.length ? '아직 도착한 알림이 없습니다.' : ''} onRetry={resource.reload}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {resource.data?.items.length ? <Button secondary label="모두 읽음" busy={busy === 'all'} onPress={() => void readAll()}/> : null}
    {resource.data?.items.map(row => <Pressable key={row.id} accessibilityRole="button" disabled={!!busy} onPress={() => void open(row.id)} style={ui.card}>
      <View style={ui.spread}><Text style={ui.pillText}>{row.category === 'booking' ? '예약' : row.category === 'repair' ? '정비' : row.category === 'reminders' ? '일정' : '소식'}</Text>
        <Text style={ui.muted}>{row.read_at ? '읽음' : '새 알림'}</Text></View>
      <Text style={ui.heading}>{row.title}</Text><Text style={ui.body}>{row.body}</Text>
      <Text style={ui.muted}>{new Date(row.created_at).toLocaleString('ko-KR')}</Text><Text style={ui.pillText}>상세 확인 ›</Text>
    </Pressable>)}
  </Screen>;
}
