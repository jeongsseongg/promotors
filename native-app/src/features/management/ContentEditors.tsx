import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../../components/Screen';
import {Button, Choice, Field} from '../../components/Controls';
import {AssetImage, plainText} from '../../components/Media';
import {useNav, useServices} from '../../components/AppContext';
import {Branch, IntroSlide, PublicPost} from '../../domain/types';
import {ContentRow, WorkflowProduct, ImagePrefix} from '../../domain/management';
import {ui} from '../../theme/styles';
import {confirmAction, koreanDay, useManagementAction} from './Actions';

function Photos({keys, onChange, prefix, limit = 10}: {keys: string[]; onChange: (keys: string[]) => void; prefix: ImagePrefix; limit?: number}) {
  const services = useServices(), action = useManagementAction();
  return <View style={ui.stack}>{keys.map((key, index) => <View style={ui.stack} key={key}><AssetImage assetKey={key} label={`사진 ${index + 1}`}/>
    <Button secondary label={`사진 ${index + 1} 빼기`} disabled={action.busy} onPress={() => onChange(keys.filter(item => item !== key))}/></View>)}
    <Button secondary label="사진 추가" disabled={keys.length >= limit} busy={action.busy}
      onPress={() => void action.run(() => services.adminAssets.pickAndUpload({source: 'library', prefix, limit: limit - keys.length}), added => onChange([...keys, ...added]))}/>
    <Text style={ui.error}>{action.error}</Text></View>;
}
export function PostEditor({kind, row}: {kind: 'case' | 'notice'; row?: ContentRow<PublicPost>}) {
  const services = useServices(), nav = useNav(), action = useManagementAction(), post = row?.value;
  const [title, setTitle] = useState(post?.title || ''), [date, setDate] = useState(post?.date || koreanDay()), [brand, setBrand] = useState(String(post?.brand || ''));
  const [body, setBody] = useState(plainText(post?.bodyHtml || post?.body)), [postUrl, setPostUrl] = useState(String(post?.postUrl || ''));
  const [scheduledAt, setScheduledAt] = useState(String(post?.scheduledAt || '')), [keys, setKeys] = useState(post?.imageKeys || []);
  const save = () => void confirmAction('게시글 저장', scheduledAt ? '설정한 시간에 게시되도록 저장할까요?' : '이 내용과 사진을 공개할까요?', '저장').then(yes => {
    if (yes) void action.run(() => services.adminContent.savePost(kind, row?.reference || null, {title, date, brand, body, postUrl, scheduledAt, imageKeys: keys,
      originalHtml: post?.bodyHtml, originalText: plainText(post?.bodyHtml || post?.body)}), nav.back);
  });
  return <Screen title={kind === 'case' ? '정비사례 편집' : '공지 편집'} onBack={nav.back}>
    <View style={ui.card}><Field label="제목" value={title} onChangeText={setTitle} maxLength={300}/><Field label="날짜 (예: 2026.10.15)" value={date} onChangeText={setDate}/>
      {kind === 'case' ? <Field label="차량 브랜드" value={brand} onChangeText={setBrand}/> : null}<Field label="본문" value={body} onChangeText={setBody} multiline maxLength={20000}/>
      <Field label="관련 글 주소 (선택)" value={postUrl} onChangeText={setPostUrl} autoCapitalize="none" keyboardType="url"/>
      <Field label="예약 게시 시간 (선택 · 예: 2026-10-20T10:00)" value={scheduledAt} onChangeText={setScheduledAt}/>
      <Photos keys={keys} onChange={setKeys} prefix={kind}/><Text style={ui.error}>{action.error}</Text><Button label="내용 저장" busy={action.busy} onPress={save}/></View>
  </Screen>;
}
export function ProductEditor({row}: {row?: ContentRow<WorkflowProduct>}) {
  const services = useServices(), nav = useNav(), action = useManagementAction();
  const [name, setName] = useState(row?.value.name || ''), [desc, setDesc] = useState(row?.value.desc || '');
  const [steps, setSteps] = useState(row?.value.steps || ['입고', '작업', '출고'].map(value => ({name: value, photoRequired: true, memoRequired: false, approvalRequired: false})));
  const update = (index: number, patch: Partial<typeof steps[number]>) => setSteps(steps.map((step, i) => i === index ? {...step, ...patch} : step));
  return <Screen title="서비스 편집" onBack={nav.back}><View style={ui.card}><Field label="서비스 이름" value={name} onChangeText={setName}/><Field label="설명" value={desc} onChangeText={setDesc} multiline/></View>
    {steps.map((step, index) => <View style={ui.card} key={index}><Field label={`단계 ${index + 1}`} value={step.name} onChangeText={value => update(index, {name: value})}/>
      <Choice label="사진 필수" selected={step.photoRequired !== false} onPress={() => update(index, {photoRequired: step.photoRequired === false})}/>
      <Choice label="특이사항 필수" selected={!!step.memoRequired} onPress={() => update(index, {memoRequired: !step.memoRequired})}/>
      <Choice label="검수 후 고객 공개" selected={!!step.approvalRequired} onPress={() => update(index, {approvalRequired: !step.approvalRequired})}/>
      <Button secondary label="단계 빼기" disabled={steps.length === 1} onPress={() => setSteps(steps.filter((_, i) => i !== index))}/></View>)}
    <Button secondary label="단계 추가" disabled={steps.length >= 10} onPress={() => setSteps([...steps, {name: '', photoRequired: true, memoRequired: false, approvalRequired: false}])}/>
    <Text style={ui.error}>{action.error}</Text><Button label="서비스 저장" busy={action.busy} onPress={() => void action.run(() => services.adminContent.saveProduct(row?.reference || null, {name, desc, steps}), nav.back)}/>
  </Screen>;
}
export function BranchEditor({row}: {row?: ContentRow<Branch>}) {
  const services = useServices(), nav = useNav(), action = useManagementAction();
  const [name, setName] = useState(row?.value.name || ''), [tel, setTel] = useState(row?.value.tel || ''), [mobile, setMobile] = useState(row?.value.mobile || '');
  const [addr, setAddr] = useState(row?.value.addr || ''), [map, setMap] = useState(row?.value.map || ''), [url, setUrl] = useState(String(row?.value.url || ''));
  const [keys, setKeys] = useState(row?.value.imageKeys || (row?.value.imageKey ? [row.value.imageKey] : []));
  return <Screen title="매장 정보 편집" onBack={nav.back}><View style={ui.card}><Field label="지점 이름" value={name} onChangeText={setName} editable={!row}/>
    <Field label="매장 전화" value={tel} onChangeText={setTel} keyboardType="phone-pad"/><Field label="휴대전화" value={mobile} onChangeText={setMobile} keyboardType="phone-pad"/>
    <Field label="주소" value={addr} onChangeText={setAddr}/><Field label="지도 주소" value={map} onChangeText={setMap} autoCapitalize="none"/><Field label="매장 링크" value={url} onChangeText={setUrl} autoCapitalize="none"/>
    <Photos keys={keys} onChange={setKeys} prefix="branch"/><Text style={ui.error}>{action.error}</Text><Button label="매장 정보 저장" busy={action.busy}
      onPress={() => void action.run(() => services.adminContent.saveBranch(row?.reference || null, {...row?.value, name, tel, mobile, addr, map, url, imageKey: keys[0] || '', imageKeys: keys}), nav.back)}/></View></Screen>;
}
export function IntroEditor({row}: {row?: ContentRow<IntroSlide>}) {
  const services = useServices(), nav = useNav(), action = useManagementAction(), [keys, setKeys] = useState(row ? [row.value.key] : []), [alt, setAlt] = useState(row?.value.alt || '');
  return <Screen title="소개 사진 편집" onBack={nav.back}><View style={ui.card}><Field label="사진 설명" value={alt} onChangeText={setAlt}/>
    <Photos keys={keys} onChange={setKeys} prefix="intro" limit={1}/><Text style={ui.error}>{action.error}</Text><Button label="소개 사진 저장" disabled={!keys.length} busy={action.busy}
      onPress={() => void action.run(() => services.adminContent.saveIntro(row?.reference || null, {key: keys[0], alt}), nav.back)}/></View></Screen>;
}
