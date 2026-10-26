import {XMLParser} from 'fast-xml-parser';
import type {PublicPost} from '../domain/types';

type Group = {key: string; branch: string; keywords: string[]};
type Settings = {rss?: unknown};
type Send = (url: string, init?: RequestInit) => Promise<{ok: boolean; text(): Promise<string>}>;
export type WorkshopFeed = {posts: PublicPost[]; failedBranches: string[]};
const proxy = 'https://promotors-site.pages.dev/api/naver-blog';
const mainRss = 'https://rss.blog.naver.com/lsh861124.xml';
const mainGroups: Group[] = [
  {key: 'ansan', branch: '프로모터스 안산점', keywords: ['안산점', '안산']},
  {key: 'saesol', branch: '프로모터스 새솔점', keywords: ['새솔점', '새솔']},
];
const bucheon: Group[] = [{key: 'bucheon', branch: '프로모터스 부천점', keywords: []}];
function decode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const named: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] || original;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  });
}
function publicLink(value: unknown): string {
  try {
    const url = new URL(decode(value));
    if (!['http:', 'https:'].includes(url.protocol) || !['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) || url.username || url.password) return '';
    return url.href.replace(/^http:/, 'https:');
  } catch {return '';}
}
function imageUrls(html: string): string[] {
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)];
  return [...new Set(sources.flatMap(match => {
    try {
      const url = new URL(decode(match[1]));
      return url.protocol === 'https:' && url.hostname.endsWith('.pstatic.net') && !url.username && !url.password ? [proxy + '?img=' + encodeURIComponent(url.href)] : [];
    } catch {return [];}
  }))].slice(0, 8);
}
function koreanDate(value: unknown): string {
  const time = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '.') : '';
}
export function parseWorkshopFeed(xml: string, groups: Group[]): PublicPost[] {
  if (xml.length > 2_000_000 || /<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('정비사례 응답을 확인하지 못했습니다.');
  const parsed = new XMLParser({ignoreAttributes: true, parseTagValue: false, processEntities: false}).parse(xml);
  const raw = parsed?.rss?.channel?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 50), seen = new Set<string>();
  return items.flatMap(item => {
    const sourceUrl = publicLink(item.link), description = decode(item.description);
    const title = decode(item.title).replace(/<[^>]*>/g, '').trim();
    if (!sourceUrl || !title) return [];
    return groups.filter(group => !group.keywords.length || group.keywords.some(word => (title + ' ' + description).includes(word))).flatMap(group => {
      const id = 'blog:' + group.key + ':' + sourceUrl;
      if (seen.has(id)) return []; seen.add(id);
      return [{id, title, branch: group.branch, date: koreanDate(item.pubDate), bodyHtml: description, imageUrls: imageUrls(description), sourceUrl}];
    });
  });
}
export function createWorkshopFeed(send: Send = (url, init) => fetch(url, init)) {
  let cached: {key: string; expires: number; promise: Promise<WorkshopFeed>} | undefined;
  async function read(rss: string, groups: Group[]) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await send(proxy + '?url=' + encodeURIComponent(rss), {signal: abort.signal, credentials: 'omit'});
      if (!response.ok) throw new Error('정비사례 응답 오류');
      const posts = parseWorkshopFeed(await response.text(), groups);
      if (!posts.length) throw new Error('확인할 수 있는 정비사례가 없습니다.');
      return posts;
    } finally {clearTimeout(timer);}
  }
  function load(settings: Settings = {}, force = false): Promise<WorkshopFeed> {
    const rss = typeof settings.rss === 'string' && /^https:\/\/rss\.blog\.naver\.com\/[A-Za-z0-9_-]+\.xml$/.test(settings.rss) ? settings.rss : mainRss;
    if (!force && cached?.key === rss && cached.expires > Date.now()) return cached.promise;
    const promise = Promise.allSettled([read(rss, mainGroups), read('https://rss.blog.naver.com/yjjs01251.xml', bucheon)]).then(results => ({
      posts: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
      failedBranches: results.flatMap((result, index) => result.status === 'rejected' ? (index ? bucheon : mainGroups).map(group => group.branch) : []),
    }));
    cached = {key: rss, expires: Date.now() + 5 * 60000, promise}; return promise;
  }
  return {load};
}
