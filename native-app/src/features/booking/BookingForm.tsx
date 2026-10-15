import React from 'react';
import {Switch, Text, View} from 'react-native';
import {Choice, Field} from '../../components/Controls';
import {JsonRecord} from '../../domain/types';
import {ui} from '../../theme/styles';

export type GuestValues = {name: string; phone: string; car: string; model: string; bookingPin: string; agreed: boolean};
export function validateGuest(values: GuestValues) {
  if (!values.name.trim() || !values.car.trim() || !values.model.trim()) return '예약자 이름, 차량명, 차량번호를 입력해 주세요.';
  if (!/^01\d{8,9}$/.test(values.phone.replace(/[^0-9]/g, ''))) return '휴대폰번호를 정확히 입력해 주세요.';
  if (!/^\d{4,8}$/.test(values.bookingPin)) return '예약 확인번호를 숫자 4~8자리로 입력해 주세요.';
  if (!values.agreed) return '예약을 위한 개인정보 이용 안내를 확인해 주세요.';
  return '';
}
export function GuestFields({values, onChange}: {values: GuestValues; onChange: (values: GuestValues) => void}) {
  const update = (key: keyof GuestValues, value: string | boolean) => onChange({...values, [key]: value});
  return <View style={ui.stack}>
    <Text style={ui.heading}>비회원 예약자 정보</Text>
    <Field label="예약자 이름" value={values.name} onChangeText={v => update('name', v)}/>
    <Field label="차량명" value={values.model} onChangeText={v => update('model', v)} placeholder="예: BMW 520d"/>
    <Field label="차량번호" value={values.car} onChangeText={v => update('car', v)} placeholder="예: 12가3456"/>
    <Field label="휴대폰번호" value={values.phone} onChangeText={v => update('phone', v)} keyboardType="phone-pad"/>
    <Field label="예약 확인번호" value={values.bookingPin} onChangeText={v => update('bookingPin', v)} keyboardType="number-pad" secureTextEntry maxLength={8}/>
    <Text style={ui.muted}>이름·차량·연락처는 방문 예약 확인과 안내에 이용됩니다. 예약 확인번호는 조회와 취소 시 필요합니다.</Text>
    <View style={ui.spread}><Text style={[ui.body, ui.flex]}>예약을 위한 개인정보 이용에 동의합니다.</Text><Switch value={values.agreed} accessibilityLabel="비회원 예약 개인정보 이용 동의" onValueChange={v => update('agreed', v)}/></View>
  </View>;
}
export function ServiceFields({products, selected, onSelect, memo, onMemo}: {products: JsonRecord[]; selected: string[]; onSelect: (value: string[]) => void; memo: string; onMemo: (value: string) => void}) {
  const options = [...new Set([...products.map(row => String(row.name || '')).filter(Boolean), '기타'])];
  const toggle = (name: string) => onSelect(selected.includes(name) ? selected.filter(v => v !== name) : [...selected, name]);
  return <View style={ui.stack}><Text style={ui.heading}>어떤 정비가 필요하세요?</Text>
    <View style={ui.wrap}>{options.map(name => <Choice key={name} label={name} selected={selected.includes(name)} onPress={() => toggle(name)}/>)}</View>
    <Field label="요청사항" placeholder="증상이나 요청사항을 알려주세요." multiline value={memo} onChangeText={onMemo} maxLength={2000}/>
    <Text style={ui.muted}>방문 일정만 신청합니다. 정비 항목과 금액은 매장에서 상담 후 결정합니다.</Text>
  </View>;
}
