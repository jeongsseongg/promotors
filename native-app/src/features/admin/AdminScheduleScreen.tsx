import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {Calendar, dateKey} from '../booking/Calendar';
import {BookingCard} from './BookingCard';
import {ui} from '../../theme/styles';

export function AdminScheduleScreen() {
  const services = useServices(), nav = useNav(), session = services.session.snapshot();
  const role = session.role, branchKey = session.branches.join('|');
  const [month, setMonth] = useState(new Date()), [date, setDate] = useState(dateKey(new Date())), [branch, setBranch] = useState('');
  const [view, setView] = useState<'pending' | 'calendar'>('pending'), [busyId, setBusyId] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const resource = useResource(useCallback(async () => {
    const [queue, schedule, content] = await Promise.all([services.adminBookings.list(), services.adminBookings.schedule(), services.publicContent.load()]);
    return {queue, schedule, branches: content.branches.filter(row => role !== 'general' || branchKey.split('|').includes(row.name))};
  }, [services, role, branchKey]));
  useForegroundRefresh(resource.reload, 12000);
  const all = resource.data?.schedule.filter(row => !branch || row.branch === branch) || [];
  const rows = view === 'pending' ? resource.data?.queue.items.filter(row => !branch || row.branch === branch) || [] : all.filter(row => row.date === date);
  const counts = all.reduce<Record<string, number>>((result, row) => {if (!['취소', '거절'].includes(row.status)) result[row.date] = (result[row.date] || 0) + 1; return result;}, {});
  async function accept(id: string) {
    if (busyId) return; setBusyId(id); setError(''); setMessage('');
    try {const result = await services.adminBookings.accept(id); setMessage(result.changed ? '예약을 승인했습니다.' : '이미 처리된 예약입니다. 최신 상태를 확인해 주세요.'); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '예약을 승인하지 못했습니다.');}
    finally {setBusyId('');}
  }
  return <Screen title="예약관리" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    action={<Button secondary label="알림" onPress={() => nav.go({name: 'notifications'})}/>} testID="admin-schedule">
    <Text style={ui.title}>매장 예약 일정</Text>
    <View style={ui.row}><Choice label={'처리 대기 ' + (resource.data?.queue.items.length || 0)} selected={view === 'pending'} onPress={() => setView('pending')}/><Choice label="전체 일정" selected={view === 'calendar'} onPress={() => setView('calendar')}/></View>
    <View style={ui.wrap}>{session.role !== 'general' ? <Choice label="전체 지점" selected={!branch} onPress={() => setBranch('')}/> : null}
      {resource.data?.branches.map(row => <Choice key={row.name} label={row.name} selected={branch === row.name} onPress={() => setBranch(row.name)}/>)}</View>
    {view === 'calendar' ? <View style={ui.card}><Calendar month={month} selected={date} onMonth={setMonth} onSelect={setDate} counts={counts}/></View> : <Text style={ui.muted}>읽은 예약도 승인·거절 전까지 처리 대기함에 남습니다.</Text>}
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !rows.length ? (session.role === 'general' && !session.branches.length ? '배정된 지점이 없습니다. 메인관리자에게 문의해 주세요.' : '표시할 예약이 없습니다.') : ''} onRetry={resource.reload}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}{message ? <Text accessibilityRole="alert" style={ui.body}>{message}</Text> : null}
    {rows.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(row => <BookingCard key={row.id} booking={row}
      busy={!!busyId} onOpen={() => nav.go({name: 'admin-booking', id: row.id})} onAccept={['신규', '승인대기'].includes(row.status) ? () => void accept(row.id) : undefined}/>)}
  </Screen>;
}
