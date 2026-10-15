import React, {useCallback, useState} from 'react';
import {Alert, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {JsonRecord} from '../../domain/types';
import {ui} from '../../theme/styles';

function today() {const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');}
export function PromotionsScreen({events = false}: {events?: boolean}) {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const resource = useResource(useCallback(() => services.account.promotions(), [services]));
  const day = today();
  const rows = resource.data?.assignments.map(assignment => ({assignment, coupon: (resource.data?.coupons || []).find(row => row.id === assignment.couponId)}))
    .filter(row => row.coupon && String(row.coupon.startDate || '') <= day && String(row.coupon.endDate || '') >= day) || [];
  const published = resource.data?.events.filter(row => row.status === 'published' && String(row.startDate || '') <= day && String(row.endDate || '') >= day) || [];
  async function applyCoupon(id: string) {
    if (busy) return; setBusy(id); setError('');
    try {await services.account.useCoupon(id, '매장 방문'); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '쿠폰 사용을 처리하지 못했습니다. 직원에게 문의해 주세요.');}
    finally {setBusy('');}
  }
  return <Screen title={events ? '이벤트' : '내 쿠폰'} onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>{events ? '프로모터스의 특별한 혜택' : '내 차를 위한 혜택'}</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !(events ? published.length : rows.length) ? (events ? '진행 중인 이벤트가 없습니다.' : '사용 가능한 쿠폰이 없습니다.') : ''} onRetry={resource.reload}/>
    {events ? published.map(row => <EventCard key={String(row.id)} event={row} onChanged={resource.reload}/>) :
      rows.map(({assignment, coupon}) => <View key={String(assignment.id)} style={ui.card}><Text style={ui.pillText}>프로모터스 쿠폰</Text>
        <Text style={ui.heading}>{String(coupon?.name || '')}</Text><Text style={ui.body}>{String(coupon?.benefit || '')}</Text><Text style={ui.muted}>{String(coupon?.endDate || '')}까지</Text>
        <Button secondary label="매장에서 사용" busy={busy === String(assignment.id)} disabled={!!busy} onPress={() => Alert.alert('쿠폰 사용 확인', '매장 방문 후 직원에게 이 화면을 보여주고 확인받으셨나요? 사용한 쿠폰은 목록에서 사라집니다.', [{text: '돌아가기', style: 'cancel'}, {text: '사용 완료', onPress: () => void applyCoupon(String(assignment.id))}])}/></View>)}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {!events ? <Text style={ui.muted}>실제 사용 처리는 매장 직원의 확인 후 진행해 주세요.</Text> : null}
  </Screen>;
}
function EventCard({event, onChanged}: {event: JsonRecord; onChanged: () => Promise<void>}) {
  const services = useServices(), [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function enter() {
    if (busy) return; setError(''); setMessage('');
    const numbers = input.split(/[^0-9]+/).filter(Boolean).map(Number);
    if (numbers.length !== 6 || new Set(numbers).size !== 6 || numbers.some(n => n < 1 || n > 45)) {setError('1~45 사이의 서로 다른 번호 6개를 입력해 주세요.'); return;}
    setBusy(true);
    try {
      const result = await services.account.enterEvent(String(event.id), numbers.sort((a, b) => a - b));
      setMessage(result.winner ? '축하합니다! ' + String(result.prize || event.prize || '') + ' 당첨입니다. 매장에 이 화면을 보여주세요.' : '응모가 완료되었습니다. 종료 후 결과를 확인해 주세요.');
      await onChanged();
    } catch (e) {setError(e instanceof Error ? e.message : '응모를 처리하지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <View style={ui.card}><Text style={ui.heading}>{String(event.title || '')}</Text><Text style={ui.body}>경품 {String(event.prize || '')}</Text>
    <Text style={ui.muted}>{String(event.startDate || '')} ~ {String(event.endDate || '')}</Text>
    <Field label="내 로또번호 6개" placeholder="예: 1 7 12 23 31 45" keyboardType="numbers-and-punctuation" value={input} onChangeText={setInput}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}{message ? <Text accessibilityRole="alert" style={ui.body}>{message}</Text> : null}
    <Button label="응모하기" busy={busy} onPress={() => void enter()}/>
  </View>;
}
