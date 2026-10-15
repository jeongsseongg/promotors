import React from 'react';
import {Switch, Text, View} from 'react-native';
import {Field, MenuRow} from '../../components/Controls';
import {useNav} from '../../components/AppContext';
import {ui} from '../../theme/styles';

export type SignupValues = {name: string; model: string; car: string; phone: string; birthday: string; email: string; address: string; confirmation: string; agreed: boolean};
export function validateSignup(id: string, password: string, values: SignupValues) {
  if (!/^[A-Za-z0-9._-]{4,40}$/.test(id.trim())) return '아이디는 영문·숫자·점·밑줄·하이픈 4~40자로 입력해 주세요.';
  if (password.length < 10 || !/[A-Za-z가-힣]/.test(password) || !/\d/.test(password)) return '비밀번호는 문자와 숫자를 포함해 10자 이상 입력해 주세요.';
  if (password !== values.confirmation) return '비밀번호 확인이 일치하지 않습니다.';
  if (!values.name.trim() || !values.model.trim() || !values.car.trim()) return '이름, 차량명, 차량번호를 입력해 주세요.';
  if (!/^01\d{8,9}$/.test(values.phone.replace(/[^0-9]/g, ''))) return '휴대폰번호를 정확히 입력해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthday)) return '생일을 연도-월-일 형식으로 입력해 주세요.';
  const birth = new Date(values.birthday);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== values.birthday || birth > new Date()) return '생일을 정확히 입력해 주세요.';
  if (!values.agreed) return '이용약관과 개인정보 처리 안내를 확인해 주세요.';
  return '';
}
export function SignupFields({values, onChange}: {values: SignupValues; onChange: (values: SignupValues) => void}) {
  const nav = useNav();
  const field = (key: keyof SignupValues, value: string | boolean) => onChange({...values, [key]: value});
  return <View style={ui.stack}>
    <Text style={ui.muted}>비밀번호는 문자와 숫자를 포함해 10자 이상 입력해 주세요.</Text>
    <Field label="비밀번호 확인" value={values.confirmation} onChangeText={v => field('confirmation', v)} secureTextEntry textContentType="newPassword"/>
    <Field label="이름" value={values.name} onChangeText={v => field('name', v)} textContentType="name"/>
    <Field label="차량명" placeholder="예: BMW 520d" value={values.model} onChangeText={v => field('model', v)}/>
    <Field label="차량번호" placeholder="예: 12가3456" value={values.car} onChangeText={v => field('car', v)} autoCapitalize="characters"/>
    <Field label="휴대폰번호" value={values.phone} onChangeText={v => field('phone', v)} keyboardType="phone-pad" textContentType="telephoneNumber"/>
    <Field label="생일" placeholder="1990-01-01" value={values.birthday} onChangeText={v => field('birthday', v)} keyboardType="numbers-and-punctuation" maxLength={10}/>
    <Field label="이메일 (선택)" value={values.email} onChangeText={v => field('email', v)} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress"/>
    <Field label="주소 (선택)" value={values.address} onChangeText={v => field('address', v)} textContentType="fullStreetAddress"/>
    <View style={ui.card}><MenuRow title="이용약관" onPress={() => nav.go({name: 'terms'})}/><MenuRow title="개인정보 처리방침" onPress={() => nav.go({name: 'privacy'})}/>
      <View style={ui.spread}><Text style={[ui.body, ui.flex]}>필수 안내를 확인하고 동의합니다.</Text><Switch accessibilityLabel="필수 이용 안내 동의" value={values.agreed} onValueChange={v => field('agreed', v)}/></View></View>
  </View>;
}
