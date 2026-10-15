import React, {useState} from 'react';
import {Alert, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {Booking} from '../../domain/types';
import {BookingInfo} from './BookingScreens';
import {ui} from '../../theme/styles';

export function GuestLookupScreen() {
  const services = useServices(), nav = useNav();
  const [phone, setPhone] = useState(''), [pin, setPin] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [booking, setBooking] = useState<Booking>();
  async function lookup() {
    if (busy) return;
    if (!phone.trim() || !pin.trim()) {setError('예약할 때 입력한 휴대폰번호와 확인번호를 입력해 주세요.'); return;}
    setBusy(true); setError(''); setBooking(undefined);
    try {const found = await services.guest.lookup(phone, pin); setBooking(found || undefined); if (!found) setError('입력 정보와 일치하는 예약이 없습니다. 휴대폰번호와 확인번호를 확인해 주세요.');}
    catch (e) {setError(e instanceof Error ? e.message : '예약을 확인하지 못했습니다. 입력 정보를 확인해 주세요.');}
    finally {setBusy(false);}
  }
  async function cancel() {
    if (!booking || busy) return; setBusy(true); setError('');
    try {setBooking(await services.guest.cancel(booking.id, phone, pin));}
    catch (e) {setError(e instanceof Error ? e.message : '예약 취소를 완료하지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <Screen title="비회원 예약 조회" onBack={nav.back}>
    <Text style={ui.title}>신청한 예약을{ '\n' }확인하세요.</Text>
    <Field label="휴대폰번호" value={phone} onChangeText={value => {setPhone(value); setBooking(undefined);}} keyboardType="phone-pad"/>
    <Field label="예약 확인번호" value={pin} onChangeText={value => {setPin(value); setBooking(undefined);}} keyboardType="number-pad" secureTextEntry maxLength={8}/>
    <Button label="예약 조회" busy={busy} onPress={() => void lookup()}/>{error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {booking ? <View style={ui.stack}><BookingInfo booking={booking}/>{!['취소', '거절', '완료'].includes(booking.status) ? <Button secondary label="예약 취소" busy={busy}
      onPress={() => Alert.alert('예약 취소', '이 방문 예약을 취소하시겠어요?', [{text: '유지하기', style: 'cancel'}, {text: '예약 취소', style: 'destructive', onPress: () => void cancel()}])}/> : null}</View> : null}
    <Text style={ui.muted}>확인번호를 잊으셨다면 예약 지점으로 문의해 주세요.</Text><Button secondary label="매장 문의" onPress={() => nav.go({name: 'branches'})}/>
  </Screen>;
}
