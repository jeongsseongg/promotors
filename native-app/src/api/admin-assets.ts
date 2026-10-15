import { ApiError, requireValue } from './errors';
import type { AdminAccess } from './admin-access';
import type { PhotoPicker, PhotoUploadRequest, PickedPhoto, ManagedRun } from '../domain/management';
import type { RepairPhotoAccess } from './repair-photos';

function decode(photo: PickedPhoto) {
  requireValue(typeof photo.base64 === 'string' && photo.base64.length > 0 && photo.base64.length <= 8 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/.test(photo.base64), 'INVALID_PHOTO');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', input = photo.base64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor(input.length * 6 / 8)); let accumulator = 0, bits = 0, index = 0;
  for (const ch of input) { accumulator = (accumulator << 6) | alphabet.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; bytes[index++] = (accumulator >> bits) & 255; }
  }
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  requireValue(photo.type === 'image/jpeg' && jpeg || photo.type === 'image/png' && png || photo.type === 'image/webp' && webp, 'INVALID_PHOTO');
  return bytes;
}
export function createAdminAssetsService(access: AdminAccess, id: () => string, picker?: PhotoPicker, photoAccess?: RepairPhotoAccess) {
  let busy = false;
  async function authorize(input: PhotoUploadRequest) {
    await access.load(input.prefix !== 'service');
    if (input.prefix === 'service') {
      const run = access.rows<ManagedRun>('pm-service-runs').find(row => row.id === input.runId);
      requireValue(run && run.branch === input.branch, 'FORBIDDEN'); access.requireBranch(run.branch);
    }
  }
  async function pickAndUpload(input: PhotoUploadRequest) {
    if (busy) throw new ApiError('REQUEST_IN_PROGRESS'); requireValue(picker, 'PHOTO_PICKER_UNAVAILABLE');
    requireValue(['service', 'case', 'notice', 'branch', 'intro', 'event'].includes(input.prefix) && input.limit >= 1 && input.limit <= 30);
    busy = true;
    try {
      await authorize(input); const owner = access.session.credentials();
      const photos = await picker({ source: input.source, limit: Math.min(4, input.limit) });
      requireValue(Array.isArray(photos) && photos.length <= Math.min(4, input.limit), 'INVALID_PHOTO');
      const keys: string[] = [];
      for (const photo of photos) {
        if (owner.token !== access.session.credentials().token || owner.state.revision !== access.session.snapshot().revision) throw new ApiError('SESSION_CHANGED');
        const key = `${input.prefix}-${id()}`; await access.rpc.uploadAsset(key, decode(photo), photo.type); keys.push(key);
        if (input.prefix === 'service') photoAccess?.uploaded(key, input.branch || '');
      }
      return keys;
    } finally { busy = false; }
  }
  return { pickAndUpload };
}
