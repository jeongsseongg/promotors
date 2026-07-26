const NAVER_API_BASE = 'https://api.searchad.naver.com';
const SUPABASE_URL = 'https://ytigiculewerivyytxza.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aWdpY3VsZXdlcml2eXl0eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDU4OTMsImV4cCI6MjA5ODk4MTg5M30.yZZOE6CA7G9e3Nk0QUTgOgBhXr7GvUl3syrlXayY6A0';

function responseHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const requestUrl = new URL(request.url);
  const allowedOrigin = origin && new URL(origin).hostname === requestUrl.hostname ? origin : requestUrl.origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

function dateKey(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

async function verifyDeveloper(request) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return false;
  const now = new Date();
  const from = new Date(now.getTime() - 60000);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pm_activity_read_v2`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_token: token,
      p_from: from.toISOString(),
      p_to: now.toISOString(),
      p_limit: 1
    })
  });
  return response.ok;
}

async function naverSignature(secretKey, timestamp, method, path) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${method}.${path}`));
  let binary = '';
  new Uint8Array(signature).forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function naverRequest(env, path, params = {}) {
  const method = 'GET';
  const timestamp = String(Date.now());
  const signature = await naverSignature(env.NAVER_SEARCHADS_SECRET_KEY, timestamp, method, path);
  const url = new URL(`${NAVER_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), {
    headers: {
      'X-API-KEY': env.NAVER_SEARCHADS_API_KEY,
      'X-CUSTOMER': env.NAVER_SEARCHADS_CUSTOMER_ID,
      'X-Timestamp': timestamp,
      'X-Signature': signature
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error = new Error(`NAVER_SEARCHADS_${response.status}`);
    error.status = response.status;
    error.detail = body;
    throw error;
  }
  return body;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function statRecord(response, campaignId) {
  if (!Array.isArray(response)) return response || {};
  return response.find(item => String(item?.id || '') === String(campaignId)) || response[0] || {};
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: responseHeaders(request) });
  if (request.method !== 'GET') return jsonResponse(request, { message: 'GET 요청만 지원합니다.' }, 405);
  if (!await verifyDeveloper(request)) return jsonResponse(request, { message: '관리자 확인이 필요합니다.' }, 401);

  const configured = !!(
    env.NAVER_SEARCHADS_API_KEY
    && env.NAVER_SEARCHADS_SECRET_KEY
    && env.NAVER_SEARCHADS_CUSTOMER_ID
  );
  if (!configured) {
    return jsonResponse(request, {
      configured: false,
      message: '네이버 검색광고 계정 연결 정보가 아직 등록되지 않았습니다.'
    });
  }

  const url = new URL(request.url);
  const to = dateKey(url.searchParams.get('to')) || new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(`${to}T00:00:00Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const from = dateKey(url.searchParams.get('from')) || defaultFrom.toISOString().slice(0, 10);
  const periodDays = Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (from > to || periodDays < 1 || periodDays > 90) {
    return jsonResponse(request, { message: '조회 기간은 최대 90일까지 가능합니다.' }, 400);
  }

  try {
    const campaignResponse = await naverRequest(env, '/ncc/campaigns');
    const campaigns = Array.isArray(campaignResponse) ? campaignResponse : [];
    const rows = await Promise.all(campaigns.map(async campaign => {
      const campaignId = campaign.nccCampaignId || campaign.id;
      if (!campaignId) return null;
      try {
        const statsResponse = await naverRequest(env, '/stats', {
          id: campaignId,
          fields: JSON.stringify(['impCnt', 'clkCnt', 'salesAmt', 'ctr', 'cpc', 'avgRnk', 'ccnt']),
          timeRange: JSON.stringify({ since: from, until: to })
        });
        const stats = statRecord(statsResponse, campaignId);
        return {
          name: campaign.name || '이름 없는 캠페인',
          status: campaign.status || '',
          enabled: campaign.userLock !== true && campaign.delFlag !== true,
          impressions: numberValue(stats?.impCnt),
          clicks: numberValue(stats?.clkCnt),
          cost: numberValue(stats?.salesAmt),
          clickRate: numberValue(stats?.ctr),
          costPerClick: numberValue(stats?.cpc),
          averageRank: numberValue(stats?.avgRnk),
          naverConversions: numberValue(stats?.ccnt)
        };
      } catch {
        return {
          name: campaign.name || '이름 없는 캠페인',
          status: campaign.status || '',
          enabled: campaign.userLock !== true && campaign.delFlag !== true,
          impressions: 0,
          clicks: 0,
          cost: 0,
          clickRate: 0,
          costPerClick: 0,
          averageRank: 0,
          naverConversions: 0,
          unavailable: true
        };
      }
    }));
    const cleanRows = rows.filter(Boolean).sort((a, b) => b.cost - a.cost);
    const totals = cleanRows.reduce((total, row) => ({
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      cost: total.cost + row.cost,
      naverConversions: total.naverConversions + row.naverConversions
    }), { impressions: 0, clicks: 0, cost: 0, naverConversions: 0 });
    return jsonResponse(request, {
      configured: true,
      statsUnavailable: cleanRows.filter(row => row.unavailable).length,
      period: { from, to },
      totals,
      campaigns: cleanRows,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(request, {
      configured: true,
      message: error.status === 401 || error.status === 403
        ? '네이버 광고 연결 정보를 다시 확인해주세요.'
        : '네이버 광고 데이터를 잠시 불러오지 못했습니다.'
    }, error.status === 401 || error.status === 403 ? 502 : 503);
  }
}
