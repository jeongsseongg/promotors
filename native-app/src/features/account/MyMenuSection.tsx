import React from 'react';
import {Image, Pressable, Text, useWindowDimensions, View} from 'react-native';
import {MenuRow} from '../../components/Controls';
import {myPage as styles, myPageAtWidth} from './myPageStyles';
import {useNav, useServices} from '../../components/AppContext';

const icons = {
  user: require('../../../assets/account/user.png'), car: require('../../../assets/account/car.png'),
  wrench: require('../../../assets/account/wrench.png'), doc: require('../../../assets/account/doc.png'),
  calendar: require('../../../assets/account/calendar.png'), headset: require('../../../assets/account/headset.png'),
  check: require('../../../assets/account/check.png'), bell: require('../../../assets/account/bell.png'),
  lock: require('../../../assets/account/lock.png'), flag: require('../../../assets/account/flag.png'),
};
export type MyMenuItem = {title: string; detail?: string; badge?: string; selected?: boolean; icon: keyof typeof icons; onPress(): void};
export function MyGreeting({title, subtitle}: {title: string; subtitle: string}) {
  const nav = useNav(), layout = myPageAtWidth(useWindowDimensions().width);
  return <View style={styles.greeting}>
    <View style={styles.greetingRow}><Text accessibilityRole="header" style={[styles.hello, layout.hello]}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="알림" testID="my-notifications" onPress={() => nav.go({name: 'notifications'})} style={styles.notificationButton}>
        <Image source={icons.bell} accessible={false} style={styles.notificationIcon}/><Text style={styles.notificationLabel}>알림</Text>
      </Pressable></View>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>;
}
export function MyMenuSection({title, items}: {title: string; items: MyMenuItem[]}) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.groupList}>
    {items.map((item, index) => <MenuRow key={item.title} compact brand last={index === items.length - 1} title={item.title}
      detail={item.detail} badge={item.badge} selected={item.selected} icon={icons[item.icon]} onPress={item.onPress}/>)}
  </View></View>;
}
export function MyCustomerMenus({name, model, historyCount, bookingCount, messageCount, noticeCount}: {name?: string; model?: string; historyCount?: number; bookingCount?: number; messageCount?: number; noticeCount?: number}) {
  const nav = useNav();
  return <>
    <MyMenuSection title="내 차" items={[
      {title: '내 차 관리', detail: model || '차량정보 입력', icon: 'car', onPress: () => nav.go({name: 'profile'})},
      {title: '정비 이력', detail: historyCount === undefined ? '확인하기' : historyCount ? `${historyCount}건` : '내역 없음', icon: 'doc', onPress: () => nav.go({name: 'history'})},
      {title: '공업사의 TIP', detail: messageCount ? `메시지 ${messageCount}` : '문의하기', icon: 'headset', onPress: () => nav.go({name: 'inquiry'})},
    ]}/>
    <MyMenuSection title="예약" items={[
      {title: '예약 내역', detail: bookingCount === undefined ? '확인하기' : bookingCount ? `${bookingCount}건` : '내역 없음', icon: 'calendar', onPress: () => nav.go({name: 'bookings'})},
      {title: '정비 예약하기', detail: '예약', selected: true, icon: 'wrench', onPress: () => nav.go({name: 'reserve'})},
      {title: '작업사진·현황', detail: noticeCount ? `알림 ${noticeCount}` : '확인하기', icon: 'check', onPress: () => nav.go({name: 'work'})},
    ]}/>
    <MyMenuSection title="혜택" items={[
      {title: '내 쿠폰', detail: '확인하기', icon: 'check', onPress: () => nav.go({name: 'coupons'})},
      {title: '이벤트', detail: '확인하기', icon: 'flag', onPress: () => nav.go({name: 'events'})},
    ]}/>
    <MyMenuSection title="내 정보" items={[
      {title: '회원정보 수정', detail: name, icon: 'user', onPress: () => nav.go({name: 'profile'})},
      {title: '알림', detail: '예약·정비 알림', icon: 'bell', onPress: () => nav.go({name: 'notifications'})},
    ]}/>
  </>;
}
export function MyAccountMenu({onLogout}: {onLogout(): void}) {
  const nav = useNav(), session = useServices().session.snapshot(), customer = session.role === 'customer';
  const roleLabel = session.role === 'developer' ? '개발자' : session.role === 'main' ? '메인관리자' : '지점관리자';
  const branches = session.branches.join(' · ') || (session.role === 'general' ? '담당 지점 없음' : '전체 지점');
  return <MyMenuSection title={customer ? '앱 설정' : '계정'} items={[
    ...(!customer ? [{title: '관리자 모드', detail: `${roleLabel} · ${branches}`,
      icon: 'user' as const, onPress: () => nav.go({name: 'admin'})},
    {title: '예약 알림함', icon: 'bell' as const, onPress: () => nav.go({name: 'notifications'})}] : []),
    {title: '앱 알림 설정', icon: 'bell', onPress: () => nav.go({name: 'notification-settings'})},
    {title: '개인정보 처리방침', icon: 'lock', onPress: () => nav.go({name: 'privacy'})},
    {title: '이용약관', icon: 'doc', onPress: () => nav.go({name: 'terms'})},
    {title: '로그아웃', icon: 'lock', onPress: onLogout},
  ]}/>;
}
