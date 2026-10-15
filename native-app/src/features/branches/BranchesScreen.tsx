import React, {useCallback} from 'react';
import {Alert, Linking, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {ui} from '../../theme/styles';

async function open(url: string) {
  try {await Linking.openURL(url);} catch {Alert.alert('연결할 수 없어요', '전화 또는 지도 앱을 확인한 뒤 다시 시도해 주세요.');}
}
export function BranchesScreen() {
  const services = useServices(), nav = useNav();
  const resource = useResource(useCallback(() => services.publicContent.load(), [services]));
  return <Screen title="매장안내" refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>가까운 프로모터스를{ '\n' }찾아보세요.</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {resource.data?.branches.map((branch, index) => <View key={branch.name || String(index)} style={ui.card}>
      <AssetImage assetKey={branch.imageKeys?.[0] || branch.imageKey} label={branch.name}/>
      <Text style={ui.heading}>{branch.name}</Text><Text style={ui.body}>{branch.addr}</Text>
      <Text style={ui.muted}>{branch.tel}</Text>
      <View style={ui.row}><View style={ui.flex}><Button secondary label="전화하기" onPress={() => void open('tel:' + (branch.tel || '').replace(/[^0-9+]/g, ''))}/></View>
        <View style={ui.flex}><Button secondary label="길찾기" onPress={() => void open('https://map.naver.com/p/search/' + encodeURIComponent(branch.addr || branch.name))}/></View></View>
      <Button label="정비 예약" onPress={() => nav.go({name: 'reserve'})}/>
    </View>)}
  </Screen>;
}
