import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button, Field} from '../../components/Controls';
import {ui} from '../../theme/styles';

export function BookingDecisionControls({onAccept, onReject, busy, id}: {
  onAccept: () => void; onReject: (reason: string) => void; busy?: boolean; id: string;
}) {
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(''), [error, setError] = useState('');
  function decide() {
    if (!rejecting) {onAccept(); return;}
    if (!reason.trim()) {setError('예약 거절 사유를 입력해 주세요.'); return;}
    setError(''); onReject(reason.trim());
  }
  return <View style={ui.stack}>
    {rejecting ? <Field label="거절 사유" value={reason} onChangeText={setReason} multiline maxLength={200}
      editable={!busy} placeholder="예약을 받을 수 없는 이유를 입력해 주세요."/> : null}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    <View style={ui.row}><View style={ui.flex}><Button secondary label={rejecting ? '거절 취소' : '예약 거절'} disabled={busy}
      onPress={() => {setRejecting(!rejecting); setError('');}}/></View>
      <View style={ui.flex}><Button label={rejecting ? '거절 확정' : '예약 승인'} danger={rejecting} busy={busy} onPress={decide} testID={'booking-accept-' + id}/></View>
    </View>
  </View>;
}
