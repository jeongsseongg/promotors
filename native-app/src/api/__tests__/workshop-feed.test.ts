import {createWorkshopFeed, parseWorkshopFeed} from '../workshop-feed';

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
