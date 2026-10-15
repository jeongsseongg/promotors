import React, {useEffect} from 'react';
import {Keyboard, StyleSheet, View} from 'react-native';
import {AuthScreen} from './AuthScreen';
import {LegalScreen} from '../account/LegalScreen';

/** Keep controlled inputs only for a direct legal-screen round trip. */
export function SignupFlow({legal}: {legal?: 'terms' | 'privacy'}) {
  useEffect(() => {if (legal) Keyboard.dismiss();}, [legal]);
  return <View style={styles.flex}>
    <View style={legal ? styles.hidden : styles.flex} accessibilityElementsHidden={!!legal}
      importantForAccessibility={legal ? 'no-hide-descendants' : 'auto'}>
      <AuthScreen signup/>
    </View>
    {legal ? <LegalScreen kind={legal}/> : null}
  </View>;
}
const styles = StyleSheet.create({flex: {flex: 1}, hidden: {display: 'none'}});
