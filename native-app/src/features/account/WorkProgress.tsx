import React from 'react';
import {Image, Text, View} from 'react-native';
import {AssetImage} from '../../components/Media';
import type {ServiceRun} from '../../domain/types';
import {runName, runSteps, type RunStep} from './runDisplay';
import {workProgress as styles} from './workProgressStyles';

type State = 'done' | 'now' | 'wait';
type GroupStep = RunStep & {index: number};
const stageMeta = [
  {label: '입고', icon: require('../../../assets/account/car.png')},
  {label: '작업', icon: require('../../../assets/account/wrench.png')},
  {label: '검수', icon: require('../../../assets/account/search.png')},
  {label: '확인', icon: require('../../../assets/account/flag.png')},
];
const stateLabel = {done: '완료', now: '진행중', wait: '대기'};
function stageDescription(service: string, group: number, state: State) {
  return [
    {done: '차량이 입고되었어요', now: '차량 입고 처리 중이에요', wait: '차량 입고를 기다리고 있어요'},
    {done: `${service} 작업을 마쳤어요`, now: `지금 ${service} 작업 중이에요`, wait: '작업 대기 중이에요'},
    {done: '검수를 마쳤어요', now: '작업 결과를 검수하고 있어요', wait: '검수 대기 중이에요'},
    {done: '작업이 완료되었어요. 차량을 확인해주세요', now: '출고 준비 중이에요', wait: '출고 대기 중이에요'},
  ][group][state];
}
export function workProgressStages(run: ServiceRun) {
  const steps = runSteps(run), raw = Number(run.currentStep || 0);
  const current = Number.isSafeInteger(raw) && raw >= 0 && raw < steps.length ? raw : 0;
  const completed = Boolean(run.completedAt) || ['완료', '출고 완료'].includes(String(run.status || '').trim());
  const inspecting = !!steps[current]?.submitted && !steps[current].approved;
  const groups: GroupStep[][] = [[], [], [], []];
  steps.forEach((step, index) => {groups[step.name.includes('입고') ? 0 : step.name.includes('출고') ? 3 : 1].push({...step, index});});
  function state(group: GroupStep[], index: number): State {
    if (completed) return 'done';
    if (index === 2) return inspecting ? 'now' : 'wait';
    if (!group.length) return 'wait';
    if (group.every(step => step.approved)) return 'done';
    if (group.some(step => step.index === current)) return inspecting ? 'done' : 'now';
    return group[0].index < current ? 'done' : 'wait';
  }
  return groups.map((group, index) => ({...stageMeta[index], state: state(group, index),
    description: stageDescription(runName(run), index, state(group, index)),
    photos: [...new Set(group.filter(step => step.approved).flatMap(step => step.photoKeys))],
    notes: group.filter(step => step.approved && step.note).map(step => step.note),
    pendingCount: group.filter(step => step.submitted && !step.approved).reduce((count, step) => count + step.photoKeys.length, 0),
    pendingReview: group.some(step => step.submitted && !step.approved),
    hasSteps: group.length > 0}));
}
type Stage = ReturnType<typeof workProgressStages>[number];
function ProgressStage({value, index, service, onPhoto}: {value: Stage; index: number; service: string; onPhoto(uri: string): void}) {
  return <View style={[styles.stage, value.state === 'now' && styles.stageNow]} testID={`work-stage-${index}`}>
    <View style={styles.stageHeader}>
      <View style={[styles.iconCircle, value.state === 'done' && styles.iconDone, value.state === 'now' && styles.iconNow]}>
        <Image source={value.icon} accessible={false} style={[styles.icon, value.state === 'done' && styles.imageDone, value.state === 'now' && styles.imageNow]}/>
      </View><Text accessibilityRole="header" style={styles.stageTitle}>{value.label}</Text>
      <Text style={[styles.badge, value.state === 'done' && styles.badgeDone, value.state === 'now' && styles.badgeNow]}>{stateLabel[value.state]}</Text>
    </View>
    <Text style={[styles.description, value.state === 'now' && styles.descriptionNow]}>{value.description}</Text>
    {value.notes.map((note, noteIndex) => <Text key={noteIndex} style={styles.approvedNote}>{note}</Text>)}
    {value.photos.length ? <View style={styles.photos}>{value.photos.map(key => <View key={key} style={styles.photoCell}>
      <AssetImage assetKey={key} label={`${service} · ${value.label}`} privateAsset onPress={onPhoto} style={styles.photo}/>
    </View>)}</View> : null}
    {value.pendingCount ? <Text style={styles.hint}>사진 {value.pendingCount}장 검수 중 — 확인이 끝나면 공개돼요</Text>
      : value.pendingReview ? <Text style={styles.hint}>검수가 끝나면 등록된 작업사진을 확인할 수 있어요.</Text>
      : !value.photos.length && value.hasSteps ? <Text style={styles.hint}>등록된 사진이 없어요</Text> : null}
  </View>;
}
export function WorkProgress({run, onPhoto}: {run: ServiceRun; onPhoto(uri: string): void}) {
  const name = runName(run);
  return <View style={styles.progress} testID="customer-work-progress">
    <Text style={styles.service}><Text style={styles.serviceName}>{name}</Text>{run.branch ? ` · ${run.branch}` : ''}</Text>
    {workProgressStages(run).map((value, index) => <ProgressStage key={value.label} value={value} index={index} service={name} onPhoto={onPhoto}/>)}
  </View>;
}
