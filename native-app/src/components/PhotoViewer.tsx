import React from 'react';
import {Image, Modal, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button} from './Controls';
import {color} from '../theme/tokens';

export function PhotoViewer({uri, onClose, privateAsset = false}: {uri: string; onClose: () => void; privateAsset?: boolean}) {
  const source = privateAsset ? {uri, cache: 'reload' as const, headers: {'Cache-Control': 'no-store'}} : {uri};
  return <Modal visible={!!uri} onRequestClose={onClose} animationType="fade">
    <SafeAreaView style={styles.shell}><Button secondary label="사진 닫기" onPress={onClose}/>
      <Image accessibilityLabel="선택한 정비사진" source={source} style={styles.image} resizeMode="contain"/></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({shell: {flex: 1, padding: 20, backgroundColor: color.text, gap: 16}, image: {flex: 1, width: '100%'}});
