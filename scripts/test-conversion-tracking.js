/* 전화 클릭 · 유입 채널 · 검색어 · 황금 키워드 판정 검사.
   app.js 에서 실제 함수를 그대로 꺼내 실행한다. 복사본을 검사하면 배포되는 코드와 어긋날 수 있다.
   실행: node scripts/test-conversion-tracking.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extract(name) {
  const start = source.indexOf(`\nfunction ${name}(`);
  assert.ok(start !== -1, `app.js 에서 ${name} 함수를 찾지 못했습니다.`);
  const end = source.indexOf('\n}', start);
  assert.ok(end !== -1, `${name} 함수의 끝을 찾지 못했습니다.`);
  return `${source.slice(start, end + 2)}\n`;
}

/* 함수가 참조하는 최상위 상수도 같이 가져온다.
   빠뜨리면 함수 안의 try/catch 가 참조 오류를 삼켜 조용히 빈 값이 나온다. */
function extractConst(name) {
  const match = source.match(new RegExp(`^const ${name} = .*;$`, 'm'));
  assert.ok(match, `app.js 에서 ${name} 상수를 찾지 못했습니다.`);
  return `${match[0]}\n`;
}

const NAMES = [
  'activitySearchTermFromReferrer', 'activityCleanKeyword', 'activityKeywordKey',
  'activityPhoneDigits', 'phoneClickContext', 'activityAcquisitionContext',
  'activityKeywordAvailability', 'activityPlatform', 'activityKeywordGrade',
  'activityNiceTicks', 'activityBookingRevenue'
];

const stubs = `
  const PHONE_BOOKING_BRANCHES = [
    { name: '안산', phone: '031-439-3986' },
    { name: '새솔', phone: '031-831-9738' },
    { name: '부천', phone: '032-713-9939' }
  ];
  const branchRecords = [{ name: '프로모터스 안산점', tel: '031.439.3986', mobile: '010-1234-5678' }];
  const getBranches = () => branchRecords;
  const location = { href: 'https://www.promotors.kr/', origin: 'https://www.promotors.kr' };
  const document = { referrer: '' };
`;

const CONSTANTS = ['SEARCH_ENGINE_HOST'];

const api = new Function(`${stubs}
${CONSTANTS.map(extractConst).join('')}
${NAMES.map(extract).join('\n')}
return { ${NAMES.join(', ')} };`)();

const acquisition = (referrer, url) => api.activityAcquisitionContext(referrer, url);
let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log(`  ✓ ${label}`); };

console.log('전화 클릭');
check('모달 링크는 표시된 지점을 그대로 쓴다', () => {
  const element = { dataset: { phoneBranch: '새솔', phone: '031-831-9738' }, closest: () => null };
  assert.equal(api.phoneClickContext(element, 'tel:0318319738').branch, '새솔');
});
check('지점 카드 전화번호는 번호로 지점을 찾아낸다', () => {
  const element = { dataset: {}, closest: () => null };
  assert.equal(api.phoneClickContext(element, 'tel:032-713-9939').branch, '부천');
});
check('표기가 달라도(점·하이픈) 같은 번호로 본다', () => {
  const element = { dataset: {}, closest: () => null };
  assert.equal(api.phoneClickContext(element, 'tel:0314393986').branch, '안산');
});
check('등록되지 않은 번호는 지점을 비워 둔다', () => {
  const element = { dataset: {}, closest: () => null };
  assert.equal(api.phoneClickContext(element, 'tel:0299998888').branch, '');
});

console.log('유입 채널');
check('네이버 블로그는 자연검색과 분리된다', () => {
  assert.equal(acquisition('https://blog.naver.com/promotors/1', 'https://www.promotors.kr/').channel, '네이버 블로그');
  assert.equal(acquisition('https://m.blog.naver.com/promotors/1', 'https://www.promotors.kr/').channel, '네이버 블로그');
});
check('플레이스·카페·다음·구글이 각각 구분된다', () => {
  assert.equal(acquisition('https://m.place.naver.com/place/1', 'https://www.promotors.kr/').channel, '네이버 플레이스');
  assert.equal(acquisition('https://cafe.naver.com/club/1', 'https://www.promotors.kr/').channel, '네이버 카페');
  assert.equal(acquisition('https://search.daum.net/search?q=정비', 'https://www.promotors.kr/').channel, '다음 자연검색');
  assert.equal(acquisition('https://www.google.com/', 'https://www.promotors.kr/').channel, '구글 자연검색');
});
check('utm_campaign 만으로는 광고로 보지 않는다', () => {
  const result = acquisition('', 'https://www.promotors.kr/?utm_source=naver_blog&utm_medium=blog&utm_campaign=bmw_oil');
  assert.equal(result.channel, '네이버 블로그');
  assert.equal(result.campaign, 'bmw_oil');
});
check('네이버 검색광고는 실제 검색어와 등록 키워드를 모두 남긴다', () => {
  const result = acquisition('https://ad.search.naver.com/', 'https://www.promotors.kr/?n_media=277&n_query=%EC%95%88%EC%82%B0%20%EC%A0%95%EB%B9%84&n_keyword=%EC%A0%95%EB%B9%84&n_rank=2');
  assert.equal(result.channel, '네이버 검색광고');
  assert.equal(result.searchQuery, '안산 정비');
  assert.equal(result.purchasedKeyword, '정비');
  assert.equal(result.rank, '2');
});
check('리퍼러 없는 방문은 직접 접속이다', () => {
  assert.equal(acquisition('', 'https://www.promotors.kr/').channel, '직접 접속');
});

console.log('검색어');
check('검색엔진에서 온 방문만 검색어를 가져온다', () => {
  assert.equal(api.activitySearchTermFromReferrer('https://search.naver.com/search.naver?query=수입차'), '수입차');
  assert.equal(api.activitySearchTermFromReferrer('https://search.daum.net/search?q=벤츠'), '벤츠');
});
check('검색엔진이 아닌 사이트의 ?q= 는 검색어로 쓰지 않는다', () => {
  assert.equal(api.activitySearchTermFromReferrer('https://partner-site.co.kr/list?q=이벤트'), '');
  assert.equal(api.activitySearchTermFromReferrer('https://blog.naver.com/x?query=글제목'), '');
});
check('공백·대소문자만 다른 검색어는 같은 것으로 묶는다', () => {
  assert.equal(api.activityKeywordKey(' BMW  엔진오일 '), api.activityKeywordKey('bmw엔진오일'));
  assert.equal(api.activityCleanKeyword('  안산   수입차 정비 '), '안산 수입차 정비');
});

console.log('들어온 곳별 검색어 확인 가능 여부');
check('광고는 가능, 플레이스·블로그·구글은 불가로 표시한다', () => {
  assert.equal(api.activityKeywordAvailability('네이버 검색광고').label, '가능');
  assert.equal(api.activityKeywordAvailability('네이버 플레이스').label, '불가');
  assert.equal(api.activityKeywordAvailability('네이버 블로그').label, '불가');
  assert.equal(api.activityKeywordAvailability('구글 자연검색').label, '불가');
  assert.equal(api.activityKeywordAvailability('네이버 자연검색').label, '일부만');
});
check('플랫폼으로 묶인다', () => {
  assert.equal(api.activityPlatform('네이버 플레이스'), '네이버');
  assert.equal(api.activityPlatform('구글 검색광고'), '구글');
  assert.equal(api.activityPlatform('다음 자연검색'), '다음');
  assert.equal(api.activityPlatform('인스타그램'), '기타');
});

console.log('황금 키워드 판정');
check('예약이 있으면 황금', () => {
  assert.equal(api.activityKeywordGrade({ bookings: 1, calls: 0, visitors: 3 }).label, '황금');
});
check('전화만 있으면 유망', () => {
  assert.equal(api.activityKeywordGrade({ bookings: 0, calls: 6, visitors: 35 }).label, '유망');
});
check('방문은 많은데 전화가 거의 없으면 낭비', () => {
  assert.equal(api.activityKeywordGrade({ bookings: 0, calls: 1, visitors: 85 }).label, '낭비');
  assert.equal(api.activityKeywordGrade({ bookings: 0, calls: 0, visitors: 53 }).label, '낭비');
});
check('표본이 적으면 관찰', () => {
  assert.equal(api.activityKeywordGrade({ bookings: 0, calls: 0, visitors: 4 }).label, '관찰');
});

console.log('그래프 눈금과 매출 연결');
check('가운데 눈금은 항상 정수다', () => {
  [1, 3, 7, 9, 23, 187].forEach(max => {
    const ticks = api.activityNiceTicks(max);
    assert.ok(ticks[2] >= max, `${max} 보다 큰 눈금이어야 합니다.`);
    assert.equal(ticks[1], Math.round(ticks[1]), `${max} 의 가운데 눈금이 소수입니다.`);
  });
});
check('같은 차량·같은 날짜의 정산 완료만 그 예약 매출로 본다', () => {
  const customers = {
    '12가 1234': { records: [
      { date: '2026.07.05', amount: '180,000', paid: true },
      { date: '2026.07.09', amount: '500000', paid: true },
      { date: '2026.07.05', amount: '90000', paid: false }
    ] }
  };
  const booking = { car: '12가 1234', date: '2026-07-05' };
  assert.equal(api.activityBookingRevenue(booking, customers), 180000);
  assert.equal(api.activityBookingRevenue({ car: '없는차', date: '2026-07-05' }, customers), 0);
});

console.log(`\n검사 ${checks}개 모두 통과했습니다.`);
