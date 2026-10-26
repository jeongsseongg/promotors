import React from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import {Booking, MemberProfile} from '../../domain/types';
import {useNav} from '../../components/AppContext';
import {myPage as styles} from './myPageStyles';

const stages = [
  {label: '접수', icon: require('../../../assets/account/calendar.png')},
  {label: '진단', icon: require('../../../assets/account/search.png')},
  {label: '작업', icon: require('../../../assets/account/wrench.png')},
  {label: '검수', icon: require('../../../assets/account/check.png')},
  {label: '출고', icon: require('../../../assets/account/car.png')},
];
export function MyVehicleCard({profile, stage, service, branch, status, next}: {profile: MemberProfile | null | undefined; stage: number; service: string; branch: string; status: string; next?: Booking}) {
  const nav = useNav(), progress = stage < 0 ? 0 : (stage + 1) * 20;
  return <View style={styles.vehicle}>
    <View style={styles.vehicleBody}>
      <View style={styles.tags}><Text numberOfLines={1} style={styles.plate}>{profile?.car || '차량번호 미등록'}</Text><Text style={styles.badge}>{stage < 0 ? '예약 전' : stages[stage].label}</Text></View>
      <View><Text style={styles.model}>{profile?.model || '차량 정보를 등록해주세요'}</Text><Text numberOfLines={1} style={styles.description}>{service} · {branch}</Text></View>
      <View style={styles.rateRow}><Text style={styles.rate}>{progress}<Text style={styles.percent}>%</Text></Text><Text style={styles.status}>{status}</Text></View>
      <View accessibilityRole="progressbar" accessibilityValue={{min: 0, max: 100, now: progress}} style={styles.track}><View style={[styles.progress, {width: `${progress}%`}]}/></View>
      <View style={styles.stages}>{stages.map((item, i) => <View key={item.label} style={styles.stage}>
        <Image source={item.icon} accessible={false} style={[styles.stageIcon, i < stage && styles.doneIcon, i === stage && styles.currentIcon]}/>
        <Text style={[styles.step, i < stage && styles.done, i === stage && styles.current]}>{item.label}</Text>
      </View>)}</View>
    </View>
    <Pressable accessibilityRole="button" onPress={() => nav.go(next ? {name: 'booking', id: next.id} : {name: 'reserve'})} style={styles.next}>
      <Image source={stages[0].icon} accessible={false} style={styles.nextIcon}/><Text style={styles.nextTitle}>{next ? '다음 예약' : '정비 예약'}</Text>
      <Text style={styles.nextDate}>{next ? next.date.slice(5).replace('.', '/') + ' ' + next.time : '예약하기'}</Text><Text style={styles.chevron}>›</Text>
    </Pressable>
  </View>;
}
