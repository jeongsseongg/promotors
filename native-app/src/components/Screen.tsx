import React, {ReactNode} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {color, font} from '../theme/tokens';

type Props = {title: string; children: ReactNode; onBack?: () => void; action?: ReactNode; footer?: ReactNode; refreshing?: boolean; onRefresh?: () => void; testID?: string};
export function Screen({title, children, onBack, action, footer, refreshing, onRefresh, testID}: Props) {
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']} testID={testID}>
    <View style={styles.header}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : null}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>{action}
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh}/> : undefined}>
        {children}
      </ScrollView>
      {footer ? <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: color.background}, flex: {flex: 1},
  header: {minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border},
  back: {minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center'},
  backText: {fontSize: 38, color: color.navy},
  title: {flex: 1, fontFamily: font.bold, fontSize: 22, color: color.text},
  content: {padding: 20, gap: 20, paddingBottom: 32},
  footer: {paddingHorizontal: 20, paddingTop: 12, gap: 10, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border},
});
