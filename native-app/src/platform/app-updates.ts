import {Linking, NativeModules, Platform} from 'react-native';
import release from '../../release.json';

export type UpdateRelease = {key: string; version?: string};
export type StoreUpdates = {check(): Promise<UpdateRelease | null>; openStore(): Promise<void>};
type PlayRelease = {available: boolean; availableCode: number; currentCode: number};
type Options = {
  platform?: string; currentVersion?: string; iosVersion?: string;
  androidCheck?: () => Promise<PlayRelease>;
  fetcher?: typeof fetch; open?: (url: string) => Promise<unknown>;
};
const appleStore = 'https://apps.apple.com/kr/app/id6810716100';
const playStore = 'https://play.google.com/store/apps/details?id=kr.promotors.app';
function versionParts(value: unknown): number[] | null {
  return typeof value === 'string' && /^\d{1,4}(?:\.\d{1,4}){0,3}$/.test(value) ? value.split('.').map(Number) : null;
}
function compare(left: number[], right: number[]): number {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}
export function readAppleRelease(value: unknown, currentVersion: string, iosVersion: string): UpdateRelease | null {
  const current = versionParts(currentVersion), system = versionParts(iosVersion);
  if (!value || typeof value !== 'object' || !current || !system) return null;
  const results = (value as {results?: unknown}).results;
  if (!Array.isArray(results)) return null;
  const app = results.find(item => item && item.trackId === 6810716100 && item.bundleId === 'kr.promotors.app');
  if (!app) return null;
  const published = versionParts(app.version), minimum = versionParts(app.minimumOsVersion);
  return published && minimum && compare(published, current) > 0 && compare(system, minimum) >= 0 ?
    {key: app.version, version: app.version} : null;
}
async function bounded<T>(operation: Promise<T>, abort?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {abort?.(); reject(new Error('업데이트 확인 시간이 초과되었습니다.'));}, 10000);
    })]);
  } finally {if (timer) clearTimeout(timer);}
}
export function createStoreUpdates(options: Options = {}): StoreUpdates {
  const platform = options.platform || Platform.OS;
  return {
    async check() {
      if (platform === 'android') {
        const check = options.androidCheck || (() => NativeModules.PromotorsUpdates.check());
        const found = await bounded<PlayRelease>(check());
        return found?.available === true && Number.isSafeInteger(found.currentCode) && found.currentCode > 0 &&
          Number.isSafeInteger(found.availableCode) && found.availableCode > found.currentCode ? {key: String(found.availableCode)} : null;
      }
      if (platform !== 'ios') return null;
      const controller = new AbortController();
      const response = await bounded((options.fetcher || fetch)(
        'https://itunes.apple.com/lookup?id=6810716100&country=kr&entity=software',
        {signal: controller.signal, headers: {Accept: 'application/json'}},
      ), () => controller.abort());
      if (!response.ok) throw new Error('스토어 버전을 확인하지 못했습니다.');
      const data = await bounded(response.json(), () => controller.abort());
      return readAppleRelease(data, options.currentVersion || release.version, options.iosVersion || String(Platform.Version));
    },
    async openStore() {
      const open = options.open || ((url: string) => Linking.openURL(url));
      if (platform === 'ios') {await open(appleStore); return;}
      if (platform !== 'android') throw new Error('지원되는 앱 기기가 아닙니다.');
      try {await open('market://details?id=kr.promotors.app');} catch {await open(playStore);}
    },
  };
}
