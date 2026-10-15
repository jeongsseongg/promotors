import React, {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field, MenuRow} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {ui} from '../../theme/styles';
import {PasswordForm} from './PasswordForm';

export function ProfileScreen() {
  const services = useServices(), nav = useNav(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [form, setForm] = useState({name: '', model: '', phone: '', email: '', address: ''});
  const resource = useResource(useCallback(() => services.account.load(), [services]));
  useEffect(() => {if (resource.data?.profile) {const p = resource.data.profile; setForm({name: p.name || '', model: p.model || '', phone: p.phone || '', email: p.email || '', address: p.address || ''});}}, [resource.data]);
  function update(key: keyof typeof form, value: string) {setForm(current => ({...current, [key]: value})); setSaved(false);}
  async function save() {
    if (busy) return;
    if (!form.name.trim()) {setError('이름을 입력해 주세요.'); return;}
    if (!/^01\d{8,9}$/.test(form.phone.replace(/[^0-9]/g, ''))) {setError('휴대폰번호를 정확히 입력해 주세요.'); return;}
    setBusy(true); setError(''); setSaved(false);
    try {await services.account.updateProfile(form); setSaved(true);}
    catch (e) {setError(e instanceof Error ? e.message : '정보를 저장하지 못했습니다. 입력 내용은 유지됩니다.');}
    finally {setBusy(false);}
  }
  return <Screen title="내 차 · 회원정보" onBack={nav.back}>
    <DataState loading={resource.loading} error={resource.error} onRetry={resource.reload}/>
    {resource.data?.profile ? <View style={ui.card}><Text style={ui.heading}>내 정보</Text>
      <Field label="아이디" value={resource.data.profile.id} editable={false}/>
      <Field label="이름" value={form.name} onChangeText={v => update('name', v)}/>
      <Field label="차량명" value={form.model} onChangeText={v => update('model', v)}/>
      <Field label="차량번호" value={resource.data.profile.car} editable={false}/><Text style={ui.muted}>정비 이력을 연결하기 위해 차량번호 변경은 지점에 요청해 주세요.</Text>
      <Field label="휴대폰번호" value={form.phone} onChangeText={v => update('phone', v)} keyboardType="phone-pad"/>
      <Field label="이메일 (선택)" value={form.email} onChangeText={v => update('email', v)} autoCapitalize="none" keyboardType="email-address"/>
      <Field label="주소 (선택)" value={form.address} onChangeText={v => update('address', v)}/>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}{saved ? <Text accessibilityRole="alert" style={ui.body}>회원정보가 저장되었습니다.</Text> : null}
      <Button label="정보 저장" busy={busy} onPress={() => void save()}/></View> : null}
    <PasswordForm/><View style={ui.card}><MenuRow title="회원 탈퇴" danger onPress={() => nav.go({name: 'deletion'})}/></View>
  </Screen>;
}
