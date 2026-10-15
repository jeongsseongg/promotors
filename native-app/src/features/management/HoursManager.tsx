import React, {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, Field} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {useNav, useServices} from '../../components/AppContext';
import {BranchSchedule} from '../../domain/types';
import {ui} from '../../theme/styles';
import {useManagementAction} from './Actions';

export function HoursManager() {
  const services = useServices(), nav = useNav(), [branch, setBranch] = useState('');
  const resource = useResource(useCallback(async () => {
    const [content, hours] = await Promise.all([services.publicContent.load(), services.adminContent.hours()]);
    const state = services.session.snapshot();
    return {hours, branches: content.branches.filter(row => state.role !== 'general' || state.branches.includes(row.name))};
  }, [services]));
  useEffect(() => {if (resource.data && !branch) setBranch(resource.data.branches[0]?.name || '');}, [branch, resource.data]);
  return <Screen title="영업시간 · 휴무" onBack={nav.back}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    <View style={ui.wrap}>{resource.data?.branches.map(row => <Choice key={row.name} label={row.name} selected={branch === row.name} onPress={() => setBranch(row.name)}/>)}</View>
    {resource.data && !resource.data.branches.length ? <Text style={ui.body}>담당 지점이 없습니다.</Text> : null}
    {branch && resource.data ? <HoursEditor key={branch} branch={branch} initial={resource.data.hours[branch]} onSaved={resource.reload}/> : null}
  </Screen>;
}
function HoursEditor({branch, initial, onSaved}: {branch: string; initial?: BranchSchedule; onSaved: () => Promise<void>}) {
  const services = useServices(), action = useManagementAction();
  const [days, setDays] = useState(() => Object.fromEntries(Array.from({length: 7}, (_, index) => [String(index), initial?.days?.[String(index)] || {open: false, start: '10:00', end: '18:00'}])));
  const [lunch, setLunch] = useState(!!initial?.lunchEnabled), [start, setStart] = useState(initial?.lunchStart || '12:00'), [end, setEnd] = useState(initial?.lunchEnd || '13:00');
  const [closed, setClosed] = useState((initial?.closedDates || []).join('\n'));
  const update = (key: string, patch: Partial<BranchSchedule['days'][string]>) => setDays(previous => ({...previous, [key]: {...previous[key], ...patch}}));
  return <View style={ui.stack}><Text style={ui.heading}>{branch}</Text>
    {['일', '월', '화', '수', '목', '금', '토'].map((name, index) => <View key={name} style={ui.card}>
      <Choice label={`${name}요일 · ${days[String(index)].open ? '예약 가능' : '휴무'}`} selected={days[String(index)].open} onPress={() => update(String(index), {open: !days[String(index)].open})}/>
      {days[String(index)].open ? <><Field label="시작 시간 (예: 10:00)" value={days[String(index)].start} onChangeText={value => update(String(index), {start: value})}/>
        <Field label="마감 시간 (예: 18:00)" value={days[String(index)].end} onChangeText={value => update(String(index), {end: value})}/></> : null}
    </View>)}
    <View style={ui.card}><Choice label="점심시간 예약 제한" selected={lunch} onPress={() => setLunch(!lunch)}/>
      {lunch ? <><Field label="점심 시작" value={start} onChangeText={setStart}/><Field label="점심 종료" value={end} onChangeText={setEnd}/></> : null}
      <Field label="추가 휴무일 (한 줄에 하나 · 예: 2026.12.25)" value={closed} onChangeText={setClosed} multiline/>
      <Text style={ui.error}>{action.error}</Text><Text style={ui.body}>{action.notice}</Text>
      <Button label="영업시간 저장" busy={action.busy} onPress={() => void action.run(() => services.adminContent.saveHours(branch, {...initial, days, lunchEnabled: lunch, lunchStart: start, lunchEnd: end,
        closedDates: closed.split(/[\n,]+/).map(value => value.trim()).filter(Boolean)}), () => {action.setNotice('영업시간을 저장했어요.'); void onSaved();})}/></View>
  </View>;
}
