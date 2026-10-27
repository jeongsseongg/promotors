import React, {useEffect, useRef, useState} from 'react';
import {Alert, Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';
import {SignupFields, SignupValues, validateSignup} from './SignupFields';
import {LoginCheck, LoginFields} from './LoginFields';
import {authStyles as styles} from './authStyles';

export function AuthScreen({signup = false}: {signup?: boolean}) {
  const services = useServices(), nav = useNav(), edited = useRef(false);
  const [admin, setAdmin] = useState(false), [id, setId] = useState(''), [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true), [rememberId, setRememberId] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [profile, setProfile] = useState<SignupValues>({name: '', model: '', car: '', phone: '', birthday: '', email: '', address: '', confirmation: '', agreed: false});
  useEffect(() => {
    if (signup || !services.rememberedLogin) return;
    let active = true;
    void services.rememberedLogin.read().then(value => {if (active && !edited.current && value) {setId(value); setRememberId(true);}}).catch(() => {});
    return () => {active = false;};
  }, [services, signup]);
  async function submit() {
    if (busy) return; setError('');
    if (!password || (!admin && !id.trim())) {setError('아이디와 비밀번호를 입력해 주세요.'); return;}
    if (signup) {const invalid = validateSignup(id, password, profile); if (invalid) {setError(invalid); return;}}
    setBusy(true);
    try {
      if (signup) await services.session.register({id: id.trim(), name: profile.name.trim(), model: profile.model.trim(), car: profile.car.replace(/\s/g, ''), phone: profile.phone, birthday: profile.birthday, email: profile.email, address: profile.address}, password);
      else if (admin) await services.session.loginAdmin(password, remember);
      else {
        await services.session.loginMember(id.trim(), password, remember);
        try {await services.rememberedLogin?.write(rememberId ? id.trim() : null);}
        catch {Alert.alert('아이디 저장 안내', '로그인은 완료됐지만 아이디를 기억하지 못했습니다. 다음 로그인 때 다시 입력해 주세요.');}
      }
      setPassword(''); nav.go({name: 'my'});
    } catch (e) {setError(e instanceof Error ? e.message : '로그인하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }
  return <Screen title={signup ? '회원가입' : '회원 로그인'} plain hideHeader onBack={nav.back} contentStyle={styles.content}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{signup ? '회원 가입' : admin ? '관리자 로그인' : '회원 로그인'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={nav.back} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
    <View style={styles.tabs}>{[['로그인', false], ['회원가입', true]].map(([label, selected]) => <Pressable key={String(label)} accessibilityRole="tab" accessibilityLabel={String(label)} accessibilityState={{selected: signup === selected}}
      onPress={() => nav.go({name: selected ? 'signup' : 'login'})} style={[styles.tab, signup === selected && styles.activeTab]}><Text style={[styles.tabText, signup === selected && styles.activeTabText]}>{label}</Text></Pressable>)}</View>
    <View style={styles.form}><LoginFields admin={admin} signup={signup} id={id} password={password} onId={value => {edited.current = true; setId(value);}} onPassword={setPassword}/>
      {signup ? <SignupFields values={profile} onChange={setProfile}/> : <View style={styles.checks}>
        {!admin && services.rememberedLogin ? <LoginCheck label="아이디 기억하기" checked={rememberId} onChange={setRememberId}/> : null}
        <LoginCheck label="자동로그인" checked={remember} onChange={setRemember}/></View>}
      <Text accessibilityRole={error ? 'alert' : undefined} style={[ui.error, styles.error]}>{error}</Text></View>
    <View style={styles.actions}><View style={styles.primary}><Button brand appearance="modal" label={signup ? '가입하기' : '로그인'} busy={busy} onPress={() => void submit()} testID="auth-submit"/></View>
      <View style={styles.cancel}><Button brand secondary appearance="modal" label="취소" onPress={nav.back}/></View></View>
    {!signup ? <View style={styles.secondary}><View style={styles.links}><Choice compact label={admin ? '고객 로그인' : '관리자 로그인'} selected={admin} onPress={() => {setAdmin(!admin); setPassword(''); setError('');}}/>
      <AuthLink label="비회원 예약 조회" onPress={() => nav.go({name: 'guest-lookup'})}/><AuthLink label="탈퇴 처리 상태" onPress={() => nav.go({name: 'deletion'})}/></View>
      <AuthLink label="비밀번호를 잊으셨나요? 매장 문의" onPress={() => {Alert.alert('매장에 문의해 주세요', '등록한 이름과 차량번호를 알려주시면 계정 확인을 도와드립니다.'); nav.go({name: 'branches'});}}/></View> : null}
  </Screen>;
}
function AuthLink({label, onPress}: {label: string; onPress(): void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.link}><Text style={styles.linkText}>{label}</Text></Pressable>;
}
