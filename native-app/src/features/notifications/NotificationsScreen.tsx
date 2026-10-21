import React, {useCallback, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {Route, useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {NotificationTarget} from '../../domain/types';
import {BookingCard} from '../admin/BookingCard';
import {inboxStyles as n} from './inboxStyles';
import {ui} from '../../theme/styles';

export function routeForNotification(target: NotificationTarget, admin: boolean): Route {
  if (target.kind === 'booking' && target.id) return {name: admin ? 'admin-booking' : 'booking', id: target.id, notice: target.actionFailed ? '알림에서 예약 처리를 완료하지 못했습니다. 최신 정보를 확인하고 아래 버튼으로 다시 처리해 주세요.' : target.actionCompleted ? '알림의 처리 결과입니다. 아래 최신 예약 상태를 확인해 주세요.' : undefined};
  if (target.kind === 'bookingSchedule') return {name: admin ? 'admin' : 'bookings'};
  if (target.kind === 'repair') return admin ? {name: 'management', section: 'work', id: target.id} : target.id ? {name: 'work-detail', id: target.id} : {name: 'work'};
  if (target.kind === 'inquiry') return admin ? {name: 'management', section: 'inquiries', id: target.id} : {name: 'inquiry'};
  if (target.kind === 'events') return admin ? {name: 'management', section: 'promotions'} : {name: 'events'};
  return {name: 'notifications'};
}
export function NotificationsScreen() {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const session = services.session.snapshot(), admin = session.authenticated && session.role !== 'customer';
  const resource = useResource(useCallback(async () => {
    const [state, queue] = await Promise.all([services.notifications.state(), admin ? services.adminBookings.list() : Promise.resolve({items: []})]);
    return {...state, pending: queue.items};
  }, [services, admin]));
  useForegroundRefresh(resource.reload, 15000);
  async function open(id: string) {
    if (busy) return; setBusy(id); setError('');
    try {const target = await services.notifications.resolve(id); await services.notifications.read(id); nav.go(routeForNotification(target, admin));}
    catch (e) {setError(e instanceof Error ? e.message : '알림 상세를 열지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy('');}
  }
  async function decide(id: string, reason?: string) {
    if (busy) return; setBusy(id); setError(''); setMessage('');
    try {
      const result = reason ? await services.adminBookings.reject(id, reason) : await services.adminBookings.accept(id);
      setMessage(result.changed ? (reason ? '예약을 거절했습니다.' : '예약을 승인했습니다.') : '이미 처리된 예약입니다. 최신 상태를 확인해 주세요.');
      await resource.reload();
    } catch (e) {setError(e instanceof Error ? e.message : '예약을 처리하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy('');}
  }
  async function readAll() {
    if (busy) return; setBusy('all'); setError('');
    try {await services.notifications.read(); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '읽음 처리를 완료하지 못했습니다.');}
    finally {setBusy('');}
  }
  const items = resource.data?.items || [], unread = items.filter(row => !row.read_at).length;
  return <Screen title="알림" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    action={<Pressable accessibilityRole="button" onPress={() => nav.go({name: 'notification-settings'})} style={n.read}><Text style={n.readText}>설정</Text></Pressable>} testID="notification-inbox">
    <View style={n.top}><View><Text style={n.heading}>프로모터스 알림</Text><Text style={n.caption}>새 알림 {unread}개</Text></View>
      {items.length ? <Button secondary label="모두 읽음" busy={busy === 'all'} onPress={() => void readAll()}/> : null}</View>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !items.length ? '아직 도착한 알림이 없습니다.' : ''} onRetry={resource.reload}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}{message ? <Text accessibilityRole="alert" style={ui.body}>{message}</Text> : null}
    {items.map(row => {
      const pending = admin && row.target?.kind === 'booking' ? resource.data?.pending.find(booking => booking.id === row.target?.id) : undefined;
      const stamp = new Date(row.created_at).toLocaleString('ko-KR', {month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
      const category = row.category === 'booking' ? '예약' : row.category === 'repair' ? '정비' : row.category === 'reminders' ? '일정' : '소식';
      return pending ? <View key={row.id} style={n.pending}><View style={[n.row, n.meta]}><Text style={n.category}>확인할 예약</Text><Text style={n.caption}>{stamp}</Text></View>
        <BookingCard booking={pending} busy={!!busy} openTestID={'notification-open-' + row.id} onOpen={() => void open(row.id)}
          onAccept={() => void decide(pending.id)} onReject={reason => void decide(pending.id, reason)}/></View>
        : <Pressable key={row.id} accessibilityRole="button" disabled={!!busy} testID={'notification-open-' + row.id} onPress={() => void open(row.id)}
          style={[n.list, n.item, !row.read_at && n.unread]}><View style={n.row}><Text style={n.category}>{category}</Text><Text style={n.caption}>{stamp}</Text></View>
          <View style={n.titleRow}>{!row.read_at ? <View accessibilityLabel="새 알림" style={n.dot}/> : null}<Text style={[n.title, n.flex]}>{row.title}</Text><Text style={n.readText}>›</Text></View>
          <Text style={n.body}>{row.body}</Text>
        </Pressable>;
    })}
  </Screen>;
}
