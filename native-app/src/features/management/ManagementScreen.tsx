import React from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';
import {WorkManager} from './WorkManager';
import {CustomersManager} from './CustomersManager';
import {ContentManager} from './ContentManager';
import {HoursManager} from './HoursManager';
import {PromotionsManager} from './PromotionsManager';
import {InquiriesManager} from './InquiriesManager';

type Section = 'work' | 'customers' | 'content' | 'hours' | 'promotions' | 'inquiries';
export function ManagementScreen({section, id}: {section?: Section; id?: string}) {
  const nav = useNav(), session = useServices().session.snapshot();
  if (!session.authenticated || session.role === 'customer') return <Screen title="매장 관리" onBack={nav.back}><Text style={ui.body}>관리자로 로그인해 주세요.</Text></Screen>;
  if (section === 'work') return <WorkManager id={id}/>;
  if (section === 'customers') return <CustomersManager id={id}/>;
  if (section === 'content') return <ContentManager id={id}/>;
  if (section === 'hours') return <HoursManager/>;
  if (section === 'promotions') return <PromotionsManager id={id}/>;
  if (section === 'inquiries') return <InquiriesManager id={id}/>;
  return <Screen title="매장 관리" onBack={nav.back}><View style={ui.card}>
    <MenuRow title="작업 진행 · 사진 관리" detail="입고부터 출고까지 단계별로 관리" onPress={() => nav.go({name: 'management', section: 'work'})}/>
    <MenuRow title="고객 문의" detail="문의 내역 확인과 답변" onPress={() => nav.go({name: 'management', section: 'inquiries'})}/>
    <MenuRow title="영업시간 · 휴무" detail="담당 지점 예약 가능 시간 설정" onPress={() => nav.go({name: 'management', section: 'hours'})}/>
    {session.role === 'main' ? <><MenuRow title="고객 관리" detail="회원 · 차량 · 정비 기록 · 메모" onPress={() => nav.go({name: 'management', section: 'customers'})}/>
      <MenuRow title="게시글 · 매장 정보" detail="공지, 정비사례, 서비스와 매장 소개" onPress={() => nav.go({name: 'management', section: 'content'})}/>
      <MenuRow title="쿠폰 · 이벤트" detail="쿠폰 지급과 이벤트 공개" onPress={() => nav.go({name: 'management', section: 'promotions'})}/></> : null}
  </View></Screen>;
}
