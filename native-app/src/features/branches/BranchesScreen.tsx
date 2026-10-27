import React, {useCallback} from 'react';
import {Alert, Linking, Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import type {Branch} from '../../domain/types';
import {ui} from '../../theme/styles';
import {BranchPhotoGallery} from './BranchPhotoGallery';
import {branchStyles as styles} from './branchStyles';

export function branchMapUrl(branch: Branch) {
  if (typeof branch.map === 'string' && !/[\u0000-\u001F\u007F]/.test(branch.map)) {
    try {
      const parsed = new URL(branch.map.trim());
      if (['https:', 'http:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password) return parsed.href;
    } catch {}
  }
  return 'https://map.naver.com/p/search/' + encodeURIComponent(branch.addr || branch.name);
}
export function branchPhoneUrl(value?: string) {
  const phone = typeof value === 'string' ? value.replace(/[^0-9+]/g, '') : '';
  return /^\+?\d{7,15}$/.test(phone) ? 'tel:' + phone : '';
}
async function open(url: string) {
  try {await Linking.openURL(url);} catch {Alert.alert('연결할 수 없어요', '전화 또는 지도 앱을 확인한 뒤 다시 시도해 주세요.');}
}
function BranchContacts({branch}: {branch: Branch}) {
  const links = [{label: '전화하기', url: branchPhoneUrl(branch.tel)}, {label: '휴대폰 연결', url: branchPhoneUrl(branch.mobile)}, {label: '길찾기', url: branchMapUrl(branch)}].filter(link => !!link.url);
  return <View style={styles.contacts}>{links.map(link => <Pressable key={link.label} accessibilityRole="button" accessibilityLabel={link.label}
    onPress={() => void open(link.url)} style={({pressed}) => [styles.contact, pressed && styles.pressed]}><Text style={styles.contactText}>{link.label}</Text></Pressable>)}</View>;
}
export function BranchesScreen() {
  const services = useServices(), nav = useNav();
  const resource = useResource(useCallback(() => services.publicContent.load(), [services]));
  return <Screen title="매장안내" refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>가까운 프로모터스를{ '\n' }찾아보세요.</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {resource.data?.branches.map((branch, index) => <View key={branch.name || String(index)} style={ui.card}>
      <BranchPhotoGallery branch={branch} actions={<BranchContacts branch={branch}/>}/>
      <Text style={ui.heading}>{branch.name}</Text><Text style={ui.body}>{branch.addr}</Text><Text style={ui.muted}>{branch.tel}</Text>
      <BranchContacts branch={branch}/><Button label="정비 예약" onPress={() => nav.go({name: 'reserve'})}/>
    </View>)}
  </Screen>;
}
