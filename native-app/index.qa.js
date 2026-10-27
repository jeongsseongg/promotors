import React, {useEffect, useState} from 'react';
import {ActivityIndicator, AppRegistry, Image, LogBox, NativeModules, Platform, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import App from './src/App';
import {QaNativeControls} from './src/qa/QaNativeControls';
import {createQaEnvironment} from './src/qa/fixture-services';
import {name as appName} from './app.json';

LogBox.ignoreAllLogs(true);
global.__PROMOTORS_QA_NETWORK_ATTEMPTS__ = 0;
global.fetch = async () => {
  global.__PROMOTORS_QA_NETWORK_ATTEMPTS__ += 1;
  throw new Error('Debug QA에서는 운영 네트워크 요청을 허용하지 않습니다.');
};
function useQaReadiness(environment, rendered, onError) {
  useEffect(() => {
    if (!environment || !rendered) return;
    let active = true;
    const report = {screen: environment.screen, operationalRequests: global.__PROMOTORS_QA_NETWORK_ATTEMPTS__};
    if (Platform.OS !== 'ios') {
      console.info('PROMOTORS_NATIVE_QA_READY', JSON.stringify({...report, nativeViews: true}));
      return;
    }
    const method = NativeModules.PromotorsPush?.reportQaReady;
    if (!method) {onError('네이티브 테스트 준비 확인 기능이 없습니다.'); return;}
    Promise.resolve(method(report)).then(accepted => {
      if (!accepted) throw new Error('테스트 화면과 운영 요청 0건 확인을 통과하지 못했습니다.');
    }).catch(failure => {if (active) onError(failure instanceof Error ? failure.message : '네이티브 테스트 준비를 확인하지 못했습니다.');});
    return () => {active = false;};
  }, [environment, rendered, onError]);
}
function QaApp() {
  const [environment, setEnvironment] = useState(null);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(false);
  useQaReadiness(environment, rendered, setError);
  useEffect(() => {
    let active = true;
    const method = NativeModules.PromotorsPush?.getQaConfiguration;
    if (!method) {setError('승인된 네이티브 테스트 환경이 아닙니다.'); return;}
    Promise.resolve(method()).then(config => {
      if (!config || !['home', 'booking', 'mypage', 'admin', 'notifications', 'updates', 'setup', 'setup-denied', 'inbox', 'detail', 'customer', 'login', 'guest-booking', 'admin-mypage'].includes(config.screen)) throw new Error('Debug QA 설정을 확인해 주세요.');
      const imageUri = Image.resolveAssetSource(require('./assets/qa/workshop.png')).uri;
      if (active) {
        setEnvironment({...createQaEnvironment(config, imageUri), screen: config.screen, showNativeControls: ['admin', 'customer'].includes(config.screen)});
      }
    }).catch(failure => {if (active) setError(failure instanceof Error ? failure.message : '테스트 화면을 열지 못했습니다.');});
    return () => {active = false;};
  }, []);
  if (error) return <View style={styles.loading}><Text style={styles.error}>{error}</Text></View>;
  if (!environment) return <View style={styles.loading}><ActivityIndicator/><Text>네이티브 테스트 화면 준비 중</Text></View>;
  return <SafeAreaProvider style={styles.root} onLayout={() => setRendered(true)}><App services={environment.services} push={environment.push} initialRoute={environment.initialRoute} updates={environment.updates} notificationDisclosure="테스트 화면 · 예시 정보 · 실제 발송 없음"/>
    <SafeAreaView edges={['bottom']} style={styles.footer}>
      {environment.showNativeControls ? <QaNativeControls customer={environment.screen === 'customer'}/> : null}
      <View pointerEvents="none" style={styles.qa}><Text style={styles.qaText}>테스트 화면 · 예시 정보·이미지 · 실제 발송 없음</Text></View>
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({
  root: {flex: 1}, footer: {backgroundColor: '#EAF0F9'}, loading: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16},
  error: {fontSize: 18, color: '#B73232'}, qa: {paddingVertical: 4, backgroundColor: '#EAF0F9', alignItems: 'center'},
  qaText: {fontSize: 11, color: '#071E55'},
});
AppRegistry.registerComponent(appName, () => QaApp);
