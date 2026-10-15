import { PROMOTORS_SERVER, type RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { Branch, BranchHours, IntroSlide, JsonRecord, PublicContent, PublicPost, SyncRow } from '../domain/types';

function array<T>(rows: SyncRow[], key: string): T[] {
  const value = rows.find(row => row.data_key === key)?.payload;
  return Array.isArray(value) ? value as T[] : [];
}
function visible(post: PublicPost) {
  return !post.scheduledAt || Date.parse(String(post.scheduledAt)) <= Date.now();
}
export function createPublicContentService(rpc: RpcClient) {
  async function load(): Promise<PublicContent> {
    const rows = await rpc.call<SyncRow[]>('pm_sync_read', { p_token: null });
    requireValue(Array.isArray(rows), 'INVALID_RESPONSE');
    return { branches: array<Branch>(rows, 'pm-branches'),
      cases: array<PublicPost>(rows, 'promotors-cases').filter(visible),
      notices: array<PublicPost>(rows, 'pm-notices').filter(visible),
      introSlides: array<IntroSlide>(rows, 'pm-intro-slides'),
      products: array<JsonRecord>(rows, 'pm-products'), eventBanners: array<JsonRecord>(rows, 'pm-event-banners') };
  }
  function assetUrl(key: string) {
    if (!/^(branch|notice|case|intro|event)-[A-Za-z0-9_.-]+$/.test(key)) throw new ApiError('FORBIDDEN');
    return `${PROMOTORS_SERVER}/storage/v1/object/public/promotors-public/${encodeURIComponent(key)}`;
  }
  return { load, assetUrl, hours: () => rpc.call<BranchHours>('pm_branch_hours_read'),
    legacyAsset: async (key: string) => {
      assetUrl(key);
      const value = await rpc.call<unknown>('pm_asset_get', { p_key: key, p_token: null });
      return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value) ? value : null;
    } };
}
