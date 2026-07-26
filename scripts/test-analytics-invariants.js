const assert = require('node:assert/strict');

const ratio = (numerator, denominator) => {
  if (!denominator) return '—';
  if (denominator < 30) return `${numerator}/${denominator} · 표본 부족`;
  return `${(numerator / denominator * 100).toFixed(1)}% (${numerator}/${denominator})`;
};
const maskedIp = value => {
  const parts = String(value || '').split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : '식별번호 보호됨';
};
const excluded = ({ userAgent = '', ip = '', host = '' }) =>
  /(bot|crawler|spider|slurp|bingbot|googlebot|yeti|facebookexternalhit|headlesschrome)/i.test(userAgent)
  || /^(40\.77|157\.55|66\.249)\./.test(ip)
  || ip === '218.152.163.197'
  || (!!host && host !== 'www.promotors.kr');

const visitors = new Set(['a', 'b', 'c', 'd']);
const channels = [
  { visitors: new Set(['a', 'b']) },
  { visitors: new Set(['c']) }
];
const assigned = new Set(channels.flatMap(channel => [...channel.visitors]));
const unknown = new Set([...visitors].filter(visitor => !assigned.has(visitor)));

assert.equal(channels.reduce((sum, channel) => sum + channel.visitors.size, 0) + unknown.size, visitors.size);
assert.equal(ratio(0, 0), '—');
assert.equal(ratio(1, 4), '1/4 · 표본 부족');
assert.equal(ratio(3, 30), '10.0% (3/30)');
assert.equal(maskedIp('218.152.163.197'), '218.152.163.*');
assert.equal(excluded({ userAgent: 'bingbot', host: 'www.promotors.kr' }), true);
assert.equal(excluded({ ip: '40.77.179.234', host: 'www.promotors.kr' }), true);
assert.equal(excluded({ ip: '218.152.163.197', host: 'www.promotors.kr' }), true);
assert.equal(excluded({ host: 'promotors-site.pages.dev' }), true);
assert.equal(excluded({ userAgent: 'Chrome', ip: '1.2.3.4', host: 'www.promotors.kr' }), false);

const totalBookings = new Set(['booking-1', 'booking-2']);
const knownBookings = new Set(['booking-1']);
const unknownBookings = new Set([...totalBookings].filter(id => !knownBookings.has(id)));
assert.equal(knownBookings.size + unknownBookings.size, totalBookings.size);

console.log('Analytics invariant tests passed');
