import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Field, MenuRow} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {useNav, useServices} from '../../components/AppContext';
import {ui} from '../../theme/styles';
import {useManagementAction} from './Actions';

export function InquiriesManager({id}: {id?: string}) {
  const services = useServices(), nav = useNav(), [message, setMessage] = useState(''), action = useManagementAction();
  const resource = useResource(useCallback(async () => id ? services.adminInquiries.thread(id) : services.adminInquiries.list(), [services, id]));
  const thread = resource.data && !Array.isArray(resource.data) ? resource.data : null;
  return <Screen title={thread ? '문의 답변' : '고객 문의'} onBack={nav.back} onRefresh={resource.reload} refreshing={resource.loading}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    {Array.isArray(resource.data) ? [...resource.data].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 100).map(row => <View style={ui.card} key={row.id}>
      <MenuRow title={`${row.customer?.name || '고객'} · ${row.customer?.car || row.car || ''}`} detail={row.message}
        onPress={() => nav.go({name: 'management', section: 'inquiries', id: row.id})}/></View>) : null}
    {thread ? <><View style={ui.card}><Text style={ui.heading}>{thread.selected.customer?.name || '고객 문의'}</Text><Text style={ui.body}>{thread.selected.customer?.car || ''}</Text></View>
      {thread.items.map(item => <View key={item.id} style={ui.card}><Text style={ui.label}>{item.from === 'admin' ? '프로모터스' : '고객'}</Text>
        <Text selectable style={ui.body}>{item.message}</Text><Text style={ui.muted}>{item.createdAt}</Text></View>)}
      <View style={ui.card}><Field label="답변" value={message} onChangeText={setMessage} multiline maxLength={4000}/><Text style={ui.error}>{action.error}</Text>
        <Button label="답변 보내기" busy={action.busy} onPress={() => void action.run(() => services.adminInquiries.reply(id!, message), () => {setMessage(''); void resource.reload();})}/></View></> : null}
    {Array.isArray(resource.data) && !resource.data.length ? <Text style={ui.muted}>담당 지점의 문의가 없습니다.</Text> : null}
  </Screen>;
}
