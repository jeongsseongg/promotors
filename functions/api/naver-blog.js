const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300'
};

function xmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}

function binaryResponse(body, contentType, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return xmlResponse('<error>Method not allowed</error>', 405);
  }

  const url = new URL(request.url);
  const imageRaw = url.searchParams.get('img') || '';
  if (imageRaw) {
    let imageTarget;
    try {
      imageTarget = new URL(imageRaw);
    } catch {
      return xmlResponse('<error>Invalid image URL</error>', 400);
    }
    const allowedImageHost = imageTarget.hostname === 'blogthumb.pstatic.net' || imageTarget.hostname.endsWith('.pstatic.net');
    if (!allowedImageHost || imageTarget.protocol !== 'https:') {
      return xmlResponse('<error>Only Naver image URLs are allowed</error>', 400);
    }
    const imageRes = await fetch(imageTarget.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 PromotorsBlogImageProxy/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://blog.naver.com/'
      }
    });
    if (!imageRes.ok) {
      return xmlResponse(`<error>Naver image returned ${imageRes.status}</error>`, imageRes.status);
    }
    return binaryResponse(imageRes.body, imageRes.headers.get('content-type') || 'image/jpeg');
  }

  const raw = url.searchParams.get('url') || '';
  let target;
  try {
    target = new URL(raw);
  } catch {
    return xmlResponse('<error>Invalid RSS URL</error>', 400);
  }

  const allowedHost = target.hostname === 'rss.blog.naver.com';
  const allowedPath = /^\/[A-Za-z0-9_-]+\.xml$/.test(target.pathname);
  if (!allowedHost || !allowedPath) {
    return xmlResponse('<error>Only Naver Blog RSS URLs are allowed</error>', 400);
  }

  const res = await fetch(target.toString(), {
    headers: {
      'User-Agent': 'PromotorsBlogFeed/1.0',
      'Accept': 'application/rss+xml, application/xml, text/xml'
    }
  });
  if (!res.ok) {
    return xmlResponse(`<error>Naver RSS returned ${res.status}</error>`, res.status);
  }

  const text = await res.text();
  return xmlResponse(text);
}
