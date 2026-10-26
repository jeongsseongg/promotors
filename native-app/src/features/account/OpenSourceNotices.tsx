import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button} from '../../components/Controls';
import {ui} from '../../theme/styles';
import licenses from './openSourceLicenses.json';

export function OpenSourceNotices() {
  const [expanded, setExpanded] = useState(false);
  return <View style={ui.card}><Text style={ui.heading}>오픈소스 사용 안내</Text>
    <Text style={ui.muted}>정비사례 정보를 읽는 데 사용한 오픈소스의 저작권과 라이선스를 확인할 수 있습니다.</Text>
    <Button brand secondary label={expanded ? '라이선스 접기' : '라이선스 전문 보기'} onPress={() => setExpanded(value => !value)}/>
    {expanded ? licenses.map(item => <View key={item.name} style={ui.stack}><Text style={ui.label}>{item.name} {item.version}</Text><Text selectable style={ui.muted}>{item.text}</Text></View>) : null}
  </View>;
}
