import React, {useCallback, useState} from 'react';
import {Alert, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {Booking} from '../../domain/types';
import {ui} from '../../theme/styles';

export function BookingInfo({booking}: {booking: Booking}) {
  const rows = [['예약자', booking.name], ['차량명', booking.model], ['차량번호', booking.car], ['연락처', booking.phone], ['방문 지점', booking.branch], ['방문 일정', booking.date + ' ' + booking.time], ['요청 정비', (booking.services || []).join(' · ')], ['요청사항', booking.memo]];
  return <View style={ui.card}><View style={ui.spread}><Text style={ui.heading}>예약 전체 정보</Text><Text style={ui.pillText}>{booking.status}</Text></View>
    {rows.map(([name, value]) => <View key={name} style={ui.stack}><View style={ui.divider}/><View style={ui.spread}><Text style={ui.muted}>{name}</Text><Text selectable style={[ui.body, {flex: 1, textAlign: 'right'}]}>{value || '없음'}</Text></View></View>)}
  </View>;
}
export function BookingsScreen() {
  const services = useServices(), nav = useNav();
  const resource = useResource(useCallback(() => services.bookings.list(), [services]));
  return <Screen title="예약 내역" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    footer={<Button label="정비 예약" onPress={() => nav.go({name: 'reserve'})}/>}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !resource.data?.length ? '아직 예약 내역이 없습니다.' : ''} onRetry={resource.reload}/>
    {resource.data?.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(row => <View key={row.id} style={ui.card}>
      <Text style={ui.pillText}>{row.status}</Text><MenuRow title={row.date + ' · ' + row.time} detail={row.branch + ' · ' + (row.services || []).join(' · ')} onPress={() => nav.go({name: 'booking', id: row.id})}/>
    </View>)}
  </Screen>;
}
export function BookingDetailScreen({id}: {id: string}) {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const resource = useResource(useCallback(() => services.account.load(), [services]));
  const row = resource.data?.bookings.find(item => item.id === id);
  const runs = row ? resource.data?.runs.filter(run => run.bookingKey === row.id) || [] : [];
  const cancellable = row && !['취소', '거절', '완료'].includes(row.status);
  async function cancel() {
    if (busy) return; setBusy(true); setError('');
    try {await services.bookings.cancel(id); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '예약을 취소하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }
  return <Screen title="예약 상세" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    footer={cancellable ? <Button secondary label="예약 취소" busy={busy} onPress={() => Alert.alert('예약 취소', '방문 예약을 취소하시겠어요? 정비가 시작된 예약은 취소할 수 없습니다.', [{text: '유지하기', style: 'cancel'}, {text: '예약 취소', style: 'destructive', onPress: () => void cancel()}])}/> : undefined}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !row ? '예약을 찾을 수 없습니다.' : ''} onRetry={resource.reload}/>
    {row ? <><Text style={ui.title}>{row.date}{ '\n' }{row.time}</Text><BookingInfo booking={row}/>{runs.map(run => <Button key={run.id} secondary label={String(run.serviceName || run.service || '정비') + ' · 정비내역 보기'} onPress={() => nav.go({name: 'work-detail', id: run.id})}/>)}<View style={ui.card}><Text style={ui.heading}>일정을 바꾸고 싶으세요?</Text>
      <Text style={ui.body}>기존 예약을 취소한 후 새 일정으로 예약할 수 있습니다. 작업이 시작되었다면 지점으로 문의해 주세요.</Text><Button secondary label="매장 문의" onPress={() => nav.go({name: 'branches'})}/></View></> : null}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
  </Screen>;
}
