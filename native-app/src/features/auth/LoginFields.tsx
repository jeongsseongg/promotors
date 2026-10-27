import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Field} from '../../components/Controls';
import {authStyles as styles} from './authStyles';

type Props = {admin: boolean; signup: boolean; id: string; password: string; onId(value: string): void; onPassword(value: string): void};
export function LoginFields({admin, signup, id, password, onId, onPassword}: Props) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.form}>
    {!admin ? <Field label="아이디" hideLabel={!signup} placeholder="아이디" style={styles.input} value={id} onChangeText={onId}
      autoCapitalize="none" autoCorrect={false} textContentType="username" testID="auth-id"/> : null}
    <View style={styles.password}>
      <Field label={admin ? '관리자 비밀번호' : '비밀번호'} hideLabel placeholder={admin ? '관리자 비밀번호' : '비밀번호'}
        style={[styles.input, styles.passwordInput]} value={password} onChangeText={onPassword} secureTextEntry={!visible}
        textContentType={signup ? 'newPassword' : 'password'} autoCapitalize="none" testID="auth-password"/>
      <Pressable accessibilityRole="button" accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        accessibilityState={{expanded: visible}} style={styles.eye} onPress={() => setVisible(value => !value)}>
        <Text style={styles.eyeText}>{visible ? '숨김' : '보기'}</Text>
      </Pressable>
    </View>
  </View>;
}
export function LoginCheck({label, checked, onChange}: {label: string; checked: boolean; onChange(value: boolean): void}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked}} hitSlop={6} onPress={() => onChange(!checked)} style={styles.check}>
    <View style={[styles.box, checked && styles.checkedBox]}><Text style={styles.tick}>{checked ? '✓' : ''}</Text></View>
    <Text style={styles.checkLabel}>{label}</Text>
  </Pressable>;
}
