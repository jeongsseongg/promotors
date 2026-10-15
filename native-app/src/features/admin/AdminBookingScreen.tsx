import React, {useCallback, useState} from 'react';
import {Alert, Linking, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {BookingInfo} from '../booking/BookingScreens';
import {CustomerHistory} from './CustomerHistory';
import {ui} from '../../theme/styles';

export function AdminBookingScreen({id}: {id: string}) {
  const services = useServices(), nav = useNav();
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const resource = useResource(useCallback(() => services.adminBookings.get(id), [services, id]));
  const row = resource.data?.booking, pending = row && ['신규', '승인대기'].includes(row.status);
  async function decide(reject: boolean) {
    if (busy) return;
    if (reject && !reason.trim()) {setError('예약 거절 사유를 입력해 주세요.'); return;}
    setBusy(true); setError(''); setMessage('');
    try {
      const result = reject ? await services.adminBookings.reject(id, reason.trim()) : await services.adminBookings.accept(id);
      setMessage(result.changed ? (reject ? '예약을 거절했습니다.' : '예약을 승인했습니다.') : '이미 처리된 예약입니다. 최신 상태를 확인해 주세요.');
      setRejecting(false); setReason(''); await resource.reload();
    } catch (e) {setError(e instanceof Error ? e.message : '예약 처리를 완료하지 못했습니다.');}
    finally {setBusy(false);}
  }
  async function callCustomer() {
    const number = (row?.phone || '').replace(/[^0-9+]/g, '');
    if (!/^\+?[0-9]{8,15}$/.test(number)) return;
    try {await Linking.openURL('tel:' + number);} catch {Alert.alert('연결할 수 없어요', '전화 앱을 확인해 주세요.');}
  }
  return <Screen title="예약 상세" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload} testID="admin-booking-detail"
    footer={pending ? <View style={ui.row}><View style={ui.flex}><Button secondary label={rejecting ? '거절 취소' : '예약 거절'} disabled={busy} onPress={() => setRejecting(!rejecting)}/></View>
      <View style={ui.flex}><Button label={rejecting ? '거절 확정' : '예약 승인'} danger={rejecting} busy={busy} onPress={() => void decide(rejecting)} testID="booking-decision"/></View></View> : undefined}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {row ? <><View style={ui.card}><Text style={ui.pillText}>{pending ? '처리 대기' : row.status}</Text><Text style={ui.title}>{row.name || '예약 고객'}</Text><Text style={ui.heading}>{row.model || '차량명 미등록'}</Text><Text style={ui.body}>{row.car || '차량번호 미등록'}</Text></View>
      {message ? <Text accessibilityRole="alert" style={ui.body}>{message}</Text> : null}
      {rejecting ? <View style={ui.card}><Text style={ui.heading}>예약 거절 사유</Text><Field label="거절 사유" multiline value={reason} onChangeText={setReason} maxLength={200} placeholder="예약을 받을 수 없는 이유를 입력해 주세요."/>
        <Text style={ui.muted}>확정하면 이 예약이 취소 처리됩니다.</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      <BookingInfo booking={row}/>{String(row.rejectionReason || '') ? <View style={ui.card}><Text style={ui.label}>거절 사유</Text><Text style={ui.body}>{String(row.rejectionReason)}</Text></View> : null}
      {row.phone ? <Button secondary label="고객에게 전화" onPress={() => void callCustomer()}/> : null}
      <CustomerHistory context={resource.data?.customerContext}/></> : null}
  </Screen>;
}
