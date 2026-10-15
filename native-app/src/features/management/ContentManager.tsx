import React, {useCallback, useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, MenuRow} from '../../components/Controls';
import {DataState, useResource} from '../../components/DataState';
import {useNav, useServices} from '../../components/AppContext';
import {ContentRow} from '../../domain/management';
import {JsonRecord, Branch, IntroSlide, PublicPost} from '../../domain/types';
import {WorkflowProduct} from '../../domain/management';
import {ui} from '../../theme/styles';
import {PostEditor, ProductEditor, BranchEditor, IntroEditor} from './ContentEditors';

const labels = {case: '정비사례', notice: '공지', product: '서비스', branch: '매장 정보', intro: '소개 사진'};
type Kind = keyof typeof labels;
export function ContentManager({id}: {id?: string}) {
  const services = useServices(), nav = useNav(), [kind, setKind] = useState<Kind>('case');
  const resource = useResource(useCallback(() => services.adminContent.list(), [services]));
  const [routeKind, routeIndex] = (id || '').split(':');
  if (resource.data && id && routeKind in labels) {
    const selected = routeKind as Kind, collections: Record<Kind, ContentRow[]> = {case: resource.data.cases, notice: resource.data.notices,
      product: resource.data.products, branch: resource.data.branches, intro: resource.data.introSlides};
    const row = routeIndex === 'new' ? undefined : collections[selected][Number(routeIndex)];
    if (routeIndex !== 'new' && !row) return <Screen title="게시글 · 매장 정보" onBack={nav.back}><Text style={ui.error}>편집할 항목이 없습니다. 목록을 다시 확인해 주세요.</Text></Screen>;
    if (selected === 'case' || selected === 'notice') return <PostEditor kind={selected} row={row as ContentRow<PublicPost> | undefined}/>;
    if (selected === 'product') return <ProductEditor row={row as ContentRow<WorkflowProduct> | undefined}/>;
    if (selected === 'branch') return <BranchEditor row={row as ContentRow<Branch> | undefined}/>;
    if (selected === 'intro') return <IntroEditor row={row as ContentRow<IntroSlide> | undefined}/>;
  }
  const collections: Record<Kind, ContentRow<JsonRecord>[]> = {case: resource.data?.cases || [], notice: resource.data?.notices || [],
    product: resource.data?.products || [], branch: resource.data?.branches || [], intro: resource.data?.introSlides || []};
  return <Screen title="게시글 · 매장 정보" onBack={nav.back} onRefresh={resource.reload} refreshing={resource.loading}>
    <DataState loading={resource.loading && !resource.data} error={resource.error} onRetry={resource.reload}/>
    <View style={ui.wrap}>{Object.entries(labels).map(([key, label]) => <Choice key={key} label={label} selected={kind === key} onPress={() => setKind(key as Kind)}/>)}</View>
    <Button label={`${labels[kind]} 추가`} onPress={() => nav.go({name: 'management', section: 'content', id: kind + ':new'})}/>
    {collections[kind].map(row => <View style={ui.card} key={row.reference.index}><MenuRow title={String(row.value.title || row.value.name || row.value.alt || `사진 ${row.reference.index + 1}`)}
      detail={String(row.value.date || row.value.addr || '')} onPress={() => nav.go({name: 'management', section: 'content', id: kind + ':' + row.reference.index})}/></View>)}
  </Screen>;
}
