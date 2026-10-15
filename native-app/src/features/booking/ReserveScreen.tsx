import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {availableSlots} from '../../domain/booking-hours';
import {BookingInput} from '../../domain/types';
import {Calendar, dateKey, monthRange} from './Calendar';
import {GuestFields, GuestValues, ServiceFields, validateGuest} from './BookingForm';
import {ui} from '../../theme/styles';

export function ReserveScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const [month, setMonth] = useState(new Date()), [branch, setBranch] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState('');
  const [step, setStep] = useState(0), [selected, setSelected] = useState<string[]>([]), [memo, setMemo] = useState('');
  const [guest, setGuest] = useState<GuestValues>({name: '', phone: '', car: '', model: '', bookingPin: '', agreed: false});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const setup = useResource(useCallback(async () => {
    const [content, hours] = await Promise.all([services.publicContent.load(), services.bookings.hours()]);
    return {content, hours};
  }, [services]));
  const occupied = useResource(useCallback(() => {
    const range = monthRange(month);
    return branch ? services.bookings.availability(branch, range.from, range.to) : Promise.resolve([]);
  }, [services, branch, month]));
  const slots = setup.data && date ? availableSlots(setup.data.hours, branch, date, occupied.data || []) : [];
  async function submit() {
    if (busy) return; setError('');
    if (!branch || !date || !time) {setError('방문 지점과 날짜, 시간을 선택해 주세요.'); return;}
    if (!selected.length && !memo.trim()) {setError('정비 항목을 선택하거나 요청사항을 입력해 주세요.'); return;}
    if (!session.authenticated) {const invalid = validateGuest(guest); if (invalid) {setError(invalid); return;}}
    setBusy(true);
    try {
      const input: BookingInput = {branch, date, time, services: selected, memo: memo.trim()};
      const saved = session.authenticated ? await services.bookings.create(input) : await services.guest.create({...input, name: guest.name, model: guest.model, car: guest.car, phone: guest.phone, bookingPin: guest.bookingPin});
      setDone(saved.date + ' ' + saved.time + ' · ' + saved.branch);
    } catch (e) {setError(e instanceof Error ? e.message : '예약을 접수하지 못했습니다. 다시 시도해 주세요.'); void occupied.reload();}
    finally {setBusy(false);}
  }
  const changeMonth = (value: Date) => {setMonth(value); setDate(''); setTime('');};
  if (done) return <Screen title="예약 신청 완료" onBack={() => nav.go({name: 'home'})}>
    <View style={ui.card}><Text style={ui.title}>예약 신청이{ '\n' }접수되었어요.</Text><Text style={ui.heading}>{done}</Text>
      <Text style={ui.body}>매장에서 확인하면 예약이 확정됩니다. 알림과 예약 내역에서 확인해 주세요.</Text>
      {!session.authenticated ? <Text style={ui.muted}>직접 입력한 예약 확인번호로 비회원 예약을 조회할 수 있습니다.</Text> : null}
      <Button label="예약 확인" onPress={() => nav.go({name: session.authenticated ? 'bookings' : 'guest-lookup'})}/></View>
  </Screen>;
  return <Screen title="정비 예약" onBack={() => step ? setStep(0) : nav.back()} testID="reserve-screen"
    footer={<>{error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}<Button label={step ? '예약 신청' : '다음'} busy={busy}
      disabled={!step && (!time || occupied.loading || !!occupied.error)} onPress={() => step ? void submit() : setStep(1)} testID="reserve-next"/></>}>
    <Text style={ui.muted}>{step ? '2 / 2  정비 요청' : '1 / 2  방문 일정'}</Text>
    <DataState loading={setup.loading && !setup.data} error={setup.error} onRetry={setup.reload}/>
    {step ? <View style={ui.stack}><View style={ui.card}><Text style={ui.heading}>{branch}</Text><Text style={ui.body}>{date} · {time}</Text></View>
      {!session.authenticated ? <GuestFields values={guest} onChange={setGuest}/> : <Text style={ui.body}>{session.profile?.name} · {session.profile?.model} · {session.profile?.car}</Text>}
      <ServiceFields products={setup.data?.content.products || []} selected={selected} onSelect={setSelected} memo={memo} onMemo={setMemo}/>
    </View> : <View style={ui.stack}>
      {!session.authenticated ? <Button secondary label="회원 로그인" onPress={() => nav.go({name: 'login'})}/> : null}
      <Text style={ui.heading}>방문할 지점을 선택하세요.</Text>
      <View style={ui.wrap}>{setup.data?.content.branches.map(row => <Choice key={row.name} label={row.name} selected={branch === row.name}
        onPress={() => {setBranch(row.name); setDate(''); setTime('');}}/>)}</View>
      {branch ? <View style={ui.card}><Calendar month={month} selected={date} onMonth={changeMonth} onSelect={value => {setDate(value); setTime('');}}
        disabledDate={key => key < dateKey(new Date()) || (!!setup.data && !availableSlots(setup.data.hours, branch, key, []).some(slot => slot.available))}/></View> : null}
      {branch ? <DataState loading={occupied.loading && !occupied.data} error={occupied.error} onRetry={occupied.reload}/> : null}
      {date ? <View style={ui.stack}><Text style={ui.heading}>{date} 방문 시간</Text><View style={ui.wrap}>{slots.map(slot => <Choice key={slot.time}
        label={slot.time + (slot.available ? '' : ' · ' + (slot.reason || '예약마감'))} selected={time === slot.time}
        disabled={!slot.available || occupied.loading || !!occupied.error} onPress={() => setTime(slot.time)}/>)}</View></View> : null}
    </View>}
  </Screen>;
}
