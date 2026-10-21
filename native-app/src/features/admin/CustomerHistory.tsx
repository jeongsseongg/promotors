import React from 'react';
import {Text, View} from 'react-native';
import {CustomerContext, JsonRecord} from '../../domain/types';
import {bookingStyles as s} from './bookingStyles';

type Section = {title: string; records: JsonRecord[]; lines: (row: JsonRecord) => string[]};
function text(...values: unknown[]) {return values.filter(Boolean).map(String).join(' · ');}
function services(value: unknown) {return Array.isArray(value) ? value.map(String).join(' · ') : '';}
function stamp(value: unknown) {const date = new Date(String(value || '')); return Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '';}
export function CustomerHistory({context}: {context?: CustomerContext}) {
  if (!context) return <View style={s.history}><Text style={s.caption}>고객 기록을 확인하지 못했습니다. 화면을 새로고침해 주세요.</Text></View>;
  const sections: Section[] = [
    {title: '이전 예약', records: context.bookings, lines: r => [text(r.date, r.time, r.status), text(r.branch, r.model, r.car), services(r.services), String(r.memo || '')]},
    {title: '정비 진행 기록', records: context.runs, lines: r => [text(r.bookingDate, r.bookingTime, r.status), text(r.branch, r.service), r.mileage ? '입고 주행거리 ' + Number(r.mileage).toLocaleString() + ' km' : '', String(r.reason || '')]},
    {title: '고객 처리 로그', records: context.audit, lines: r => [text(stamp(r.at), r.action), text(r.branch, r.step, r.by), String(r.detail || ''), String(r.memo || '')]},
    {title: '고객 메모', records: context.memos, lines: r => [text(stamp(r.createdAt), r.title), String(r.body || '')]},
    {title: '완료된 정비 이력', records: context.records, lines: r => [text(r.date || r.completedAt, r.branch), String(r.service || services(r.services)), String(r.note || '')]},
  ];
  return <View style={s.stack}><View style={s.history}><Text style={s.heading}>{context.existing ? '기존 고객 기록' : '고객 기록'}</Text>
    <Text style={s.body}>{context.existing ? '이전 예약과 정비 기록을 함께 확인하세요.' : context.matchKind === '연결 확인 필요' ? '고객 정보 연결 확인이 필요합니다.' : '연결된 이전 기록이 없습니다.'}</Text>
    {context.matchKind ? <Text style={s.caption}>{context.matchKind}</Text> : null}{context.limited ? <Text style={s.caption}>소유자와 접근 권한이 확인된 기록만 표시합니다.</Text> : null}</View>
    {context.existing ? sections.map(section => <View key={section.title} style={s.history}><Text style={s.heading}>{section.title}</Text>
      {section.records.length ? section.records.map((record, index) => <View key={String(record.id || index)} style={s.stack}><View style={s.divider}/>
        {section.lines(record).filter(Boolean).map((line, lineIndex) => <Text key={lineIndex} selectable style={lineIndex === 0 ? s.body : s.body}>{line}</Text>)}</View>) : <Text style={s.caption}>연결된 기록이 없습니다.</Text>}
    </View>) : null}
  </View>;
}
