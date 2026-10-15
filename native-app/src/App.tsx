import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, AppState, BackHandler, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppContext, NativePush, NativeServices, Route, Tab} from './components/AppContext';
import {Screen} from './components/Screen';
import {Button} from './components/Controls';
import {TabBar} from './components/Navigation';
import {HomeScreen} from './features/home/HomeScreen';
import {BranchesScreen} from './features/branches/BranchesScreen';
import {ContentDetailScreen, ContentListScreen} from './features/cases/ContentScreens';
import {AuthScreen} from './features/auth/AuthScreen';
import {SignupFlow} from './features/auth/SignupFlow';
import {ReserveScreen} from './features/booking/ReserveScreen';
import {BookingDetailScreen, BookingsScreen} from './features/booking/BookingScreens';
import {GuestLookupScreen} from './features/booking/GuestLookupScreen';
import {MyScreen} from './features/account/MyScreen';
import {WorkScreen} from './features/account/WorkScreens';
import {InquiryScreen} from './features/account/InquiryScreen';
import {ProfileScreen} from './features/account/ProfileScreen';
import {PromotionsScreen} from './features/account/PromotionsScreen';
import {DeletionScreen} from './features/account/DeletionScreen';
import {LegalScreen} from './features/account/LegalScreen';
import {ManagementScreen} from './features/management/ManagementScreen';
import {AdminScheduleScreen} from './features/admin/AdminScheduleScreen';
import {AdminBookingScreen} from './features/admin/AdminBookingScreen';
import {NotificationsScreen, routeForNotification} from './features/notifications/NotificationsScreen';
import {NotificationSettingsScreen} from './features/notifications/NotificationSettingsScreen';
import {ui} from './theme/styles';
import {color} from './theme/tokens';

export type AppProps = {services: NativeServices; push: NativePush; initialRoute?: Route};
const tabs = new Set(['home', 'branches', 'cases', 'notices', 'my']);
const privateRoutes = new Set(['bookings', 'booking', 'profile', 'history', 'work', 'inquiry', 'coupons', 'events', 'notifications', 'notification-settings', 'admin', 'admin-booking', 'management']);
function Content({route}: {route: Route}) {
  switch (route.name) {
    case 'home': return <HomeScreen/>;
    case 'branches': return <BranchesScreen/>;
    case 'cases': return <ContentListScreen kind="case"/>;
    case 'notices': return <ContentListScreen kind="notice"/>;
    case 'case': return <ContentDetailScreen kind="case" id={route.id}/>;
    case 'notice': return <ContentDetailScreen kind="notice" id={route.id}/>;
    case 'my': return <MyScreen/>;
    case 'login': return <AuthScreen/>;
    case 'signup': return <AuthScreen signup/>;
    case 'reserve': return <ReserveScreen/>;
    case 'bookings': return <BookingsScreen/>;
    case 'booking': return <BookingDetailScreen id={route.id}/>;
    case 'guest-lookup': return <GuestLookupScreen/>;
    case 'profile': return <ProfileScreen/>;
    case 'history': return <WorkScreen history/>;
    case 'work': return <WorkScreen/>;
    case 'inquiry': return <InquiryScreen/>;
    case 'coupons': return <PromotionsScreen/>;
    case 'events': return <PromotionsScreen events/>;
    case 'deletion': return <DeletionScreen/>;
    case 'privacy': return <LegalScreen kind="privacy"/>;
    case 'terms': return <LegalScreen kind="terms"/>;
    case 'management': return <ManagementScreen key={(route.section || 'menu') + ':' + (route.id || '')} section={route.section} id={route.id}/>;
    case 'admin': return <AdminScheduleScreen/>;
    case 'admin-booking': return <AdminBookingScreen id={route.id} notice={route.notice}/>;
    case 'notifications': return <NotificationsScreen/>;
    case 'notification-settings': return <NotificationSettingsScreen/>;
  }
}
export default function App({services, push, initialRoute}: AppProps) {
  const [session, setSession] = useState(services.session.snapshot());
  const [restoreError, setRestoreError] = useState('');
  const [stack, setStack] = useState<Route[]>([initialRoute || {name: 'home'}]);
  const go = useCallback((route: Route) => setStack(current => tabs.has(route.name) ? [route] : [...current, route]), []);
  const back = useCallback(() => setStack(current => current.length > 1 ? current.slice(0, -1) : [{name: 'home'}]), []);
  const navigation = useMemo(() => ({go, back}), [go, back]);
  useEffect(() => services.session.subscribe(setSession), [services]);
  useEffect(() => services.notifications.subscribeOpen(target => {const current = services.session.snapshot(); if (current.authenticated) go(routeForNotification(target, current.role !== 'customer'));}), [go, services]);
  const restore = useCallback(async () => {setRestoreError(''); try {await services.session.restore();} catch (error) {setRestoreError(error instanceof Error ? error.message : '로그인 상태를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');}}, [services]);
  useEffect(() => {void restore();}, [restore]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {if (stack.length > 1) {back(); return true;} return false;});
    return () => listener.remove();
  }, [back, stack.length]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {if (state === 'active' && services.session.snapshot().authenticated) void services.session.refresh().catch(() => {});});
    return () => listener.remove();
  }, [services]);
  const route = stack[stack.length - 1];
  const signupLegal = (route.name === 'terms' || route.name === 'privacy') && stack[stack.length - 2]?.name === 'signup' ? route.name : undefined;
  const signupFlow = route.name === 'signup' || !!signupLegal;
  const protectedRoute = privateRoutes.has(route.name) && !session.authenticated;
  const adminRoute = route.name === 'admin' || route.name === 'admin-booking' || route.name === 'management';
  const adminForbidden = adminRoute && session.authenticated && session.role === 'customer';
  return <SafeAreaProvider><StatusBar barStyle="dark-content"/>
    <AppContext services={services} push={push} navigation={navigation}>
      {restoreError ? <Screen title="연결 확인"><Text accessibilityRole="alert" style={ui.error}>{restoreError}</Text><Button label="다시 시도" onPress={() => void restore()}/><Button secondary label="소개 화면 보기" onPress={() => {setRestoreError(''); go({name: 'home'});}}/></Screen> : session.status === 'restoring' ? <View style={styles.loading}><ActivityIndicator color={color.navy}/><Text style={ui.body}>로그인 상태를 확인하고 있어요.</Text></View> :
        <View style={ui.flex} key={session.authenticated ? [session.profile?.id, session.profile?.car, session.role, session.branches.join('|'), session.privacyEpoch].join(':') : 'signed-out'}>
          {protectedRoute ? <AuthScreen/> : adminForbidden ? <MyScreen/> : signupFlow ? <SignupFlow legal={signupLegal}/> : <Content key={stack.length + ':' + route.name + ('id' in route ? ':' + route.id : '')} route={route}/>}
          {tabs.has(route.name) ? <TabBar active={route.name as Tab} onChange={tab => go({name: tab})}/> : null}
        </View>}
    </AppContext>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.background, gap: 16}});
