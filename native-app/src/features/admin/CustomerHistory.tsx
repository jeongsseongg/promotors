import React from 'react';
import {Text, View} from 'react-native';
import {CustomerContext, JsonRecord} from '../../domain/types';
import {ui} from '../../theme/styles';

type Section = {title: string; records: JsonRecord[]; lines: (row: JsonRecord) => string[]};
function text(...values: unknown[]) {return values.filter(Boolean).map(String).join(' · ');}
function services(value: unknown) {return Array.isArray(value) ? value.map(String).join(' · ') : '';}
function stamp(value: unknown) {const date = new Date(String(value || '')); return Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '';}
export function CustomerHistory({context}: {context?: CustomerContext}) {
  if (!context) return <View style={ui.card}><Text style={ui.muted}>고객 기록을 확인하지 못했습니다. 화면을 새로고침해 주세요.</Text></View>;
  const sections: Section[] = [
    {title: '이전 예약', records: context.bookings, lines: r => [text(r.date, r.time, r.status), text(r.branch, r.model, r.car), services(r.services), String(r.memo || '')]},
    {title: '정비 진행 기록', records: context.runs, lines: r => [text(r.bookingDate, r.bookingTime, r.status), text(r.branch, r.service), r.mileage ? '입고 주행거리 ' + Number(r.mileage).toLocaleString() + ' km' : '', String(r.reason || '')]},
    {title: '고객 처리 로그', records: context.audit, lines: r => [text(stamp(r.at), r.action), text(r.branch, r.step, r.by), String(r.detail || ''), String(r.memo || '')]},
    {title: '고객 메모', records: context.memos, lines: r => [text(stamp(r.createdAt), r.title), String(r.body || '')]},
    {title: '완료된 정비 이력', records: context.records, lines: r => [text(r.date || r.completedAt, r.branch), String(r.service || services(r.services)), String(r.note || '')]},
  ];
  return <View style={ui.stack}><View style={ui.card}><Text style={ui.heading}>{context.existing ? '기존 고객 기록' : '고객 기록'}</Text>
    <Text style={ui.body}>{context.existing ? '이전 예약과 정비 기록을 함께 확인하세요.' : context.matchKind === '연결 확인 필요' ? '고객 정보 연결 확인이 필요합니다.' : '연결된 이전 기록이 없습니다.'}</Text>
    {context.matchKind ? <Text style={ui.muted}>{context.matchKind}</Text> : null}{context.limited ? <Text style={ui.muted}>소유자와 접근 권한이 확인된 기록만 표시합니다.</Text> : null}</View>
    {context.existing ? sections.map(section => <View key={section.title} style={ui.card}><Text style={ui.heading}>{section.title}</Text>
      {section.records.length ? section.records.map((record, index) => <View key={String(record.id || index)} style={ui.stack}><View style={ui.divider}/>
        {section.lines(record).filter(Boolean).map((line, lineIndex) => <Text key={lineIndex} selectable style={lineIndex === 0 ? ui.label : ui.body}>{line}</Text>)}</View>) : <Text style={ui.muted}>연결된 기록이 없습니다.</Text>}
    </View>) : null}
  </View>;
}
