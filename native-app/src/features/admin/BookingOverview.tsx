import React from 'react';
import {Text, View} from 'react-native';
import {Booking} from '../../domain/types';
import {bookingStyles as s} from './bookingStyles';

export function BookingOverview({booking}: {booking: Booking}) {
  const rows = [
    ['예약자', booking.name || '미입력'], ['차량명', booking.model || '미입력'],
    ['차량번호', booking.car || '미입력'], ['연락처', booking.phone || '미입력'],
    ['방문 지점', booking.branch], ['방문 일정', booking.date + ' · ' + booking.time],
    ['요청 정비', (booking.services || []).join(' · ') || '미입력'], ['요청사항', booking.memo || '없음'],
  ];
  return <View style={s.card}><Text style={s.heading}>예약 전체 정보</Text><View style={s.divider}/>
    {rows.map(([label, value]) => <View key={label} style={s.infoRow}><Text style={s.infoLabel}>{label}</Text><Text selectable style={s.infoValue}>{value}</Text></View>)}
  </View>;
}
