import React, {useCallback, useState} from 'react';
import {Alert, Switch, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {NotificationPreferences} from '../../domain/types';
import {ConnectionCard} from './ConnectionCard';
import {ui} from '../../theme/styles';
import {color} from '../../theme/tokens';

type Category = 'booking' | 'repair' | 'reminders' | 'marketing';
const categories: {key: Category; title: string; detail: string}[] = [
  {key: 'booking', title: '예약 알림', detail: '새 예약, 예약 확정·변경·취소'},
  {key: 'repair', title: '정비 알림', detail: '작업 진행과 검수된 정비사진'},
  {key: 'reminders', title: '방문·점검 일정', detail: '방문 예정과 설정한 정기점검 일정'},
  {key: 'marketing', title: '혜택·이벤트 알림 (선택)', detail: '프로모터스의 혜택과 소식'},
];
export function NotificationSettingsScreen() {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(''), [error, setError] = useState(''), [date, setDate] = useState('');
  const resource = useResource(useCallback(() => services.notifications.state(), [services]));
  async function update(key: Category, value: boolean) {
    if (busy) return; setBusy(key); setError('');
    try {await services.notifications.preferences({[key]: value} as Partial<NotificationPreferences>); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '알림 설정을 저장하지 못했습니다.');}
    finally {setBusy('');}
  }
  function toggle(key: Category, value: boolean) {
    if (key === 'marketing' && value) {Alert.alert('혜택·이벤트 알림 동의', '프로모터스의 혜택과 이벤트 앱 알림 수신에 동의하시겠어요? 언제든 여기서 끌 수 있습니다.', [{text: '나중에', style: 'cancel'}, {text: '동의하고 켜기', onPress: () => void update(key, true)}]); return;}
    void update(key, value);
  }
  async function saveDate() {
    if (busy) return;
    const input = date.trim();
    if (input && (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(new Date(input).getTime()) || new Date(input).toISOString().slice(0, 10) !== input)) {setError('점검일을 연도-월-일 형식으로 입력해 주세요.'); return;}
    setBusy('date'); setError('');
    try {await services.notifications.maintenance(input || null); await resource.reload(); setDate('');}
    catch (e) {setError(e instanceof Error ? e.message : '점검일을 저장하지 못했습니다.');}
    finally {setBusy('');}
  }
  return <Screen title="앱 알림 설정" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}>
    <ConnectionCard/><DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    <View style={ui.card}><Text style={ui.heading}>받고 싶은 알림</Text>
      {categories.map(row => <View key={row.key} style={ui.stack}><View style={ui.spread}><View style={ui.flex}><Text style={ui.label}>{row.title}</Text><Text style={ui.muted}>{row.detail}</Text></View>
        <Switch accessibilityLabel={row.title} disabled={!!busy || !resource.data} value={resource.data?.preferences[row.key] || false} onValueChange={value => toggle(row.key, value)} trackColor={{true: color.navy}}/></View><View style={ui.divider}/></View>)}
    </View>
    <View style={ui.card}><Text style={ui.heading}>정기점검 날짜</Text><Text style={ui.muted}>{resource.data?.maintenanceDate ? '현재 설정: ' + resource.data.maintenanceDate : '아직 설정한 점검일이 없어요.'}</Text>
      <Field label="점검 예정일" placeholder="2026-11-01" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10}/>
      <Button secondary label={date ? '점검일 저장' : '점검일 해제'} busy={busy === 'date'} onPress={() => void saveDate()}/></View>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
  </Screen>;
}
