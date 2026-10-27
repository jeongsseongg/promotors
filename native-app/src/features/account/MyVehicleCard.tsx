import React from 'react';
import {Image, Pressable, Text, useWindowDimensions, View} from 'react-native';
import {Booking, MemberProfile} from '../../domain/types';
import {useNav} from '../../components/AppContext';
import {myPage as styles, myPageAtWidth} from './myPageStyles';

const stages = [
  {label: '접수', icon: require('../../../assets/account/calendar.png')},
  {label: '진단', icon: require('../../../assets/account/search.png')},
  {label: '작업', icon: require('../../../assets/account/wrench.png')},
  {label: '검수', icon: require('../../../assets/account/check.png')},
  {label: '출고', icon: require('../../../assets/account/car.png')},
];
function bookingDate(booking: Booking) {
  const stamp = new Date(`${booking.date.replace(/\./g, '-')}T${booking.time.slice(0, 5)}:00+09:00`);
  return Number.isFinite(stamp.getTime()) ? stamp.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }) : `${booking.date} ${booking.time}`;
}
export function MyVehicleCard({profile, stage, service, branch, status, next}: {profile: MemberProfile | null | undefined; stage: number; service: string; branch: string; status: string; next?: Booking}) {
  const nav = useNav(), progress = stage < 0 ? 0 : (stage + 1) * 20, layout = myPageAtWidth(useWindowDimensions().width);
  return <View style={styles.vehicle}>
    <View style={[styles.vehicleBody, layout.body]}>
      <View style={styles.tags}><Text numberOfLines={1} style={styles.plate}>{profile?.car || '차량번호 미등록'}</Text><Text style={styles.badge}>{stage < 0 ? '예약 전' : stages[stage].label}</Text></View>
      <View style={styles.vehicleHead}><Text style={[styles.model, layout.model]}>{profile?.model || '차량 정보를 등록해주세요'}</Text><Text numberOfLines={1} style={styles.description}>{service} · {branch}</Text></View>
      <View style={styles.rateRow}><Text style={[styles.rate, layout.rate]}>{progress}<Text style={[styles.percent, layout.percent]}>%</Text></Text><Text style={styles.status}>{status}</Text></View>
      <View accessibilityRole="progressbar" accessibilityValue={{min: 0, max: 100, now: progress}} style={styles.track}><View style={[styles.progress, {width: `${progress}%`}]}/></View>
      <View style={[styles.stages, layout.stages]}>{stages.map((item, i) => <View key={item.label} style={[styles.stage, i < stage && styles.doneStage, i === stage && styles.currentStage]}>
        <Image source={item.icon} accessible={false} style={[styles.stageIcon, i < stage && styles.doneIcon, i === stage && styles.currentIcon]}/>
        <Text style={[styles.step, i < stage && styles.done, i === stage && styles.current]}>{item.label}</Text>
      </View>)}</View>
    </View>
    <Pressable accessibilityRole="button" onPress={() => nav.go(next ? {name: 'booking', id: next.id} : {name: 'reserve'})} style={styles.next}>
      <Image source={stages[0].icon} accessible={false} style={styles.nextIcon}/><Text style={styles.nextTitle}>{next ? '다음 예약' : '정비 예약'}</Text>
      <Text numberOfLines={1} style={styles.nextDate}>{next ? bookingDate(next) : '예약하기'}</Text><Text style={styles.chevron}>›</Text>
    </Pressable>
  </View>;
}
