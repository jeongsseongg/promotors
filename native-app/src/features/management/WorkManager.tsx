import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, Field, MenuRow} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {useNav, useServices} from '../../components/AppContext';
import {ManagedRun} from '../../domain/management';
import {ui} from '../../theme/styles';
import {confirmAction, useManagementAction} from './Actions';

export function WorkManager({id}: {id?: string}) {
  const services = useServices(), nav = useNav();
  const resource = useResource(useCallback(() => services.adminWork.list(), [services]));
  const action = useManagementAction(), [limit, setLimit] = useState(50);
  const run = resource.data?.runs.find(row => row.id === id);
  if (run) return <WorkEditor key={run.id + ':' + run.currentStep + ':' + run.status} run={run} reload={resource.reload}/>;
  const waiting = resource.data?.bookings.filter(row => ['신규', '승인대기', '예약'].includes(row.status) && !resource.data!.runs.some(item => item.bookingKey === row.id)) || [];
  return <Screen title="작업 진행 · 사진" onBack={nav.back} onRefresh={resource.reload} refreshing={resource.loading} testID="management-work">
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {id && resource.data ? <Text style={ui.error}>작업이 없거나 담당 지점 권한이 없습니다.</Text> : null}
    <Text style={ui.error}>{action.error}</Text><Text style={ui.heading}>입고 시작 전 · {waiting.length}건</Text>
    {waiting.slice(0, limit).map(row => <View style={ui.card} key={row.id}><Text style={ui.heading}>{row.name} · {row.car}</Text>
      <Text style={ui.body}>{row.date} {row.time} · {row.branch}</Text><Text style={ui.muted}>{row.model} · {row.services?.join(', ')}</Text>
      <Button label="입고 시작" busy={action.busy} onPress={() => void action.run(() => services.adminWork.createFromBooking(row.id), result => nav.go({name: 'management', section: 'work', id: result.run.id}))}/></View>)}
    <Text style={ui.heading}>작업 · {resource.data?.runs.length || 0}건</Text>
    {resource.data?.runs.slice(0, limit).map(row => <View key={row.id} style={ui.card}><MenuRow title={`${row.name || '고객'} · ${row.car || ''}`}
      detail={`${row.branch} · ${row.service || ''} · ${row.status || ''}`} onPress={() => nav.go({name: 'management', section: 'work', id: row.id})}/></View>)}
    {(resource.data?.runs.length || 0) > limit || waiting.length > limit ? <Button secondary label="더 보기" onPress={() => setLimit(limit + 50)}/> : null}
  </Screen>;
}
function WorkEditor({run, reload}: {run: ManagedRun; reload: () => Promise<void>}) {
  const services = useServices(), nav = useNav(), [index, setIndex] = useState(run.currentStep);
  const step = run.steps[index], action = useManagementAction();
  const [keys, setKeys] = useState(step?.photoKeys || []), [memo, setMemo] = useState(step?.memo || ''), [mileage, setMileage] = useState(String(run.mileage || ''));
  const [reason, setReason] = useState('');
  const select = (value: number) => {setIndex(value); setKeys(run.steps[value].photoKeys || []); setMemo(run.steps[value].memo || '');};
  const saved = (result: {warnings: string[]}) => {action.setNotice(result.warnings.length ? '작업은 저장했지만 작업 기록을 모두 저장하지 못했어요. 목록을 확인해 주세요.' : '저장했어요.'); void reload();};
  const upload = (source: 'camera' | 'library') => void action.run(() => services.adminAssets.pickAndUpload({source, prefix: 'service', branch: run.branch, runId: run.id, limit: 30 - keys.length}), added => setKeys(previous => [...previous, ...added]));
  return <Screen title="작업 상세" onBack={nav.back} testID="management-work-detail">
    <View style={ui.card}><Text style={ui.title}>{run.car}</Text><Text style={ui.heading}>{run.name} · {run.model}</Text><Text selectable style={ui.body}>{run.phone}</Text>
      <Text style={ui.body}>{run.branch} · {run.service}</Text><Text style={ui.muted}>{run.bookingDate} {run.bookingTime} · {run.status}</Text></View>
    <View style={ui.wrap}>{run.steps.map((item, i) => <Choice key={i} label={item.name + (item.approved ? ' · 완료' : '')} selected={index === i} onPress={() => select(i)}/>)}</View>
    {step ? <View style={ui.card}><Text style={ui.heading}>{step.name} · 사진 {keys.length}/30</Text>
      <Text style={ui.muted}>{step.photoRequired ? '사진 필수' : '사진 선택'} · {step.memoRequired ? '특이사항 필수' : '특이사항 선택'}</Text>
      {keys.map((key, i) => <View style={ui.stack} key={key}><AssetImage assetKey={key} label={`${step.name} 사진 ${i + 1}`} privateAsset/>
        <Button secondary label={`사진 ${i + 1} 빼기`} disabled={action.busy} onPress={() => setKeys(keys.filter(item => item !== key))}/></View>)}
      <Button secondary label="카메라 촬영" disabled={keys.length >= 30} busy={action.busy} onPress={() => upload('camera')}/>
      <Button secondary label="사진첩에서 선택" disabled={keys.length >= 30} busy={action.busy} onPress={() => upload('library')}/>
      {step.name.includes('입고') ? <Field label="입고 주행거리(km)" value={mileage} onChangeText={setMileage} keyboardType="number-pad"/> : null}
      <Field label="특이사항" value={memo} onChangeText={setMemo} multiline maxLength={4000}/>
      <Text style={ui.error}>{action.error}</Text><Text accessibilityLiveRegion="polite" style={ui.body}>{action.notice}</Text>
      <Button label="사진·메모 저장" busy={action.busy} onPress={() => void action.run(() => services.adminWork.saveStep(run.id, index, {photoKeys: keys, memo, mileage, submit: false}), saved)}/>
      {index === run.currentStep && !step.approved ? <Button label="단계 제출" busy={action.busy} onPress={() => void action.run(() => services.adminWork.saveStep(run.id, index, {photoKeys: keys, memo, mileage, submit: true}), saved)}/> : null}
      {services.session.snapshot().role === 'main' && index === run.currentStep && step.submitted && !step.approved ? <>
        <Button label="검수 승인 · 고객 공개" busy={action.busy} onPress={() => void action.run(() => services.adminWork.approveStep(run.id), saved)}/>
        <Field label="반려 사유" value={reason} onChangeText={setReason}/><Button danger label="반려" busy={action.busy} onPress={() => void action.run(() => services.adminWork.rejectStep(run.id, reason), saved)}/></> : null}
      <Button danger label="단계 되돌리기" busy={action.busy} onPress={() => void confirmAction('단계 되돌리기', '단계를 되돌리고 현재 사진을 사진 이력으로 보관할까요?', '되돌리기', true).then(yes => {if (yes) void action.run(() => services.adminWork.revertStep(run.id), saved);})}/>
    </View> : <Text style={ui.error}>작업 단계를 확인하지 못했습니다.</Text>}
  </Screen>;
}
