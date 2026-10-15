import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import type {PhotoPicker} from '../domain/management';

export const photoPicker: PhotoPicker = async ({source, limit}) => {
  const options = {mediaType: 'photo' as const, maxWidth: 1600, maxHeight: 1600,
    quality: 0.8 as const, includeBase64: true, includeExtra: false, assetRepresentationMode: 'compatible' as const,
    selectionLimit: Math.max(1, Math.min(4, limit)), saveToPhotos: false};
  const response = await (source === 'camera' ? launchCamera(options) : launchImageLibrary(options));
  if (response.didCancel) return [];
  if (response.errorCode) throw new Error(response.errorCode === 'permission'
    ? '휴대폰 설정에서 프로모터스의 사진·카메라 권한을 확인해 주세요.' : '사진을 선택하지 못했습니다. 다시 시도해 주세요.');
  return (response.assets || []).slice(0, options.selectionLimit).map(asset => {
    if (!asset.base64 || asset.base64.length > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.type || '')) {
      throw new Error('사진 크기나 형식을 확인해 주세요. JPG, PNG, WebP 사진을 선택할 수 있습니다.');
    }
    return {base64: asset.base64, type: asset.type as 'image/jpeg' | 'image/png' | 'image/webp', fileName: asset.fileName};
  });
};
