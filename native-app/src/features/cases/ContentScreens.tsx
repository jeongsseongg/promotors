import React, {useCallback, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {AssetImage} from '../../components/Media';
import {PhotoViewer} from '../../components/PhotoViewer';
import {ArticleBody} from './ArticleBody';
import {ui} from '../../theme/styles';

export function ContentListScreen({kind}: {kind: 'case' | 'notice'}) {
  const services = useServices(), nav = useNav();
  const [branch, setBranch] = useState('');
  const resource = useResource(useCallback(() => services.publicContent.load(), [services]));
  const rows = kind === 'case' ? resource.data?.cases : resource.data?.notices;
  const filtered = (rows || []).filter(row => !branch || row.branch === branch);
  return <Screen title={kind === 'case' ? '정비사례' : '공지사항'} refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>{kind === 'case' ? '프로모터스의 작업 기록' : '프로모터스 소식'}</Text>
    {kind === 'case' ? <View style={ui.wrap}><Choice label="전체" selected={!branch} onPress={() => setBranch('')}/>
      {resource.data?.branches.map(row => <Choice key={row.name} label={row.name} selected={branch === row.name} onPress={() => setBranch(row.name)}/>)}</View> : null}
    <DataState loading={resource.loading && !resource.data} error={resource.error}
      empty={!resource.loading && !resource.error && !filtered.length ? '등록된 내용이 없습니다.' : ''} onRetry={resource.reload}/>
    {filtered.map((row, index) => <Pressable key={row.id || String(index)} accessibilityRole="button" style={ui.card}
      onPress={() => nav.go({name: kind, id: String(row.id || index)})}>
      {row.imageKeys?.[0] ? <AssetImage assetKey={row.imageKeys[0]} label={row.title || '정비 사진'}/> : null}
      <Text style={ui.muted}>{[row.branch, row.date].filter(Boolean).join(' · ')}</Text>
      <Text style={ui.heading}>{row.title}</Text><Text style={ui.muted}>자세히 보기 ›</Text>
    </Pressable>)}
  </Screen>;
}
export function ContentDetailScreen({kind, id}: {kind: 'case' | 'notice'; id: string}) {
  const services = useServices(), nav = useNav(), [photo, setPhoto] = useState('');
  const resource = useResource(useCallback(() => services.publicContent.load(), [services]));
  const rows = kind === 'case' ? resource.data?.cases : resource.data?.notices;
  const post = rows?.find((row, index) => String(row.id || index) === id);
  return <Screen title={kind === 'case' ? '정비사례' : '공지사항'} onBack={nav.back}>
    <DataState loading={resource.loading} error={resource.error}
      empty={!resource.loading && !resource.error && !post ? '내용이 없거나 더 이상 공개되지 않습니다.' : ''} onRetry={resource.reload}/>
    {post ? <View style={ui.stack}><Text style={ui.title}>{post.title}</Text>
      <Text style={ui.muted}>{[post.branch, post.date, post.model].filter(Boolean).join(' · ')}</Text>
      <ArticleBody html={post.bodyHtml || post.body || ''} imageKeys={post.imageKeys || []} title={post.title || '정비사진'} onPhoto={setPhoto}/>
    </View> : null}
    <PhotoViewer uri={photo} onClose={() => setPhoto('')}/>
  </Screen>;
}
