import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field, MenuRow} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {useNav, useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';
import {koreanDay, useManagementAction, confirmAction} from './Actions';

export function CustomersManager({id}: {id?: string}) {
  const services = useServices(), nav = useNav(), [query, setQuery] = useState(''), [limit, setLimit] = useState(50);
  const resource = useResource(useCallback(async () => id ? services.adminCustomers.get(id) : services.adminCustomers.list(), [services, id]));
  if (resource.data && !Array.isArray(resource.data)) return <CustomerEditor data={resource.data} reload={resource.reload}/>;
  const members = Array.isArray(resource.data) ? resource.data.filter(row => `${row.name} ${row.car} ${row.phone}`.includes(query)) : [];
  return <Screen title="고객 관리" onBack={nav.back} onRefresh={resource.reload} refreshing={resource.loading}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    <Field label="이름·차량번호·전화번호 검색" value={query} onChangeText={setQuery}/>
    {members.slice(0, limit).map(member => <View style={ui.card} key={member.id}><MenuRow title={`${member.name || '회원'} · ${member.car || ''}`}
      detail={`${member.model || ''} · ${member.phone || ''}`} onPress={() => nav.go({name: 'management', section: 'customers', id: member.id})}/></View>)}
    {members.length > limit ? <Button secondary label="더 보기" onPress={() => setLimit(limit + 50)}/> : null}
  </Screen>;
}
type CustomerData = Awaited<ReturnType<ReturnType<typeof useServices>['adminCustomers']['get']>>;
function CustomerEditor({data, reload}: {data: CustomerData; reload: () => Promise<void>}) {
  const services = useServices(), nav = useNav(), action = useManagementAction(), {profile, file} = data;
  const [memoId, setMemoId] = useState<string>(), [title, setTitle] = useState(''), [body, setBody] = useState('');
  const [date, setDate] = useState(koreanDay()), [service, setService] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('');
  const saved = () => {action.setNotice('저장했어요.'); void reload();};
  return <Screen title="고객 상세" onBack={nav.back}><View style={ui.card}><Text style={ui.title}>{profile.name}</Text>
    <Text style={ui.heading}>{profile.car} · {profile.model}</Text><Text selectable style={ui.body}>{profile.phone}</Text><Text style={ui.muted}>{profile.email} {profile.address}</Text></View>
    <Text style={ui.error}>{action.error}</Text><Text style={ui.body}>{action.notice}</Text>
    <View style={ui.card}><Text style={ui.heading}>고객 메모</Text>{file.memoEntries?.map((entry, index) => <View key={String(entry.id || index)} style={ui.stack}>
      <Text style={ui.label}>{String(entry.title || '메모')}</Text><Text style={ui.body}>{String(entry.body || '')}</Text><Text style={ui.muted}>{String(entry.createdAt || '')}</Text>
      <Button secondary label="메모 수정" onPress={() => {setMemoId(String(entry.id)); setTitle(String(entry.title || '')); setBody(String(entry.body || ''));}}/></View>)}
      <Field label="메모 제목" value={title} onChangeText={setTitle}/><Field label="메모 내용" value={body} onChangeText={setBody} multiline/>
      <Button label={memoId ? '메모 수정 저장' : '메모 추가'} busy={action.busy} onPress={() => void action.run(() => services.adminCustomers.saveMemo(profile.id, {id: memoId, title, body}), () => {setMemoId(undefined); setTitle(''); setBody(''); saved();})}/></View>
    <View style={ui.card}><Text style={ui.heading}>정비 기록</Text>{file.records?.map((record, index) => <View key={String(record.id || index)} style={ui.stack}>
      <Text style={ui.label}>{String(record.date || '')} · {String(record.service || '')}</Text><Text style={ui.body}>{String(record.note || '')}</Text></View>)}
      <Field label="정비일 (예: 2026.10.15)" value={date} onChangeText={setDate}/><Field label="정비 항목" value={service} onChangeText={setService}/>
      <Field label="내용" value={note} onChangeText={setNote} multiline/>
      <Button label="정비 기록 추가" busy={action.busy} onPress={() => void action.run(() => services.adminCustomers.saveRecord(profile.id, {date, service, note}), saved)}/></View>
    <View style={ui.card}><Text style={ui.heading}>작업 내역 · {data.runs.length}건</Text>{data.runs.map(run => <MenuRow key={run.id} title={run.service || '정비 작업'}
      detail={`${run.bookingDate || ''} · ${run.branch} · ${run.status || ''}`} onPress={() => nav.go({name: 'management', section: 'work', id: run.id})}/>)}</View>
    <View style={ui.card}><Field label="이용 제한 사유" value={reason} onChangeText={setReason}/><Button danger label="고객 이용 제한" busy={action.busy}
      onPress={() => void confirmAction('고객 이용 제한', '이 고객의 로그인을 제한할까요? 정비 기록은 보관합니다.', '이용 제한', true).then(yes => {if (yes) void action.run(() => services.adminCustomers.restrict(profile.id, reason), nav.back);})}/></View>
  </Screen>;
}
