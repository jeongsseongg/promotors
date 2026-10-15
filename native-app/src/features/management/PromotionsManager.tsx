import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, Field, MenuRow} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {useNav, useServices} from '../../components/AppContext';
import {JsonRecord} from '../../domain/types';
import {ui} from '../../theme/styles';
import {confirmAction, koreanDay, useManagementAction} from './Actions';

export function PromotionsManager({id}: {id?: string}) {
  const services = useServices(), nav = useNav(), action = useManagementAction();
  const resource = useResource(useCallback(() => services.adminPromotions.load(), [services]));
  const separator = id?.indexOf(':') || -1, kind = id?.slice(0, separator), recordId = id?.slice(separator + 1);
  if (resource.data && id) {
    const collection = kind === 'coupon' ? resource.data.coupons : resource.data.events;
    const item = collection.find(row => row.id === recordId);
    if (kind === 'issue') return <CouponIssue couponId={recordId || ''}/>;
    if (recordId !== 'new' && !item) return <Screen title="쿠폰 · 이벤트" onBack={nav.back}><Text style={ui.error}>항목이 없습니다. 목록을 다시 확인해 주세요.</Text></Screen>;
    if (kind === 'coupon') return <CouponEditor item={item}/>;
    if (kind === 'event') return <EventEditor item={item}/>;
  }
  return <Screen title="쿠폰 · 이벤트" onBack={nav.back} onRefresh={resource.reload} refreshing={resource.loading}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/><Text style={ui.error}>{action.error}</Text>
    <Button label="쿠폰 만들기" onPress={() => nav.go({name: 'management', section: 'promotions', id: 'coupon:new'})}/>
    {resource.data?.coupons.map(coupon => <View style={ui.card} key={String(coupon.id)}><MenuRow title={String(coupon.name || '쿠폰')} detail={String(coupon.benefit || '')}
      onPress={() => nav.go({name: 'management', section: 'promotions', id: 'coupon:' + coupon.id})}/><Button secondary label="회원에게 지급" onPress={() => nav.go({name: 'management', section: 'promotions', id: 'issue:' + coupon.id})}/></View>)}
    <Button label="이벤트 만들기" onPress={() => nav.go({name: 'management', section: 'promotions', id: 'event:new'})}/>
    {resource.data?.events.map(event => <View style={ui.card} key={String(event.id)}><MenuRow title={String(event.title || '이벤트')} detail={`${event.status === 'published' ? '공개' : '임시저장'} · ${String(event.prize || '')}`}
      onPress={() => nav.go({name: 'management', section: 'promotions', id: 'event:' + event.id})}/>
      <Button secondary label={event.status === 'published' ? '비공개로 변경' : '회원에게 공개'} busy={action.busy} onPress={() => void confirmAction('이벤트 공개 설정', event.status === 'published' ? '회원 화면에서 숨길까요?' : '이 이벤트를 회원에게 공개할까요?', '변경').then(yes => {
        if (yes) void action.run(() => services.adminPromotions.publishEvent(String(event.id), event.status !== 'published'), () => {void resource.reload();});
      })}/><Text style={ui.muted}>참여 {resource.data!.entries.filter(entry => entry.eventId === event.id).length}명 · 당첨 {resource.data!.entries.filter(entry => entry.eventId === event.id && entry.winner === true).length}명</Text>
    </View>)}
    <View style={ui.card}><Text style={ui.heading}>쿠폰 사용 내역</Text>{resource.data?.couponUsage.slice(-50).reverse().map((item, index) => <Text key={index} style={ui.body}>{String(item.couponName || '')} · {String(item.customerName || '')} · {String(item.usedBranch || '')}</Text>)}</View>
  </Screen>;
}
function CouponEditor({item}: {item?: JsonRecord}) {
  const services = useServices(), nav = useNav(), action = useManagementAction();
  const [name, setName] = useState(String(item?.name || '')), [code, setCode] = useState(String(item?.code || '')), [benefit, setBenefit] = useState(String(item?.benefit || ''));
  const [startDate, setStart] = useState(String(item?.startDate || koreanDay().replace(/\./g, '-'))), [endDate, setEnd] = useState(String(item?.endDate || koreanDay().replace(/\./g, '-'))), [birthday, setBirthday] = useState(!!item?.birthday);
  return <Screen title="쿠폰 편집" onBack={nav.back}><View style={ui.card}><Field label="쿠폰명" value={name} onChangeText={setName}/><Field label="쿠폰 코드" value={code} onChangeText={setCode}/>
    <Field label="혜택" value={benefit} onChangeText={setBenefit}/><Field label="시작일 (예: 2026-10-15)" value={startDate} onChangeText={setStart}/><Field label="종료일" value={endDate} onChangeText={setEnd}/>
    <Choice label="생일 자동 지급" selected={birthday} onPress={() => setBirthday(!birthday)}/><Text style={ui.error}>{action.error}</Text>
    <Button label="쿠폰 저장" busy={action.busy} onPress={() => void action.run(() => services.adminPromotions.saveCoupon({...item, name, code, benefit, startDate, endDate, birthday}), nav.back)}/></View></Screen>;
}
function EventEditor({item}: {item?: JsonRecord}) {
  const services = useServices(), nav = useNav(), action = useManagementAction();
  const [title, setTitle] = useState(String(item?.title || '')), [prize, setPrize] = useState(String(item?.prize || ''));
  const [startDate, setStart] = useState(String(item?.startDate || koreanDay().replace(/\./g, '-'))), [endDate, setEnd] = useState(String(item?.endDate || koreanDay().replace(/\./g, '-')));
  const [numbers, setNumbers] = useState(Array.isArray(item?.numbers) ? item!.numbers.join(', ') : '');
  return <Screen title="이벤트 편집" onBack={nav.back}><View style={ui.card}><Field label="이벤트명" value={title} onChangeText={setTitle}/><Field label="경품" value={prize} onChangeText={setPrize}/>
    <Field label="시작일 (예: 2026-10-15)" value={startDate} onChangeText={setStart}/><Field label="종료일" value={endDate} onChangeText={setEnd}/>
    <Field label="당첨번호 (추첨 후 서로 다른 1~45 번호 6개 입력)" value={numbers} onChangeText={setNumbers} keyboardType="numbers-and-punctuation"/>
    <Text style={ui.muted}>새 이벤트는 임시저장합니다. 목록에서 공개하면 회원에게 표시됩니다.</Text><Text style={ui.error}>{action.error}</Text>
    <Button label="이벤트 저장" busy={action.busy} onPress={() => void action.run(() => services.adminPromotions.saveEvent({...item, title, prize, startDate, endDate, numbers: numbers.split(/[^0-9]+/).filter(Boolean).map(Number)}), nav.back)}/></View></Screen>;
}
function CouponIssue({couponId}: {couponId: string}) {
  const services = useServices(), nav = useNav(), action = useManagementAction(), [member, setMember] = useState(''), [query, setQuery] = useState('');
  const resource = useResource(useCallback(() => services.adminCustomers.list(), [services]));
  return <Screen title="쿠폰 지급" onBack={nav.back}><DataState loading={resource.loading} error={resource.error} onRetry={resource.reload}/>
    <Field label="회원 검색" value={query} onChangeText={setQuery}/><Choice label="전체 회원" selected={member === 'all'} onPress={() => setMember('all')}/>
    {resource.data?.filter(row => `${row.name} ${row.car}`.includes(query)).slice(0, 50).map(row => <Choice key={row.id} label={`${row.name || '회원'} · ${row.car || ''}`} selected={member === row.id} onPress={() => setMember(row.id)}/>)}
    <Text style={ui.error}>{action.error}</Text><Button label="쿠폰 지급" disabled={!member} busy={action.busy} onPress={() => void confirmAction('쿠폰 지급', member === 'all' ? '전체 회원에게 쿠폰을 지급할까요?' : '선택한 회원에게 쿠폰을 지급할까요?', '지급').then(yes => {
      if (yes) void action.run(() => services.adminPromotions.issueCoupon(couponId, member), nav.back);
    })}/></Screen>;
}
