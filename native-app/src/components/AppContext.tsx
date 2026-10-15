import React, {createContext, useContext} from 'react';
import type {createNativeServices} from '../api/services';

export type NativeServices = ReturnType<typeof createNativeServices>;
export type PushStatus = {permission: 'granted' | 'denied' | 'notDetermined'; connected: boolean; deviceId?: string};
export type NativePush = {status(): Promise<PushStatus>; connect(): Promise<void>; disconnect(): Promise<void>; openSettings(): Promise<void>};
export type Tab = 'home' | 'branches' | 'cases' | 'notices' | 'my';
export type Route =
  | {name: Tab}
  | {name: 'login' | 'signup' | 'reserve' | 'bookings' | 'profile' | 'history' | 'work' | 'inquiry' | 'coupons' | 'events' | 'deletion' | 'notifications' | 'notification-settings' | 'admin' | 'guest-lookup' | 'privacy' | 'terms'}
  | {name: 'case' | 'notice' | 'booking' | 'admin-booking'; id: string};
export type Navigation = {go(route: Route): void; back(): void};
const Services = createContext<NativeServices | null>(null);
const Push = createContext<NativePush | null>(null);
const Nav = createContext<Navigation | null>(null);
export function AppContext({services, push, navigation, children}: {services: NativeServices; push: NativePush; navigation: Navigation; children: React.ReactNode}) {
  return <Services.Provider value={services}><Push.Provider value={push}><Nav.Provider value={navigation}>{children}</Nav.Provider></Push.Provider></Services.Provider>;
}
export function useServices() {const value = useContext(Services); if (!value) throw new Error('서비스가 연결되지 않았습니다.'); return value;}
export function usePush() {const value = useContext(Push); if (!value) throw new Error('기기 알림이 연결되지 않았습니다.'); return value;}
export function useNav() {const value = useContext(Nav); if (!value) throw new Error('화면 이동을 준비하지 못했습니다.'); return value;}
