import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {ui} from '../../theme/styles';
import {color} from '../../theme/tokens';

export function InquiryScreen() {
  const services = useServices(), nav = useNav(), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const resource = useResource(useCallback(() => services.account.load(), [services]));
  async function send() {
    if (!message.trim() || busy) return;
    setBusy(true); setError('');
    try {await services.account.sendInquiry(message.trim()); setMessage(''); await resource.reload();}
    catch (e) {setError(e instanceof Error ? e.message : '메시지를 보내지 못했습니다. 입력 내용은 유지됩니다.');}
    finally {setBusy(false);}
  }
  return <Screen title="공업사의 TIP · 문의" onBack={nav.back} refreshing={resource.loading} onRefresh={resource.reload}
    footer={<><Field label="문의 내용" value={message} onChangeText={setMessage} multiline maxLength={3000}/>{error ? <Text style={ui.error}>{error}</Text> : null}<Button label="보내기" busy={busy} disabled={!message.trim()} onPress={() => void send()}/></>}>
    <Text style={ui.muted}>차량 상태나 정비에 대해 궁금한 점을 남겨 주세요.</Text>
    <DataState loading={resource.loading && !resource.data} error={resource.error} empty={!resource.loading && !resource.data?.messages.length ? '아직 주고받은 메시지가 없습니다.' : ''} onRetry={resource.reload}/>
    {resource.data?.messages.map(row => <View key={row.id} style={[ui.card, row.from === 'customer' && {backgroundColor: color.softNavy}]}>
      <Text style={ui.label}>{row.from === 'admin' ? '프로모터스' : '내 문의'}</Text><Text selectable style={ui.body}>{row.message}</Text>
      <Text style={ui.muted}>{row.createdAt ? new Date(row.createdAt).toLocaleString('ko-KR') : ''}</Text>
    </View>)}
  </Screen>;
}
