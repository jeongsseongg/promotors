import { PROMOTORS_SERVER, type RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { Branch, BranchHours, IntroSlide, JsonRecord, PublicContent, PublicPost, SyncRow } from '../domain/types';
import {createWorkshopFeed} from './workshop-feed';

function array<T>(rows: SyncRow[], key: string): T[] {
  const value = rows.find(row => row.data_key === key)?.payload;
  return Array.isArray(value) ? value as T[] : [];
}
function visible(post: PublicPost) {
  return !post.scheduledAt || Date.parse(String(post.scheduledAt)) <= Date.now();
}
function managedPost(post: PublicPost): PublicPost {
  return {...post, imageUrls: undefined, sourceUrl: undefined};
}
function publicContent(rows: SyncRow[]): PublicContent {
  requireValue(Array.isArray(rows), 'INVALID_RESPONSE');
  return {branches: array<Branch>(rows, 'pm-branches'),
    cases: array<PublicPost>(rows, 'promotors-cases').filter(visible).map(managedPost),
    notices: array<PublicPost>(rows, 'pm-notices').filter(visible).map(managedPost),
    introSlides: array<IntroSlide>(rows, 'pm-intro-slides'),
    products: array<JsonRecord>(rows, 'pm-products'), eventBanners: array<JsonRecord>(rows, 'pm-event-banners')};
}
export function createPublicContentService(rpc: RpcClient) {
  const workshopFeed = createWorkshopFeed();
  async function load(): Promise<PublicContent> {
    const rows = await rpc.call<SyncRow[]>('pm_sync_read', { p_token: null });
    return publicContent(rows);
  }
  function assetUrl(key: string) {
    if (!/^(branch|notice|case|intro|event)-[A-Za-z0-9_.-]+$/.test(key)) throw new ApiError('FORBIDDEN');
    return `${PROMOTORS_SERVER}/storage/v1/object/public/promotors-public/${encodeURIComponent(key)}`;
  }
  async function caseFeed(force = false): Promise<PublicContent> {
    const rows = await rpc.call<SyncRow[]>('pm_sync_read', {p_token: null}), content = publicContent(rows);
    const supplied = rows.find(row => row.data_key === 'pm-blog-settings')?.payload;
    const settings = supplied && typeof supplied === 'object' && !Array.isArray(supplied) ? supplied as JsonRecord : {};
    const feed = await workshopFeed.load(settings, force);
    return {...content, cases: [...content.cases, ...feed.posts], caseFeedErrors: feed.failedBranches};
  }
  return { load, caseFeed, assetUrl, hours: () => rpc.call<BranchHours>('pm_branch_hours_read'),
    legacyAsset: async (key: string) => {
      assetUrl(key);
      const value = await rpc.call<unknown>('pm_asset_get', { p_key: key, p_token: null });
      return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value) ? value : null;
    } };
}
