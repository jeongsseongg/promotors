import React, {useCallback, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {ServiceRun} from '../../domain/types';
import {runName, runStage, runSteps} from './runDisplay';
import {ui} from '../../theme/styles';
import {color} from '../../theme/tokens';

export function WorkScreen({history = false, id}: {history?: boolean; id?: string}) {
  const services = useServices(), nav = useNav(), [photo, setPhoto] = useState('');
  const resource = useResource(useCallback(() => services.account.load(), [services]));
  const runs = resource.data?.runs.filter(row => id ? row.id === id : history || runStage(row) < 4) || [];
  const booking = id && runs[0]?.bookingKey ? resource.data?.bookings.find(row => row.id === runs[0].bookingKey) : undefined;
  return <Screen title={id ? '정비 상세' : history ? '정비 이력' : '작업사진·현황'} onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>{history ? '내 차의 정비 기록' : '지금 내 차는'}</Text><Text style={ui.muted}>{history ? '완료된 정비 이력과 승인된 작업사진을 확인하세요.' : '작업 단계를 확인하고 사진으로 살펴보세요.'}</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !runs.length ? (id ? '정비 내역을 찾을 수 없습니다.' : history ? '아직 등록된 정비 이력이 없습니다.' : '진행 중인 작업이 없습니다.') : ''} onRetry={resource.reload}/>
    {runs.map(run => <RunCard key={run.id} run={run} onPhoto={setPhoto}/>)}
    {booking ? <Button secondary label="예약 정보 보기" onPress={() => nav.go({name: 'booking', id: booking.id})}/> : null}
    {history && !id && resource.data?.bookings.length ? <View style={ui.card}><Text style={ui.heading}>방문 예약 기록</Text>
      {resource.data.bookings.map(row => <Pressable accessibilityRole="button" key={row.id} onPress={() => nav.go({name: 'booking', id: row.id})}>
        <Text style={ui.label}>{row.date} {row.time} · {row.status}</Text><Text style={ui.muted}>{row.branch} · {(row.services || []).join(' · ')}</Text></Pressable>)}</View> : null}
    <Modal visible={!!photo} onRequestClose={() => setPhoto('')} animationType="fade"><SafeAreaView style={styles.photoShell}>
      <Button secondary label="사진 닫기" onPress={() => setPhoto('')}/><Image accessibilityLabel="정비 작업사진" source={{uri: photo, cache: 'reload', headers: {'Cache-Control': 'no-store'}}} style={styles.photo} resizeMode="contain"/></SafeAreaView></Modal>
  </Screen>;
}
function RunCard({run, onPhoto}: {run: ServiceRun; onPhoto: (uri: string) => void}) {
  const steps = runSteps(run), current = Number(run.currentStep || 0);
  return <View style={ui.card}><View style={ui.spread}><Text style={ui.heading}>{runName(run)}</Text><Text style={ui.pillText}>{runStage(run) === 4 ? '완료' : '진행 중'}</Text></View>
    <Text style={ui.muted}>{[run.branch, run.bookingDate, run.bookingTime].filter(Boolean).join(' · ')}</Text>
    {steps.map((step, index) => <View key={index} style={ui.stack}><View style={ui.divider}/>
      <Text style={ui.label}>{index + 1}. {step.name} · {step.approved ? '확인 완료' : index === current ? '진행 중' : '대기'}</Text>
      {step.note && step.approved ? <Text style={ui.body}>{step.note}</Text> : null}
      {step.approved ? step.photoKeys.map(key => <AssetImage key={key} assetKey={key} label={runName(run) + ' · ' + step.name} privateAsset onPress={onPhoto}/>) : <Text style={ui.muted}>사진은 검수 후 확인할 수 있어요.</Text>}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({photoShell: {flex: 1, padding: 20, backgroundColor: color.text}, photo: {flex: 1, width: '100%'}});
