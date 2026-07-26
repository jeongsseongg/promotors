/* 카카오 · 네이버 소셜 로그인 토큰 교환 (Cloudflare Pages Function)
   비밀키는 Cloudflare Pages 환경변수에만 두고 브라우저로 내려보내지 않는다.
   필요한 환경변수:
     KAKAO_REST_KEY / KAKAO_CLIENT_SECRET(선택)
     NAVER_CLIENT_ID / NAVER_CLIENT_SECRET               */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }

  const { provider, code, state, redirectUri } = payload || {};
  if (!code || !redirectUri) return json({ error: '인증 정보가 없습니다.' }, 400);

  try {
    if (provider === 'kakao') return json(await loginKakao(env, code, redirectUri));
    if (provider === 'naver') return json(await loginNaver(env, code, state));
    return json({ error: '지원하지 않는 로그인 방식입니다.' }, 400);
  } catch (err) {
    return json({ error: err.message || '로그인 처리 중 문제가 발생했습니다.' }, 502);
  }
}

async function loginKakao(env, code, redirectUri) {
  if (!env.KAKAO_REST_KEY) throw new Error('카카오 로그인이 아직 설정되지 않았습니다.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.KAKAO_REST_KEY,
    redirect_uri: redirectUri,
    code
  });
  if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);

  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) throw new Error('카카오 인증에 실패했습니다.');

  const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const me = await meRes.json();
  if (!meRes.ok || !me.id) throw new Error('카카오 회원정보를 가져오지 못했습니다.');

  const account = me.kakao_account || {};
  return {
    provider: 'kakao',
    socialId: String(me.id),
    name: account.profile?.nickname || '',
    email: account.email || '',
    phone: normalizePhone(account.phone_number)
  };
}

async function loginNaver(env, code, state) {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    throw new Error('네이버 로그인이 아직 설정되지 않았습니다.');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.NAVER_CLIENT_ID,
    client_secret: env.NAVER_CLIENT_SECRET,
    code,
    state: state || ''
  });

  const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${params}`);
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) throw new Error('네이버 인증에 실패했습니다.');

  const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const me = await meRes.json();
  if (!meRes.ok || me.resultcode !== '00') throw new Error('네이버 회원정보를 가져오지 못했습니다.');

  const p = me.response || {};
  return {
    provider: 'naver',
    socialId: String(p.id),
    name: p.name || p.nickname || '',
    email: p.email || '',
    phone: normalizePhone(p.mobile)
  };
}

/* +82 10-1234-5678 → 010-1234-5678 */
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '').replace(/^82/, '0');
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
