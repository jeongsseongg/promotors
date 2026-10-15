import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {BookingDecisionControls} from './BookingDecisionControls';
import {Booking} from '../../domain/types';
import {ui} from '../../theme/styles';

export function BookingCard({booking, onOpen, onAccept, onReject, busy}: {booking: Booking; onOpen: () => void; onAccept?: () => void; onReject?: (reason: string) => void; busy?: boolean}) {
  return <View style={ui.card}><Pressable accessibilityRole="button" onPress={onOpen} testID={'booking-open-' + booking.id} style={ui.stack}>
    <View style={ui.spread}><Text style={ui.heading}>{booking.time}</Text><Text style={ui.pillText}>{booking.status}</Text></View>
    <Text style={ui.muted}>{booking.date} · {booking.branch}</Text><Text style={ui.heading}>{booking.name || '예약 고객'}</Text>
    <Text style={ui.label}>{booking.model || '차량명 미등록'} · {booking.car || '차량번호 미등록'}</Text>
    <Text style={ui.body}>{(booking.services || []).join(' · ') || '요청 정비 미입력'}</Text><Text style={ui.muted}>예약 전체정보 · 고객 기록 보기 ›</Text>
  </Pressable>
    {onAccept && onReject ? <BookingDecisionControls id={booking.id} busy={busy} onAccept={onAccept} onReject={onReject}/> : null}
  </View>;
}
