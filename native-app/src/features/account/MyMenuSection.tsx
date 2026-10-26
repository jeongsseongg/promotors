import React from 'react';
import {Text, View} from 'react-native';
import {MenuRow} from '../../components/Controls';
import {myPage as styles} from './myPageStyles';
import {useNav} from '../../components/AppContext';

const icons = {
  user: require('../../../assets/account/user.png'), car: require('../../../assets/account/car.png'),
  wrench: require('../../../assets/account/wrench.png'), doc: require('../../../assets/account/doc.png'),
  calendar: require('../../../assets/account/calendar.png'), headset: require('../../../assets/account/headset.png'),
  check: require('../../../assets/account/check.png'), bell: require('../../../assets/account/bell.png'),
  lock: require('../../../assets/account/lock.png'), flag: require('../../../assets/account/flag.png'),
};
export type MyMenuItem = {title: string; detail?: string; icon: keyof typeof icons; onPress(): void};
export function MyMenuSection({title, items}: {title: string; items: MyMenuItem[]}) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.groupList}>
    {items.map(item => <MenuRow key={item.title} compact title={item.title} detail={item.detail} icon={icons[item.icon]} onPress={item.onPress}/>)}
  </View></View>;
}
export function MyCustomerMenus({model}: {model?: string}) {
  const nav = useNav();
  return <>
    <MyMenuSection title="내 차" items={[
      {title: '내 차 관리', detail: model || '차량정보 입력', icon: 'car', onPress: () => nav.go({name: 'profile'})},
      {title: '정비 이력', icon: 'doc', onPress: () => nav.go({name: 'history'})},
      {title: '공업사의 TIP', detail: '문의하기', icon: 'headset', onPress: () => nav.go({name: 'inquiry'})},
    ]}/>
    <MyMenuSection title="예약" items={[
      {title: '예약 내역', icon: 'calendar', onPress: () => nav.go({name: 'bookings'})},
      {title: '정비 예약하기', detail: '예약', icon: 'wrench', onPress: () => nav.go({name: 'reserve'})},
      {title: '작업사진·현황', detail: '확인하기', icon: 'check', onPress: () => nav.go({name: 'work'})},
    ]}/>
    <MyMenuSection title="혜택" items={[
      {title: '내 쿠폰', icon: 'flag', onPress: () => nav.go({name: 'coupons'})},
      {title: '이벤트', icon: 'flag', onPress: () => nav.go({name: 'events'})},
    ]}/>
  </>;
}
export function MyAccountMenu({onLogout}: {onLogout(): void}) {
  const nav = useNav();
  return <MyMenuSection title="계정" items={[
    {title: '알림', icon: 'bell', onPress: () => nav.go({name: 'notifications'})},
    {title: '앱 알림 설정', icon: 'bell', onPress: () => nav.go({name: 'notification-settings'})},
    {title: '개인정보 처리방침', icon: 'lock', onPress: () => nav.go({name: 'privacy'})},
    {title: '이용약관', icon: 'doc', onPress: () => nav.go({name: 'terms'})},
    {title: '로그아웃', icon: 'lock', onPress: onLogout},
  ]}/>;
}
