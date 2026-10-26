import React, {useCallback, useState} from 'react';
import {Alert, Linking, Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice} from '../../components/Controls';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useResource} from '../../components/DataState';
import {PhotoViewer} from '../../components/PhotoViewer';
import {ArticleBody} from './ArticleBody';
import {ui} from '../../theme/styles';
import {CaseCards, CasePhoto} from './CaseCards';

export function ContentListScreen({kind}: {kind: 'case' | 'notice'}) {
  const services = useServices();
  const [branch, setBranch] = useState('');
  const resource = useResource(useCallback(() => kind === 'case' ? services.publicContent.caseFeed(true) : services.publicContent.load(), [kind, services]));
  const rows = kind === 'case' ? resource.data?.cases : resource.data?.notices;
  const filtered = (rows || []).filter(row => !branch || row.branch === branch);
  return <Screen title={kind === 'case' ? '정비사례' : '공지사항'} refreshing={resource.loading} onRefresh={resource.reload}>
    <Text style={ui.title}>{kind === 'case' ? '프로모터스의 작업 기록' : '프로모터스 소식'}</Text>
    {kind === 'case' ? <View style={ui.wrap}><Choice label="전체" selected={!branch} onPress={() => setBranch('')}/>
      {resource.data?.branches.map(row => <Choice key={row.name} label={row.name} selected={branch === row.name} onPress={() => setBranch(row.name)}/>)}</View> : null}
    <DataState loading={resource.loading && !resource.data} error={resource.error}
      empty={!resource.loading && !resource.error && !filtered.length ? '등록된 내용이 없습니다.' : ''} onRetry={resource.reload}/>
    {resource.data?.caseFeedErrors?.length ? <Text accessibilityRole="alert" style={ui.error}>{resource.data.caseFeedErrors.join(' · ')} 정비사례를 불러오지 못했습니다. 화면을 당겨 다시 확인해 주세요.</Text> : null}
    <CaseCards rows={filtered} kind={kind}/>
  </Screen>;
}
export function ContentDetailScreen({kind, id}: {kind: 'case' | 'notice'; id: string}) {
  const services = useServices(), nav = useNav(), [photo, setPhoto] = useState('');
  const resource = useResource(useCallback(() => kind === 'case' ? services.publicContent.caseFeed() : services.publicContent.load(), [kind, services]));
  const rows = kind === 'case' ? resource.data?.cases : resource.data?.notices;
  const post = rows?.find((row, index) => String(row.id || index) === id);
  return <Screen title={kind === 'case' ? '정비사례' : '공지사항'} onBack={nav.back}>
    <DataState loading={resource.loading} error={resource.error}
      empty={!resource.loading && !resource.error && !post ? '내용이 없거나 더 이상 공개되지 않습니다.' : ''} onRetry={resource.reload}/>
    {post ? <View style={ui.stack}><Text style={ui.title}>{post.title}</Text>
      <Text style={ui.muted}>{[post.branch, post.date, post.model].filter(Boolean).join(' · ')}</Text>
      {post.imageUrls?.map(uri => <CasePhoto key={uri} uri={uri} title={post.title} onPress={setPhoto}/>)}
      <ArticleBody html={post.bodyHtml || post.body || ''} imageKeys={post.imageKeys || []} title={post.title || '정비사진'} onPhoto={setPhoto}/>
      {post.sourceUrl && /^https:\/\/(blog|m\.blog)\.naver\.com\//.test(post.sourceUrl) ? <Button brand secondary label="블로그 원문 보기" onPress={() => void Linking.openURL(post.sourceUrl!).catch(() => Alert.alert('블로그를 열지 못했어요', '잠시 후 다시 시도해 주세요.'))}/> : null}
    </View> : null}
    <PhotoViewer uri={photo} onClose={() => setPhoto('')}/>
  </Screen>;
}
