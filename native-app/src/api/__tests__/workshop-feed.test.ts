import {createWorkshopFeed, parseWorkshopFeed} from '../workshop-feed';
import {createPublicContentService} from '../public';
import type {RpcClient} from '../client';

const item = (title: string, link = 'https://blog.naver.com/lsh861124/123456', photo = 'https://blogthumb.pstatic.net/example.jpg') =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>Mon, 26 Oct 2026 00:30:00 +0900</pubDate><description><![CDATA[<p>실제 정비 과정</p><img src="${photo}">]]></description></item>`;
const rss = (items: string) => `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
const groups = [{key: 'ansan', branch: '프로모터스 안산점', keywords: ['안산']}];

test('실제 RSS 형태의 정비사례와 사진을 지점에 맞게 읽는다', () => {
  const rows = parseWorkshopFeed(rss(item('안산 엔진 &amp; 오일 교환') + item('다른 지점 정비')), groups);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({title: '안산 엔진 & 오일 교환', branch: '프로모터스 안산점', date: '2026.10.26', sourceUrl: 'https://blog.naver.com/lsh861124/123456'});
  expect(rows[0].imageUrls?.[0]).toBe('https://promotors-site.pages.dev/api/naver-blog?img=' + encodeURIComponent('https://blogthumb.pstatic.net/example.jpg'));
});
test('외부 링크와 이미지 주소를 앱 안에서 임의로 열거나 불러오지 않는다', () => {
  expect(parseWorkshopFeed(rss(item('안산 정비', 'https://example.invalid/post')), groups)).toEqual([]);
  const rows = parseWorkshopFeed(rss(item('안산 정비', undefined, 'https://blogthumb.pstatic.net.evil.invalid/image')), groups);
  expect(rows[0].imageUrls).toEqual([]);
  expect(parseWorkshopFeed(rss(item('안산 정비', 'javascript:alert(1)')), groups)).toEqual([]);
});
test('과도한 XML과 외부 엔티티 선언을 파싱 전에 거절한다', () => {
  expect(() => parseWorkshopFeed('<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///etc/passwd">]>' + rss(item('안산 정비')), groups)).toThrow();
  expect(() => parseWorkshopFeed(' '.repeat(2_000_001), groups)).toThrow();
});
test('공개 저장 자료의 임의 주소를 휴대폰 사진 주소나 외부 링크로 승격하지 않는다', async () => {
  const rpc = {call: jest.fn(async () => [{data_key: 'promotors-cases', payload: [{id: 'ordinary', title: '공개 사례', imageUrls: ['file:///private/example'], sourceUrl: 'javascript:alert(1)'}]}])} as unknown as RpcClient;
  const content = await createPublicContentService(rpc).load();
  expect(content.cases[0].imageUrls).toBeUndefined();
  expect(content.cases[0].sourceUrl).toBeUndefined();
  expect(rpc.call).toHaveBeenCalledWith('pm_sync_read', {p_token: null});
});
test('한 지점 RSS가 실패해도 다른 지점의 사진과 실패 상태를 함께 반환한다', async () => {
  const send = jest.fn(async (url: string) => {
    if (url.includes('yjjs01251')) throw new Error('temporary failure');
    return {ok: true, text: async () => rss(item('안산 엔진오일 교환') + item('새솔 브레이크 교환', 'https://blog.naver.com/lsh861124/123457'))};
  });
  const feed = createWorkshopFeed(send);
  const result = await feed.load();
  expect(result.posts.map(post => post.branch)).toEqual(['프로모터스 안산점', '프로모터스 새솔점']);
  expect(result.failedBranches).toEqual(['프로모터스 부천점']);
  expect(send).toHaveBeenCalledTimes(2);
  await feed.load(); expect(send).toHaveBeenCalledTimes(2);
  await feed.load({}, true); expect(send).toHaveBeenCalledTimes(4);
  expect(send.mock.calls.every(call => call[0].startsWith('https://promotors-site.pages.dev/api/naver-blog?url='))).toBe(true);
});
