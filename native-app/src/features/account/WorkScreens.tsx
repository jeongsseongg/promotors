import React, {useCallback, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import {ServiceRun} from '../../domain/types';
import {runName} from './runDisplay';
import {ui} from '../../theme/styles';
import {color} from '../../theme/tokens';
import {WorkProgress} from './WorkProgress';
import {workProgress as progress} from './workProgressStyles';

function newestFirst(a: ServiceRun, b: ServiceRun) {
  const stamp = (run: ServiceRun) => {
    const value = Date.parse(String(run.createdAt || String(run.bookingDate || '').replace(/\./g, '-')));
    return Number.isFinite(value) ? value : 0;
  };
  return stamp(b) - stamp(a);
}

export function WorkScreen({history = false, id}: {history?: boolean; id?: string}) {
  const services = useServices(), nav = useNav(), [photo, setPhoto] = useState('');
  const resource = useResource(useCallback(() => services.account.load(), [services]));
  useForegroundRefresh(resource.reload, 30000);
  const runs = [...(resource.data?.runs || [])].sort(newestFirst);
  const selected = id ? runs.find(run => run.id === id) : history ? undefined : runs[0];
  const previous = id ? [] : history ? runs : runs.slice(1);
  const booking = selected?.bookingKey ? resource.data?.bookings.find(row => row.id === selected.bookingKey) : undefined;
  const empty = id ? !selected : !runs.length;
  return <Screen title={id ? '정비 상세' : history ? '정비 이력' : '작업사진·현황'} plain onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload} contentStyle={progress.screen}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && empty ? (id ? '정비 내역을 찾을 수 없습니다.' : history ? '아직 등록된 정비 이력이 없습니다.' : '지금은 진행 중인 작업이 없어요. 예약 후 차량이 입고되면 작업 과정을 사진으로 확인할 수 있어요.') : ''} onRetry={resource.reload}/>
    {booking ? <Button secondary label="예약 정보 보기" onPress={() => nav.go({name: 'booking', id: booking.id})}/> : null}
    {selected ? <WorkProgress key={selected.id} run={selected} onPhoto={setPhoto}/> : null}
    {previous.length ? <PastWorkList runs={previous} title={history ? '정비 기록' : '지난 작업기록'}/> : null}
    {history && !id && resource.data?.bookings.length ? <View style={ui.card}><Text style={ui.heading}>방문 예약 기록</Text>
      {resource.data.bookings.map(row => <Pressable accessibilityRole="button" key={row.id} onPress={() => nav.go({name: 'booking', id: row.id})}>
        <Text style={ui.label}>{row.date} {row.time} · {row.status}</Text><Text style={ui.muted}>{row.branch} · {(row.services || []).join(' · ')}</Text></Pressable>)}</View> : null}
    <Button brand label="내예약" onPress={() => nav.go({name: 'my'})}/>
    <Modal visible={!!photo} onRequestClose={() => setPhoto('')} animationType="fade"><SafeAreaView style={styles.photoShell}>
      <Button secondary label="사진 닫기" onPress={() => setPhoto('')}/><Image accessibilityLabel="정비 작업사진" source={{uri: photo, cache: 'reload', headers: {'Cache-Control': 'no-store'}}} style={styles.photo} resizeMode="contain"/></SafeAreaView></Modal>
  </Screen>;
}
function PastWorkList({runs, title}: {runs: ServiceRun[]; title: string}) {
  const nav = useNav();
  return <View style={progress.history}><Text accessibilityRole="header" style={progress.historyTitle}>{title}</Text>
    {runs.map(run => <Pressable key={run.id} accessibilityRole="button" accessibilityLabel={`${runName(run)} 작업사진 보기`}
      style={progress.historyItem} onPress={() => nav.go({name: 'work-detail', id: run.id})}>
      <View style={progress.historyContent}><Text style={progress.historyName}>{runName(run)}</Text>
        <Text style={progress.historyDate}>{[run.bookingDate || String(run.createdAt || '').slice(0, 10), run.branch].filter(Boolean).join(' · ')}</Text>
        <Text style={progress.historyStatus}>{String(run.status || (run.completedAt ? '작업 완료' : '작업 기록'))}</Text></View>
      <Text style={progress.historyAction}>작업사진 보기 ›</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({photoShell: {flex: 1, padding: 20, backgroundColor: color.text}, photo: {flex: 1, width: '100%'}});
