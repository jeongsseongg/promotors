import React, {useCallback, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {availableSlots} from '../../domain/booking-hours';
import {BookingInput} from '../../domain/types';
import {Calendar, dateKey, monthRange} from './Calendar';
import {GuestFields, GuestValues, ServiceFields, validateGuest} from './BookingForm';
import {ui} from '../../theme/styles';
import {BookingHeader, ReserveEntry} from './ReserveEntry';
import {bookingEntryStyles as styles} from './bookingEntryStyles';

function useReservation() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const [month, setMonth] = useState(new Date()), [branch, setBranch] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState('');
  const [step, setStep] = useState(0), [selected, setSelected] = useState<string[]>([]), [memo, setMemo] = useState(''), [guestEntry, setGuestEntry] = useState(false);
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
  const changeBranch = (value: string) => {setBranch(value); setDate(''); setTime(''); setError('');};
  const back = () => {if (step) setStep(0); else if (branch) changeBranch(''); else if (guestEntry) setGuestEntry(false); else nav.back();};
  return {session, nav, month, branch, date, time, setDate, setTime, step, setStep, selected, setSelected, memo, setMemo, guestEntry, setGuestEntry,
    guest, setGuest, busy, error, done, setup, occupied, slots, submit, changeMonth, changeBranch, back};
}
type Reservation = ReturnType<typeof useReservation>;
export function ReserveScreen() {
  const value = useReservation(), {session, nav, branch, step, done, setup, error, busy, time, occupied} = value;
  if (!session.authenticated && !value.guestEntry) return <ReserveEntry onGuest={() => value.setGuestEntry(true)}/>;
  if (done) return <Screen title="예약 신청 완료" plain hideHeader onBack={() => nav.go({name: 'home'})} contentStyle={styles.content}>
    <BookingHeader title="예약 신청 완료" onClose={() => nav.go({name: 'home'})}/><View style={styles.resultBody}><Text style={styles.heading}>예약 신청이 접수되었어요.</Text>
    <Text style={styles.body}>{done}</Text><Text style={styles.body}>매장에서 확인하면 예약이 확정됩니다. 알림과 예약 내역에서 확인해 주세요.</Text>
    {!session.authenticated ? <Text style={styles.hint}>직접 입력한 예약 확인번호로 비회원 예약을 조회할 수 있습니다.</Text> : null}
    <Button brand appearance="modal" label="예약 확인" onPress={() => nav.go({name: session.authenticated ? 'bookings' : 'guest-lookup'})}/></View></Screen>;
  const title = !branch ? session.authenticated ? '예약 지점 선택' : '비회원 예약' : branch + ' 정비예약';
  return <Screen title="정비 예약" plain hideHeader onBack={value.back} testID="reserve-screen" contentStyle={styles.content}>
    <BookingHeader title={title} onClose={nav.back}/><DataState loading={setup.loading && !setup.data} error={setup.error} onRetry={setup.reload}/>
    {!branch ? <BookingBranches value={value}/> : step ? <View style={ui.stack}>
      <View style={styles.summary}><Text style={styles.heading}>{branch}</Text><Text style={styles.summaryText}>{value.date} · {time}</Text></View>
      {!session.authenticated ? <GuestFields values={value.guest} onChange={value.setGuest}/> : <Text style={styles.summaryText}>{session.profile?.name} · {session.profile?.model} · {session.profile?.car}</Text>}
      <ServiceFields products={setup.data?.content.products || []} selected={value.selected} onSelect={value.setSelected} memo={value.memo} onMemo={value.setMemo}/>
    </View> : <BookingSchedule value={value}/>}
    {error ? <Text accessibilityRole="alert" style={[ui.error, styles.formError]}>{error}</Text> : null}
    {branch && (step || value.date) ? <View style={[styles.actions, styles.formActions]}><View style={styles.flex}><Button brand appearance="modal" label={step ? '예약 신청' : '다음'} busy={busy}
      disabled={!step && (!time || occupied.loading || !!occupied.error)} onPress={() => step ? void value.submit() : value.setStep(1)} testID="reserve-next"/></View>
      <View style={styles.cancel}><Button brand secondary appearance="modal" label={step ? '이전' : '취소'} onPress={value.back}/></View></View> : null}
  </Screen>;
}
function BookingBranches({value}: {value: Reservation}) {
  return <View style={value.session.authenticated ? styles.branches : styles.guestBranches}>{!value.session.authenticated ? <Pressable accessibilityRole="button" accessibilityLabel="예약 확인하기"
    onPress={() => value.nav.go({name: 'guest-lookup'})} style={[styles.branch, styles.lookup]}><Text style={[styles.branchText, styles.lookupText]}>예약 확인하기</Text></Pressable> : null}
    <View style={[styles.branches, !value.session.authenticated && styles.guestBranchList]}>{value.setup.data?.content.branches.map(row => <Choice key={row.name} label={row.name} appearance="branch"
      selected={value.branch === row.name} onPress={() => value.changeBranch(row.name)}/>)}</View>
  </View>;
}
function BookingSchedule({value}: {value: Reservation}) {
  const {session, branch, date, month, setup, occupied, slots, time} = value;
  return <View style={ui.stack}>{session.profile ? <View style={styles.summary}><Text style={styles.summaryText}>{session.profile.car || '-'} · {session.profile.model || '차량명 미입력'} ({session.profile.name || '고객'}님)</Text></View> : null}
    <Calendar month={month} selected={date} onMonth={value.changeMonth} onSelect={key => {value.setDate(key); value.setTime('');}}
      disabledDate={key => key < dateKey(new Date()) || (!!setup.data && !availableSlots(setup.data.hours, branch, key, []).some(slot => slot.available))}/>
    <DataState loading={occupied.loading && !occupied.data} error={occupied.error} onRetry={occupied.reload}/>
    {date ? <View style={ui.stack}><Text style={styles.heading}>{date} 예약 시간 선택</Text><View style={styles.slots}>{slots.map(slot => {
      const disabled = !slot.available || occupied.loading || !!occupied.error, active = time === slot.time;
      return <View key={slot.time} style={styles.slotWrap}><Choice appearance="slot" label={slot.time + (slot.available ? '' : '\n' + (slot.reason || '예약마감'))}
        selected={active} disabled={disabled} onPress={() => value.setTime(slot.time)}/></View>;
    })}</View></View> : <Text style={styles.hint}>날짜를 선택하면 예약 가능한 시간이 표시됩니다.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="지점 다시 선택" onPress={() => value.changeBranch('')} style={styles.link}><Text style={styles.linkText}>지점 다시 선택</Text></Pressable>
  </View>;
}
