import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {Image, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AssetImage} from '../../components/Media';
import type {Branch} from '../../domain/types';
import {branchStyles as styles} from './branchStyles';

export function BranchPhotoGallery({branch, actions}: {branch: Branch; actions?: ReactNode}) {
  const window = useWindowDimensions(), carousel = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(Math.max(1, window.width - 72)), [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<{uri: string; index: number} | null>(null);
  const supplied = Array.isArray(branch.imageKeys) && branch.imageKeys.length ? branch.imageKeys : branch.imageKey ? [branch.imageKey] : [];
  const keys = supplied.filter(key => typeof key === 'string' && !!key);
  const fingerprint = JSON.stringify(keys);
  useEffect(() => {setIndex(0); setPreview(null); carousel.current?.scrollTo({x: 0, animated: false});}, [fingerprint]);
  function move(offset: number) {
    const next = (index + offset + keys.length) % keys.length;
    setIndex(next); carousel.current?.scrollTo({x: next * width, animated: true});
  }
  function scrolled(event: NativeSyntheticEvent<NativeScrollEvent>) {setIndex(Math.max(0, Math.min(keys.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))));}
  return <View onLayout={event => {const nextWidth = Math.max(1, event.nativeEvent.layout.width); setWidth(nextWidth); requestAnimationFrame(() => carousel.current?.scrollTo({x: index * nextWidth, animated: false}));}} style={styles.gallery}>
    <ScrollView ref={carousel} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={scrolled} style={styles.carousel}>
      {(keys.length ? keys : [undefined]).map((key, position) => <View key={String(key) + ':' + position} style={{width}}>
        <AssetImage assetKey={key} label={branch.name + ' 사진 ' + (position + 1)}
          style={{...styles.image, width, height: width / 1.45, aspectRatio: undefined}} onPress={uri => setPreview({uri, index: position})}/>
      </View>)}
    </ScrollView>
    {keys.length > 1 ? <View style={styles.controls}><GalleryArrow label={branch.name + ' 이전 사진'} glyph="‹" onPress={() => move(-1)}/>
      <Text style={styles.page}>{index + 1} / {keys.length}</Text><GalleryArrow label={branch.name + ' 다음 사진'} glyph="›" onPress={() => move(1)}/></View> : null}
    {preview ? <BranchPhotoPreview branch={branch} uri={preview.uri} index={preview.index} total={keys.length} actions={actions} onClose={() => setPreview(null)}/> : null}
  </View>;
}
function GalleryArrow({label, glyph, onPress}: {label: string; glyph: string; onPress(): void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} style={({pressed}) => [styles.arrow, pressed && styles.pressed]} onPress={onPress}><Text style={styles.arrowText}>{glyph}</Text></Pressable>;
}
function BranchPhotoPreview({branch, uri, index, total, actions, onClose}: {branch: Branch; uri: string; index: number; total: number; actions?: ReactNode; onClose(): void}) {
  const window = useWindowDimensions(), [size, setSize] = useState({width: window.width, height: window.height * 0.6});
  return <Modal visible onRequestClose={onClose} animationType="fade" presentationStyle="fullScreen">
    <SafeAreaView style={styles.viewer}><View style={styles.viewerHeader}><Text style={styles.viewerTitle}>{branch.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="매장 사진 닫기" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
      <ScrollView style={styles.zoom} contentContainerStyle={styles.zoomContent} minimumZoomScale={1} maximumZoomScale={4} centerContent
        onLayout={event => setSize({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height})}>
        <Image accessibilityLabel={branch.name + ' 사진 ' + (index + 1) + ' 확대'} source={{uri}} style={size} resizeMode="contain"/>
      </ScrollView>
      <View style={styles.viewerFooter}><View style={styles.viewerMeta}><Text style={styles.viewerAddress}>{branch.addr}</Text><Text style={styles.viewerPage}>{index + 1} / {total}</Text></View>{actions}</View>
    </SafeAreaView>
  </Modal>;
}
