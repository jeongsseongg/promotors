import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Text, View} from 'react-native';
import {Button} from './Controls';
import {ui} from '../theme/styles';
import {color} from '../theme/tokens';

export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef({value: 0, busy: false}).current;
  const reload = useCallback(async () => {
    if (generation.busy) return;
    generation.busy = true;
    const current = ++generation.value;
    setLoading(true); setError('');
    try {const value = await load(); if (current === generation.value) setData(value);}
    catch (e) {if (current === generation.value) setError(e instanceof Error ? e.message : '정보를 불러오지 못했습니다. 다시 시도해 주세요.');}
    finally {if (current === generation.value) {setLoading(false); generation.busy = false;}}
  }, [generation, load]);
  useEffect(() => {void reload(); return () => {generation.value++; generation.busy = false;};}, [generation, reload]);
  return {data, error, loading, reload};
}
export function DataState({loading, error, empty, onRetry}: {loading: boolean; error?: string; empty?: string; onRetry: () => void}) {
  if (loading) return <View style={ui.card}><ActivityIndicator color={color.navy}/><Text style={ui.muted}>정보를 불러오고 있어요.</Text></View>;
  if (error) return <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Button secondary label="다시 시도" onPress={onRetry}/></View>;
  return empty ? <View style={ui.card}><Text style={ui.muted}>{empty}</Text></View> : null;
}

export function useForegroundRefresh(refresh: () => Promise<void>, interval: number) {
  useEffect(() => {
    const timer = setInterval(() => {if (AppState.currentState === 'active') void refresh();}, interval);
    const listener = AppState.addEventListener('change', state => {if (state === 'active') void refresh();});
    return () => {clearInterval(timer); listener.remove();};
  }, [interval, refresh]);
}
