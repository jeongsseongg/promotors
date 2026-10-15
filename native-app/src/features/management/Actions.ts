import {useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
export const koreanDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '.');
export function confirmAction(title: string, message: string, label = '확인', destructive = false) {
  return new Promise<boolean>(resolve => Alert.alert(title, message, [{text: '취소', style: 'cancel', onPress: () => resolve(false)},
    {text: label, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true)}], {cancelable: true, onDismiss: () => resolve(false)}));
}
export function useManagementAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const state = useRef({busy: false, active: true}).current;
  useEffect(() => {state.active = true; return () => {state.active = false;};}, [state]);
  async function run<T>(action: () => Promise<T>, success?: (value: T) => void) {
    if (state.busy) return; state.busy = true; setBusy(true); setError(''); setNotice('');
    try {const value = await action(); if (state.active) success?.(value);}
    catch (failure) {if (state.active) setError(failure instanceof Error ? failure.message : '저장하지 못했습니다. 다시 시도해 주세요.');}
    finally {state.busy = false; if (state.active) setBusy(false);}
  }
  return {busy, error, notice, setNotice, run};
}
