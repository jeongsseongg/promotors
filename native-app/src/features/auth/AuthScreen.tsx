import React, {useState} from 'react';
import {Alert, Switch, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';
import {SignupFields, SignupValues, validateSignup} from './SignupFields';

export function AuthScreen({signup = false}: {signup?: boolean}) {
  const services = useServices(), nav = useNav();
  const [admin, setAdmin] = useState(false), [id, setId] = useState(''), [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [profile, setProfile] = useState<SignupValues>({name: '', model: '', car: '', phone: '', birthday: '', email: '', address: '', confirmation: '', agreed: false});
  async function submit() {
    if (busy) return;
    setError('');
    if (!password || (!admin && !id.trim())) {setError('아이디와 비밀번호를 입력해 주세요.'); return;}
    if (signup) {const invalid = validateSignup(id, password, profile); if (invalid) {setError(invalid); return;}}
    setBusy(true);
    try {
      if (signup) await services.session.register({id: id.trim(), name: profile.name.trim(), model: profile.model.trim(), car: profile.car.replace(/\s/g, ''), phone: profile.phone, birthday: profile.birthday, email: profile.email, address: profile.address}, password);
      else if (admin) await services.session.loginAdmin(password, remember);
      else await services.session.loginMember(id.trim(), password, remember);
      setPassword(''); nav.go({name: 'my'});
    } catch (e) {setError(e instanceof Error ? e.message : '로그인하지 못했습니다. 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }
  return <Screen title={signup ? '회원가입' : '로그인'} onBack={nav.back}
    footer={<Button label={signup ? '가입하기' : '로그인'} busy={busy} onPress={() => void submit()} testID="auth-submit"/>}>
    <Text style={ui.title}>{signup ? '내 차 관리의 시작' : '다시 만나 반가워요.'}</Text>
    <Text style={ui.muted}>{signup ? '예약과 정비 이력을 한곳에서 확인하세요.' : '프로모터스 계정으로 로그인해 주세요.'}</Text>
    {!signup ? <View style={ui.row}><Choice label="고객 로그인" selected={!admin} onPress={() => setAdmin(false)}/><Choice label="관리자 로그인" selected={admin} onPress={() => setAdmin(true)}/></View> : null}
    {!admin ? <Field label="아이디" value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} textContentType="username" testID="auth-id"/> : null}
    <Field label={admin ? '관리자 비밀번호' : '비밀번호'} value={password} onChangeText={setPassword} secureTextEntry textContentType={signup ? 'newPassword' : 'password'} autoCapitalize="none" testID="auth-password"/>
    {signup ? <SignupFields values={profile} onChange={setProfile}/> : <View style={ui.spread}><Text style={ui.body}>로그인 유지</Text><Switch accessibilityLabel="로그인 유지" value={remember} onValueChange={setRemember}/></View>}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {!signup ? <Button secondary label="회원가입" onPress={() => nav.go({name: 'signup'})}/> : null}
    <Text style={ui.muted}>비밀번호를 잊으셨다면 이용 지점에 문의해 주세요.</Text>
    <Button secondary label="매장 문의" onPress={() => {Alert.alert('매장에 문의해 주세요', '등록한 이름과 차량번호를 알려주시면 계정 확인을 도와드립니다.'); nav.go({name: 'branches'});}}/>
  </Screen>;
}
