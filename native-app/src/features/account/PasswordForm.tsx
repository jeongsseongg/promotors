import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button, Field} from '../../components/Controls';
import {useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';

export function PasswordForm() {
  const services = useServices(), [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function change() {
    if (busy) return; setError(''); setSaved(false);
    if (next.length < 10 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {setError('새 비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.'); return;}
    if (next !== confirmation) {setError('새 비밀번호 확인이 일치하지 않습니다.'); return;}
    if (!current || current === next) {setError('현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.'); return;}
    setBusy(true);
    try {await services.account.changePassword(current, next); setCurrent(''); setNext(''); setConfirmation(''); setSaved(true);}
    catch (e) {setError(e instanceof Error ? e.message : '비밀번호를 변경하지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <View style={ui.card}><Text style={ui.heading}>비밀번호 변경</Text>
    <Field label="현재 비밀번호" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password"/>
    <Field label="새 비밀번호" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword"/>
    <Field label="새 비밀번호 확인" value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword"/>
    <Text style={ui.muted}>영문과 숫자를 포함해 10자 이상 입력해 주세요.</Text>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}{saved ? <Text accessibilityRole="alert" style={ui.body}>비밀번호가 변경되었습니다.</Text> : null}
    <Button secondary label="비밀번호 변경" busy={busy} onPress={() => void change()}/>
  </View>;
}
