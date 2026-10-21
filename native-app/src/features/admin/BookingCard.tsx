import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {BookingDecisionControls} from './BookingDecisionControls';
import {Booking} from '../../domain/types';
import {bookingStyles as s} from './bookingStyles';

export function BookingCard({booking, onOpen, onAccept, onReject, busy, openTestID}: {booking: Booking; onOpen: () => void; onAccept?: () => void; onReject?: (reason: string) => void; busy?: boolean; openTestID?: string}) {
  const pending = ['신규', '승인대기'].includes(booking.status);
  return <View style={s.card}><Pressable accessibilityRole="button" onPress={onOpen} disabled={busy} testID={openTestID || 'booking-open-' + booking.id} style={s.stack}>
    <View style={s.row}><Text style={s.caption}>{booking.date}</Text><View style={s.status}><Text style={s.statusText}>{pending ? '처리 대기' : booking.status}</Text></View></View>
    <View style={s.row}><Text style={s.time}>{booking.time}</Text><Text style={s.link}>예약 상세 ›</Text></View>
    <Text style={s.name}>{booking.name || '예약 고객'}</Text>
    <View style={s.vehicle}><Text style={s.body}>{booking.model || '차량명 미등록'}</Text><Text style={s.body}>{booking.car || '차량번호 미등록'}</Text></View>
    <Text style={s.body}>{(booking.services || []).join(' · ') || '요청 정비 미입력'}</Text>
    <Text style={s.caption}>{booking.branch}</Text>
  </Pressable>
    {onAccept && onReject ? <><View style={s.divider}/><BookingDecisionControls id={booking.id} busy={busy} onAccept={onAccept} onReject={onReject}/></> : null}
  </View>;
}
