/* ============================================================
   프로모터스 - 화면 전환 / 로그인 / 관리자 CMS
   데이터는 localStorage에 우선 저장되고, Supabase 설정 시 원격 동기화됩니다.
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const locallyModifiedKeys = new Set();
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
    locallyModifiedKeys.add(k);
    if (k !== 'pm-logs') syncSupabaseData(k, v);
  },
  setLocal(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); }
};

const assetDb = {
  open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open('promotors-assets', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  },
  async set(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },
  async del(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
};

const objectUrls = new Map();
async function assetSrc(key) {
  if (!key) return '';
  const remote = store.get('pm-assets', {})[key]?.dataUrl;
  if (remote) return remote;
  if (objectUrls.has(key)) return objectUrls.get(key);
  try {
    const file = await assetDb.get(key);
    if (!file) return '';
    rememberRemoteAsset(key, file);
    const url = URL.createObjectURL(file);
    objectUrls.set(key, url);
    return url;
  } catch { return ''; }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageFileToPortableDataUrl(file, maxSize = 1400, quality = .82) {
  if (!/^image\//.test(file.type || '')) return fileToDataUrl(file);
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = async () => {
      URL.revokeObjectURL(url);
      resolve(await fileToDataUrl(file));
    };
    img.src = url;
  });
}

async function rememberRemoteAsset(key, file) {
  if (!key || !file || store.get('pm-assets', {})[key]) return;
  try {
    const dataUrl = await imageFileToPortableDataUrl(file);
    const assets = store.get('pm-assets', {});
    assets[key] = { dataUrl, name: file.name || key, type: file.type || 'image/jpeg', updatedAt: new Date().toISOString() };
    store.set('pm-assets', assets);
  } catch {}
}

async function saveFiles(files, prefix, limit) {
  const selected = [...files].slice(0, limit);
  const keys = [];
  for (const file of selected) {
    const key = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await assetDb.set(key, file);
    await rememberRemoteAsset(key, file);
    keys.push(key);
  }
  return keys;
}

function collectAssetKeys(value, found = new Set()) {
  if (!value) return found;
  if (Array.isArray(value)) {
    value.forEach(item => collectAssetKeys(item, found));
    return found;
  }
  if (typeof value !== 'object') return found;
  Object.entries(value).forEach(([key, item]) => {
    if ((key === 'imageKey' || key === 'key') && typeof item === 'string') found.add(item);
    if ((key === 'imageKeys' || key === 'photoKeys') && Array.isArray(item)) item.forEach(v => typeof v === 'string' && found.add(v));
    collectAssetKeys(item, found);
  });
  return found;
}

async function migrateLocalAssetsToSupabase() {
  if (!getSupabaseConfig()) return;
  const sources = ['pm-notices', 'pm-branches', 'pm-intro-slides', 'promotors-cases', 'pm-service-runs'];
  const keys = [...sources.reduce((set, key) => collectAssetKeys(store.get(key, null), set), new Set())];
  if (!keys.length) return;
  for (const key of keys) {
    if (store.get('pm-assets', {})[key]) continue;
    const file = await assetDb.get(key).catch(() => null);
    if (file) await rememberRemoteAsset(key, file);
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function cleanHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('script, iframe, object, embed, link, style').forEach(n => n.remove());
  t.content.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      if ((a.name === 'href' || a.name === 'src') && /^javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  return t.innerHTML.trim();
}

function normalizeUrl(url) {
  const v = (url || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function naverBlogRssFromUrl(url) {
  const v = normalizeUrl(url);
  if (!v) return '';
  try {
    const u = new URL(v);
    const parts = u.pathname.split('/').filter(Boolean);
    const blogId = u.hostname.includes('blog.naver.com') ? parts[0] : '';
    return blogId ? `https://rss.blog.naver.com/${blogId}.xml` : '';
  } catch {
    return '';
  }
}

function phoneHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function hasFinalConsonant(text) {
  const ch = String(text || '').trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

function progressServiceText(serviceName, done = false) {
  const name = String(serviceName || '정비').trim();
  const match = name.match(/^(.+?)\s*(교체|교환|점검|정비|수리)$/);
  if (match) {
    const target = match[1].trim();
    const particle = hasFinalConsonant(target) ? '을' : '를';
    return done ? `${target} ${match[2]}를 완료했어요` : `지금 ${target}${particle} ${match[2]}하고있어요`;
  }
  return done ? `${name} 작업을 완료했어요` : `지금 ${name} 작업을 하고있어요`;
}

function logEvent(type, payload = {}) {
  const logs = store.get('pm-logs', []);
  logs.unshift({ type, payload, at: new Date().toISOString() });
  store.set('pm-logs', logs.slice(0, 300));
  const supa = getSupabaseConfig();
  if (supa) {
    fetch(`${supa.url}/rest/v1/site_logs`, {
      method: 'POST',
      headers: supabaseHeaders(supa),
      body: JSON.stringify({ event_type: type, payload, page_url: location.href })
    }).catch(() => {});
  }
}

const SUPABASE_DATA_KEYS = [
  'pm-branches',
  'pm-notices',
  'promotors-cases',
  'pm-products',
  'pm-blocked',
  'pm-banned-members',
  'pm-customers',
  'pm-bookings',
  'pm-members',
  'pm-blog-settings',
  'pm-intro-slides',
  'pm-assets',
  'pm-service-runs',
  'pm-messages',
  'pm-sub-admin',
  'pm-main-admin',
  'pm-security-settings',
  'pm-home-view',
  'pm-admin-notifications',
  'pm-work-audit',
  'pm-event-banners'
];
let isHydratingSupabase = false;

function getSupabaseConfig() {
  const globalConfig = window.PROMOTORS_SUPABASE || {};
  const localConfig = store.get('pm-supabase', null);
  const supa = localConfig?.url && localConfig?.anon ? localConfig : globalConfig;
  if (!supa?.url || !supa?.anon) return null;
  return { url: supa.url.replace(/\/$/, ''), anon: supa.anon };
}

function supabaseHeaders(supa, prefer = 'return=minimal') {
  return {
    apikey: supa.anon,
    Authorization: `Bearer ${supa.anon}`,
    'Content-Type': 'application/json',
    Prefer: prefer
  };
}

function syncSupabaseData(key, value) {
  if (isHydratingSupabase || !SUPABASE_DATA_KEYS.includes(key)) return;
  const supa = getSupabaseConfig();
  if (!supa) return;
  fetch(`${supa.url}/rest/v1/site_data?on_conflict=data_key`, {
    method: 'POST',
    headers: supabaseHeaders(supa, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({ data_key: key, payload: value, page_url: location.href })
  }).catch(() => {});
}

async function hydrateSupabaseData() {
  const supa = getSupabaseConfig();
  if (!supa) return { ok: false, reason: 'not-configured' };
  const keys = SUPABASE_DATA_KEYS.map(k => `"${k}"`).join(',');
  try {
    const res = await fetch(`${supa.url}/rest/v1/site_data?select=data_key,payload&data_key=in.(${keys})`, {
      headers: supabaseHeaders(supa, 'return=representation')
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    isHydratingSupabase = true;
    /* 원격 데이터를 백그라운드로 받는 동안 사용자가 수정한 키는 덮어쓰지 않는다 */
    rows.forEach(row => { if (!locallyModifiedKeys.has(row.data_key)) store.setLocal(row.data_key, row.payload); });
    isHydratingSupabase = false;
    return { ok: true, count: rows.length };
  } catch (err) {
    isHydratingSupabase = false;
    console.warn('Supabase load failed', err);
    return { ok: false, reason: 'load-failed' };
  }
}

/* 관리자 비밀번호 */
const ADMIN_PW = 'goodpro1!';
const DEFAULT_STEP_NAMES = ['입고', '작업', '출고'];

/* ---------- 상태 ---------- */
let isAdmin = sessionStorage.getItem('pm-admin') === '1';
let adminRole = sessionStorage.getItem('pm-admin-role') || '';
let adminBranch = sessionStorage.getItem('pm-admin-branch') || '';
if (isAdmin && !adminRole) {
  adminRole = 'main';
  sessionStorage.setItem('pm-admin-role', 'main');
}
let member = store.get('pm-member', null);
if (!member && store.get('pm-auto-login', false)) {
  member = store.get('pm-auto-member', null);
  if (member) store.setLocal('pm-member', member);
}

/* ---------- 기본 데이터 ---------- */
const DEFAULT_BRANCHES = [
  { name: '프로모터스 안산점', tel: '031.831.9738', mobile: '', addr: '[주소를 입력해주세요]', map: '', url: '', imageKey: '' },
  { name: '프로모터스 새솔점', tel: '[전화번호를 입력해주세요]', mobile: '', addr: '[주소를 입력해주세요]', map: '', url: '', imageKey: '' }
];
const DEFAULT_NOTICES = [];

const DEFAULT_PRODUCTS = [
  { name: '엔진오일 교환', desc: '', steps: defaultWorkflowSteps() },
  { name: '미션오일 교환', desc: '', steps: defaultWorkflowSteps() },
  { name: '브레이크 패드 교체', desc: '', steps: defaultWorkflowSteps() },
  { name: '타이어 교체/위치교환', desc: '', steps: defaultWorkflowSteps() },
  { name: '에어컨 필터 교체', desc: '', steps: defaultWorkflowSteps() }
];

const getBranches  = () => {
  const branches = store.get('pm-branches', null);
  if (!branches?.length) return DEFAULT_BRANCHES;
  const next = [...branches];
  DEFAULT_BRANCHES.forEach(def => {
    if (!next.some(b => b.name === def.name)) next.push(def);
  });
  if (next.length !== branches.length) store.setLocal('pm-branches', next);
  return next;
};
const getNotices   = () => store.get('pm-notices', DEFAULT_NOTICES);
const getCases     = () => store.get('promotors-cases', []);
const getProducts  = () => normalizeProducts(store.get('pm-products', DEFAULT_PRODUCTS));
const getBlocked   = () => store.get('pm-blocked', []);
const getBannedMembers = () => store.get('pm-banned-members', []);
const normPhone = p => String(p || '').replace(/\D/g, '');
const getCustomers = () => store.get('pm-customers', {});
const getIntroSlides = () => store.get('pm-intro-slides', []);
const DEFAULT_BLOG_PROXY = 'https://promotors-site.pages.dev/api/naver-blog?url=';
const DEFAULT_BLOG_IMAGE_PROXY = 'https://promotors-site.pages.dev/api/naver-blog?img=';
const DEFAULT_BLOG_SETTINGS = {
  url: 'https://blog.naver.com/lsh861124',
  rss: 'https://rss.blog.naver.com/lsh861124.xml',
  proxy: DEFAULT_BLOG_PROXY,
  imageProxy: DEFAULT_BLOG_IMAGE_PROXY
};
const getBlogSettings = () => {
  const s = store.get('pm-blog-settings', DEFAULT_BLOG_SETTINGS);
  const proxy = !s.proxy || s.proxy.startsWith('/api/') ? DEFAULT_BLOG_PROXY : s.proxy;
  const imageProxy = !s.imageProxy || s.imageProxy.startsWith('/api/') ? DEFAULT_BLOG_IMAGE_PROXY : s.imageProxy;
  return {
    url: s.url || DEFAULT_BLOG_SETTINGS.url,
    rss: s.rss || DEFAULT_BLOG_SETTINGS.rss,
    proxy,
    imageProxy
  };
};
const getSubAdmin = () => normalizeSubAdmin(store.get('pm-sub-admin', { password: '', accounts: [] }));
const getMainAdmin = () => store.get('pm-main-admin', { password: ADMIN_PW });
const getSecuritySettings = () => store.get('pm-security-settings', { password: 'tmdgus123' });
const getHomeView = () => {
  const saved = store.get('pm-home-view', null);
  /* 구버전(문자열) 설정은 무시한다 */
  if (saved && typeof saved === 'object' && saved.view) return saved.view;
  /* 모바일은 정비사례가 기본, PC는 소개가 기본 */
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  return isMobile ? 'cases' : 'intro';
};
const today = () => new Date().toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');
const todayKey = () => {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
};
const isMainAdmin = () => isAdmin && adminRole === 'main';
const isGeneralAdmin = () => isAdmin && adminRole === 'general';
const currentAdminBranches = () => isGeneralAdmin() && adminBranch ? getBranches().filter(b => b.name === adminBranch) : getBranches();
const canAccessBranch = branch => isMainAdmin() || !adminBranch || branch === adminBranch;
const canUseAdminView = name => {
  if (!isAdmin) return false;
  if (isMainAdmin()) return true;
  return ['adm-book', 'adm-work', 'adm-inquiry'].includes(name);
};

function defaultWorkflowSteps() {
  return DEFAULT_STEP_NAMES.map(name => ({
    name,
    photoRequired: true,
    memoRequired: false,
    approvalRequired: false
  }));
}

function normalizeProductSteps(product) {
  const raw = Array.isArray(product?.steps) && product.steps.length
    ? product.steps
    : String(product?.workflow || DEFAULT_STEP_NAMES.join(' > ')).split('>').map(name => ({ name: name.trim() }));
  const steps = raw
    .map((step, i) => ({
      name: String(step.name || DEFAULT_STEP_NAMES[i] || '').trim(),
      photoRequired: step.photoRequired !== false,
      memoRequired: !!step.memoRequired,
      approvalRequired: !!step.approvalRequired
    }))
    .filter(step => step.name)
    .slice(0, 10);
  return steps.length ? steps : defaultWorkflowSteps();
}

function normalizeProducts(products) {
  return (products || []).map(p => ({
    name: p.name || '',
    desc: p.desc || p.description || '',
    steps: normalizeProductSteps(p)
  }));
}

function normalizeSubAdmin(value) {
  const raw = value || {};
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const normalized = accounts
    .map((account, i) => ({
      id: account.id || `sub-${i}-${String(account.password || '').slice(0, 4)}`,
      password: String(account.password || '').trim(),
      branch: String(account.branch || '').trim(),
      createdAt: account.createdAt || ''
    }))
    .filter(account => account.password);
  const legacy = String(raw.password || '').trim();
  if (legacy && !normalized.some(account => account.password === legacy)) {
    normalized.unshift({ id: 'sub-legacy', password: legacy, branch: raw.branch || '', createdAt: raw.createdAt || '' });
  }
  return { password: legacy, accounts: normalized };
}
const BRANDS = ['전체','Mercedes-Benz','BMW','Audi','Volkswagen','Ferrari','Lamborghini','Maserati','Jaguar','Bentley','Rolls-Royce','MINI','Volvo','Lexus','Jeep','Land Rover','Porsche','기타'];
let selectedCaseBrand = '전체';
let selectedBranchIndex = 0;
let introSlideIndex = 0;
let introDataReady = false; /* 원격 데이터 확인 전에는 "이미지 없음" 안내를 띄우지 않는다 */
let introTimer = null;
let introLastActivity = Date.now();
let chatTimer = null;
let chatOpenTarget = null;
let securityUnlocked = false;
/* 고객관리: 저장/수정 후에도 열려있던 고객 카드를 유지 */
const openCustCards = new Set();
/* 고객관리: 고객별 메모 검색어/펼침 상태 */
const custMemoFilters = new Map();

/* ============================================================
   화면(뷰) 전환 — 오른쪽만 변경, 왼쪽 고정
   ============================================================ */
function showView(name) {
  if (name.startsWith('adm-') && !canUseAdminView(name)) {
    name = isAdmin ? 'adm-book' : getHomeView();
  }
  /* 보안 화면을 벗어나면 다시 비밀번호를 묻는다 (1시간 해제 체크 시 제외) */
  if (name !== 'adm-settings') securityUnlocked = false;
  document.body.dataset.view = name;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.top-nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  syncMobileTabbar();
  $('.right-panel').scrollTop = 0;
}

/* 모바일 탭바 활성 표시: 마이 페이지가 열려있으면 마이, 아니면 현재 화면 기준 */
function syncMobileTabbar(myOpen = false) {
  const name = document.body.dataset.view || '';
  $$('#mobile-tabbar [data-mtab]').forEach(b =>
    b.classList.toggle('active', myOpen
      ? b.dataset.mtab === 'my'
      : b.dataset.mtab === name || (b.dataset.mtab === 'my' && name.startsWith('adm-'))));
}

function scrollMobilePublicView(name) {
  return;
}

function wireNav() {
  $$('.top-nav [data-view]').forEach(btn => {
    btn.addEventListener('click', e => {
      const adminMenuTrigger = btn.classList.contains('nav-btn') && btn.closest('li.admin-only');
      if (adminMenuTrigger && window.matchMedia('(max-width: 900px)').matches) {
        e.preventDefault();
        btn.closest('li.admin-only').classList.toggle('admin-menu-open');
        return;
      }
      if (btn.dataset.view?.startsWith('adm-') && !canUseAdminView(btn.dataset.view)) return;
      $$('.top-nav li.admin-menu-open').forEach(item => item.classList.remove('admin-menu-open'));
      showView(btn.dataset.view);
      if (btn.dataset.view === 'adm-book') initAdmBook();
      if (btn.dataset.view === 'adm-work') renderAdmWork();
      if (btn.dataset.view === 'adm-approval') renderAdmApproval();
      if (btn.dataset.view === 'adm-cust') renderAdmCust();
      if (btn.dataset.view === 'adm-prod') renderAdmProd();
      if (btn.dataset.view === 'adm-inquiry') renderAdmInquiry();
      if (btn.dataset.view === 'adm-settings') renderAdmSettings();
      if (btn.dataset.view === 'cases' && !btn.dataset.tab) activateTab('tab-blog');
      if (btn.dataset.tab) activateTab(btn.dataset.tab);
      scrollMobilePublicView(btn.dataset.view);
      if (btn.dataset.branch !== undefined) {
        const el = document.getElementById('branch-' + btn.dataset.branch);
        if (el) {
          $$('.branch').forEach(b => b.classList.remove('focus'));
          el.classList.add('focus');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
    btn.addEventListener('dblclick', e => {
      const view = btn.dataset.view;
      if (!isMainAdmin() || !['intro', 'location', 'cases', 'notice'].includes(view)) return;
      e.preventDefault();
      openHomeViewConfirm(view, btn.textContent.trim());
    });
  });
}

/* ---------- 정비사례 탭 ---------- */
function activateTab(id) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
}
$$('.tab').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));

/* ============================================================
   모달 공용
   ============================================================ */
const modal = $('#modal');
const modalCard = $('#modal-card');
let modalBackHandler = null;

function openModal(html, wide, full, backHandler = null) {
  modalBackHandler = backHandler;
  modalCard.classList.toggle('wide', !!wide);
  modalCard.classList.toggle('full', !!full);
  modalCard.innerHTML = `<button type="button" class="modal-x" id="modal-x" aria-label="닫기">×</button>${html}`;
  modal.hidden = false;
  $('#modal-x')?.addEventListener('click', () => {
    if (modalBackHandler) {
      const handler = modalBackHandler;
      modalBackHandler = null;
      handler();
    } else {
      closeModal();
    }
  });
  const first = modalCard.querySelector('input, textarea, [contenteditable="true"]');
  if (first) first.focus();
}
function closeModal() { modalBackHandler = null; modal.hidden = true; modalCard.classList.remove('full', 'mypage-card', 'mobile-full'); modalCard.innerHTML = ''; syncMobileTabbar(); }
modal.addEventListener('click', e => { if (e.target === modal) e.preventDefault(); });

/* ============================================================
   프로모터스 전용 팝업 — 브라우저 기본 alert/confirm/prompt 대체
   ============================================================ */
let pmDialogBackdrop = null;
function ensurePmDialog() {
  if (pmDialogBackdrop) return pmDialogBackdrop;
  pmDialogBackdrop = document.createElement('div');
  pmDialogBackdrop.className = 'pm-dialog-backdrop';
  pmDialogBackdrop.hidden = true;
  pmDialogBackdrop.innerHTML = '<div class="pm-dialog" role="alertdialog" aria-modal="true"></div>';
  document.body.append(pmDialogBackdrop);
  return pmDialogBackdrop;
}

function pmDialog({ title = '알림', message = '', input = null, okText = '확인', cancelText = '', danger = false }) {
  return new Promise(resolve => {
    const backdrop = ensurePmDialog();
    const card = backdrop.querySelector('.pm-dialog');
    card.innerHTML = `
      <span class="pm-dialog-brand">PRO MOTORS</span>
      <strong class="pm-dialog-title">${esc(title)}</strong>
      ${message ? `<p class="pm-dialog-msg">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
      ${input ? `<input type="text" class="pm-dialog-input" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">` : ''}
      <div class="pm-dialog-actions">
        ${cancelText ? `<button type="button" class="pm-dialog-cancel">${esc(cancelText)}</button>` : ''}
        <button type="button" class="pm-dialog-ok${danger ? ' danger' : ''}">${esc(okText)}</button>
      </div>`;
    backdrop.hidden = false;
    const inputEl = card.querySelector('.pm-dialog-input');
    const finish = value => { backdrop.hidden = true; card.innerHTML = ''; resolve(value); };
    card.querySelector('.pm-dialog-ok').addEventListener('click', () => finish(input ? inputEl.value : true));
    card.querySelector('.pm-dialog-cancel')?.addEventListener('click', () => finish(input ? null : false));
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(inputEl.value); }
    });
    (inputEl || card.querySelector('.pm-dialog-ok')).focus();
  });
}

const pmAlert = (message, title = '알림') => pmDialog({ title, message });
const pmConfirm = (message, { title = '확인', okText = '확인', cancelText = '취소', danger = false } = {}) =>
  pmDialog({ title, message, okText, cancelText, danger });
const pmPrompt = (message, { title = '입력', placeholder = '', value = '' } = {}) =>
  pmDialog({ title, message, input: { placeholder, value }, cancelText: '취소' });

function openHomeViewConfirm(view, label) {
  openModal(`
    <h3>메인화면 설정</h3>
    <p class="confirm-copy">${esc(label)} 화면을 홈페이지 첫 화면으로 설정하시겠습니까?</p>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="confirm-home-view">설정</button>
      <button type="button" class="modal-cancel" onclick="closeModal()">취소</button>
    </div>
  `);
  $('#confirm-home-view').addEventListener('click', () => {
    store.set('pm-home-view', { view, setAt: new Date().toISOString() });
    closeModal();
    showView(view);
    renderAdmSettings();
  });
}

/* ============================================================
   로그인 / 회원가입 / 관리자
   ============================================================ */
function applyAuthUI() {
  document.body.classList.toggle('admin', isAdmin);
  document.body.classList.toggle('main-admin', isMainAdmin());
  document.body.classList.toggle('general-admin', isGeneralAdmin());
  const bar = $('#auth-bar');
  bar.innerHTML = '';

  if (isAdmin) {
    bar.append(span('auth-user', isGeneralAdmin() && adminBranch ? `${adminBranch} 관리자` : '관리자 모드'), authBtn('로그아웃', logout));
  } else if (member) {
    bar.append(authBtn('내 예약', openMyPageModal), authBtn('로그아웃', logout));
  } else {
    const btn = authBtn('로그인', null);
    let timer = null;
    btn.addEventListener('click', () => {
      clearTimeout(timer);
      timer = setTimeout(() => openMemberModal('login'), 250);
    });
    btn.addEventListener('dblclick', () => {
      clearTimeout(timer);
      openAdminModal();
    });
    bar.append(btn);
  }
  bar.hidden = false;

  /* 관리자 여부에 따라 다시 그리기 */
  renderBranches();
  renderNotices();
  renderCases();
  if (isMainAdmin()) {
    renderAdmCust();
    renderAdmProd();
    renderAdmApproval();
    renderAdmSettings();
  }
  if (isAdmin) renderAdmInquiry();
  if (isAdmin) {
    initAdmBook();
    renderAdmWork();
  }
  $('#case-empty').textContent = isAdmin
    ? '등록된 정비사례가 없습니다. 첫 게시글을 등록해보세요.'
    : '등록된 정비사례가 없습니다.';
}

function span(cls, text) { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }
function authBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'auth-btn'; b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function logout() {
  isAdmin = false;
  adminRole = '';
  adminBranch = '';
  member = null;
  sessionStorage.removeItem('pm-admin');
  sessionStorage.removeItem('pm-admin-role');
  sessionStorage.removeItem('pm-admin-branch');
  store.del('pm-member');
  store.del('pm-auto-login');
  store.del('pm-auto-member');
  /* 관리자 화면에 있었다면 소개로 이동 */
  if (document.querySelector('.view.active')?.id.startsWith('view-adm')) showView('intro');
  applyAuthUI();
}

function openAddressSearch(input) {
  const finish = () => {
    if (!window.daum?.Postcode) {
      pmAlert('주소 검색 스크립트를 불러오지 못했습니다. 주소를 직접 입력해주세요.');
      return;
    }
    new daum.Postcode({
      oncomplete(data) {
        input.value = data.roadAddress || data.jibunAddress || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }).open();
  };
  if (window.daum?.Postcode) return finish();
  const script = document.createElement('script');
  script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = finish;
  script.onerror = finish;
  document.head.append(script);
}

/* ---------- 회원 로그인 / 가입 모달 ---------- */
function validMemberPassword(value) {
  return value.length >= 8 && /[A-Za-z가-힣]/.test(value) && /\d/.test(value);
}

function openMemberModal(tab) {
  const draft = store.get('pm-signup-draft', {});
  const rememberedId = store.get('pm-remember-id', '');
  openModal(`
    <h3>회원 ${tab === 'login' ? '로그인' : '가입'}</h3>
    <div class="modal-tabs">
      <button type="button" class="mtab ${tab === 'login' ? 'active' : ''}" data-t="login">로그인</button>
      <button type="button" class="mtab ${tab === 'signup' ? 'active' : ''}" data-t="signup">회원가입</button>
    </div>
    <form id="member-form">
      <input type="text" id="m-id" placeholder="아이디" required>
      <div class="password-field">
        <input type="password" id="m-password" placeholder="비밀번호" required>
        <button type="button" id="m-eye" aria-label="비밀번호 보기">보기</button>
      </div>
      ${tab === 'signup' ? `
        <div class="password-field">
          <input type="password" id="m-password2" placeholder="비밀번호 확인" required>
          <button type="button" id="m-eye2" aria-label="비밀번호 확인 보기">보기</button>
        </div>
        <input type="text" id="m-name" placeholder="이름" required>
        <input type="text" id="m-model" placeholder="차량명 (예: BMW 520d M Sport)" required>
        <input type="text" id="m-car" placeholder="차량번호 (예: 12가3456)" required>
        <input type="tel" id="m-phone" placeholder="핸드폰번호 (예: 010-1234-5678)" required>
        <input type="email" id="m-email" placeholder="이메일 (선택)">
        <p class="field-help">이메일은 비밀번호 변경, 쿠폰, 프로모터스 소식 안내를 받을 때 도움이 됩니다.</p>
        <div class="address-field">
          <input type="text" id="m-address" placeholder="주소 (선택)">
          <button type="button" id="m-address-find">주소찾기</button>
        </div>
        <p class="field-help">주소는 차량에 필요한 악세서리나 부속을 보내드릴 때 사용합니다. 선택사항입니다.</p>
        <p class="hint">비밀번호는 영어 또는 한글과 숫자를 포함해 8자 이상이어야 합니다.</p>
      ` : `
        <label class="check-line"><input type="checkbox" id="m-remember"> 아이디 기억하기</label>
        <label class="check-line"><input type="checkbox" id="m-auto"> 자동로그인</label>
        ${Object.keys(draft).length ? '<button type="button" class="mini-btn" id="resume-signup">회원가입 이어서하기</button>' : ''}
      `}
      <p class="form-error" id="m-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">${tab === 'login' ? '로그인' : '가입하기'}</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);

  /* 모바일에서는 로그인/회원가입을 전체화면 페이지로 표시 */
  modalCard.classList.add('mobile-full');
  modalCard.querySelectorAll('.mtab').forEach(b =>
    b.addEventListener('click', () => openMemberModal(b.dataset.t)));
  $('#m-id').value = tab === 'signup' ? (draft.id || '') : rememberedId;
  if (tab === 'login') $('#m-remember') && ($('#m-remember').checked = !!rememberedId);

  $('#m-eye').addEventListener('click', () => {
    const pw = $('#m-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    $('#m-eye').textContent = pw.type === 'password' ? '보기' : '숨김';
    pw.focus();
  });
  if (tab === 'signup') {
    $('#m-eye2').addEventListener('click', () => {
      const pw = $('#m-password2');
      pw.type = pw.type === 'password' ? 'text' : 'password';
      $('#m-eye2').textContent = pw.type === 'password' ? '보기' : '숨김';
      pw.focus();
    });
    ['id','name','model','car','phone','email','address'].forEach(key => {
      const el = $(`#m-${key}`);
      if (el && draft[key]) el.value = draft[key];
      el?.addEventListener('input', () => {
        const next = store.get('pm-signup-draft', {});
        next[key] = el.value;
        store.setLocal('pm-signup-draft', next);
      });
    });
    $('#m-address-find').addEventListener('click', () => openAddressSearch($('#m-address')));
  } else {
    $('#resume-signup')?.addEventListener('click', () => openMemberModal('signup'));
  }

  $('#member-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = $('#m-id').value.trim();
    const password = $('#m-password').value;
    const members = store.get('pm-members', []);
    const err = $('#m-error');

    if (tab === 'signup') {
      const name = $('#m-name').value.trim();
      const model = $('#m-model').value.trim();
      const car = $('#m-car').value.trim();
      const phone = $('#m-phone').value.trim();
      const email = $('#m-email').value.trim();
      const address = $('#m-address').value.trim();
      const password2 = $('#m-password2').value;
      if (!validMemberPassword(password)) { err.textContent = '비밀번호는 영어 또는 한글과 숫자를 포함해 8자 이상이어야 합니다.'; return; }
      if (password !== password2) { err.textContent = '비밀번호 확인이 일치하지 않습니다.'; return; }
      if (members.some(m => m.id === id)) { err.textContent = '이미 가입된 아이디입니다.'; return; }
      if (members.some(m => m.car === car)) { err.textContent = '이미 가입된 차량번호입니다.'; return; }
      /* 차단된 핸드폰번호는 재가입 불가 */
      if (getBannedMembers().some(b => b.type === 'blocked' && normPhone(b.member?.phone) && normPhone(b.member?.phone) === normPhone(phone))) {
        err.textContent = '가입이 제한된 핸드폰번호입니다. 매장에 문의해주세요.';
        return;
      }
      members.push({ id, password, car, name, phone, model, email, address, role: 'customer' });
      store.set('pm-members', members);
      member = { id, password, car, name, phone, model, email, address, role: 'customer' };
      store.del('pm-signup-draft');
    } else {
      const found = members.find(m => (m.id === id && m.password === password) || (!m.id && m.car === id && m.phone === password));
      /* 차단된 계정/핸드폰번호는 로그인 불가 (자료는 보안 화면에 보관) */
      const blockedList = getBannedMembers().filter(b => b.type === 'blocked' && b.member);
      const bannedHit = found
        ? blockedList.some(b => b.member.id === found.id || (normPhone(b.member.phone) && normPhone(b.member.phone) === normPhone(found.phone)))
        : blockedList.some(b => (b.member.id === id && b.member.password === password) || (b.member.car === id && b.member.phone === password));
      if (bannedHit) { err.textContent = '이용이 제한된 계정입니다. 매장에 문의해주세요.'; return; }
      if (!found) { err.textContent = '아이디 또는 비밀번호가 일치하지 않습니다.'; return; }
      member = found;
      if ($('#m-remember')?.checked) store.setLocal('pm-remember-id', id); else store.del('pm-remember-id');
      if ($('#m-auto')?.checked) {
        store.setLocal('pm-auto-login', true);
        store.setLocal('pm-auto-member', member);
      }
    }
    store.set('pm-member', member);
    closeModal();
    applyAuthUI();
  });
}

const MYPAGE_ICONS = {
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 17v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};
const WORK_STAGES = [
  { label: '접수완료', icon: 'check' },
  { label: '작업중', icon: 'wrench' },
  { label: '검수중', icon: 'search' },
  { label: '완료', icon: 'flag' }
];

async function openMyPageModal() {
  if (!member) return openMemberModal('login');
  const bookings = getBookings().filter(b => b.car === member.car || b.memberId === member.id);
  const serviceRuns = store.get('pm-service-runs', []).filter(r => r.car === member.car || r.memberId === member.id);
  const notices = getMessagesFor(member).filter(m => m.serviceContext?.runId);
  const latestBooking = bookings.slice().sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a))[0];
  const latestRun = serviceRuns.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

  /* 진행 단계: 0 접수완료 → 1 작업중 → 2 검수중 → 3 완료 (-1: 예약 없음) */
  let stageIndex = -1;
  let statusText = '진행 중인 예약이 없어요';
  if (latestRun) {
    const current = (latestRun.steps || [])[latestRun.currentStep] || {};
    const serviceName = latestRun.serviceName || latestRun.service || (latestBooking?.services || [])[0] || '정비';
    if (latestRun.completedAt || /완료/.test(latestRun.status || '')) {
      stageIndex = 3;
      statusText = progressServiceText(serviceName, true);
    } else if (current.submitted && !current.approved) {
      stageIndex = 2;
      statusText = `${serviceName} 검수 중이에요`;
    } else {
      stageIndex = 1;
      statusText = progressServiceText(serviceName);
    }
  } else if (latestBooking) {
    stageIndex = 0;
    statusText = `${latestBooking.branch} ${latestBooking.date} ${latestBooking.time} 예약이 접수되었어요`;
  }
  const stepsHtml = WORK_STAGES.map((stage, i) => `
    <div class="ws ${stageIndex >= i ? 'done' : ''} ${stageIndex === i ? 'now' : ''}">
      <span class="ws-icon">${MYPAGE_ICONS[stage.icon]}</span>
      <em>${stage.label}</em>
    </div>${i < WORK_STAGES.length - 1 ? `<i class="${stageIndex > i ? 'done' : ''}"></i>` : ''}`).join('');
  const hasRunPhotos = latestRun && (latestRun.steps || []).some(s => s.approved && (s.photoKeys || []).length);
  const carMeta = [member.year, member.car].filter(Boolean).join(' · ');
  const banner = await eventBannerHtml();

  openModal(`
    <h3>내예약</h3>
    <section class="mypage-account-card">
      <button type="button" class="mypage-profile" id="mypage-info">
        <span class="profile-avatar" aria-hidden="true">${MYPAGE_ICONS.user}</span>
        <span class="profile-text"><strong>${esc(member.name || '고객')}님</strong><span>안녕하세요!</span></span>
        <b>›</b>
      </button>
      <div class="mypage-account-divider"></div>
      <div class="mypage-car-text">
        <span class="mypage-car-label">내 차량</span>
        <strong>${esc(member.model || '차량 정보를 등록해주세요')}</strong>
        <span>${esc(carMeta || '-')}</span>
      </div>
    </section>
    <nav class="mypage-quick" aria-label="내예약 바로가기">
      <button type="button" id="quick-work"><span class="quick-icon">${MYPAGE_ICONS.wrench}</span><strong>작업현황</strong></button>
      <button type="button" id="mypage-alerts"><span class="quick-icon">${MYPAGE_ICONS.bell}</span><strong>알림</strong>${notices.length ? `<em>${notices.length}</em>` : ''}</button>
      <button type="button" id="mypage-bookings"><span class="quick-icon">${MYPAGE_ICONS.calendar}</span><strong>예약 내역</strong></button>
      <button type="button" id="customer-detail-page"><span class="quick-icon">${MYPAGE_ICONS.doc}</span><strong>이용 내역</strong></button>
    </nav>
    <h4 class="mypage-sec-title">작업 현황</h4>
    <article class="mypage-progress-card" id="work-status-card">
      <p class="work-status-text">${esc(statusText)}</p>
      <div class="work-steps">${stepsHtml}</div>
      ${hasRunPhotos ? `<button type="button" class="mini-btn view-run-photos" data-run="${esc(latestRun.id)}">작업사진 보기</button>` : ''}
    </article>
    ${banner}
    <button type="button" class="mypage-cs-btn" id="mypage-center">
      <span class="cs-icon" aria-hidden="true">${MYPAGE_ICONS.headset}</span>
      <span class="cs-text"><strong>고객센터</strong><span>실시간 채팅으로 문의하세요</span></span>
      <b>›</b>
    </button>
  `, true);
  modalCard.classList.add('mypage-card');
  wireEventBanner();
  $('#customer-detail-page').addEventListener('click', openCustomerHistoryModal);
  $('#mypage-alerts').addEventListener('click', openMyAlertsPage);
  $('#mypage-info').addEventListener('click', openMyInfoPage);
  $('#mypage-bookings').addEventListener('click', openMyBookingsPage);
  $('#mypage-center').addEventListener('click', () => openCustomerCenterModal(member));
  $('#quick-work').addEventListener('click', openWorkStatusPage);
  modalCard.querySelectorAll('.view-run-photos').forEach(btn => {
    btn.addEventListener('click', () => openRunPhotosModal(btn.dataset.run));
  });
}

function myPageBackActions() {
  $('#back-my-page')?.addEventListener('click', openMyPageModal);
}

function myPagePageHeader(title, icon = 'doc') {
  if (!member) return '';
  return `
    <header class="mypage-page-header">
      <span class="mypage-page-icon" aria-hidden="true">${MYPAGE_ICONS[icon] || MYPAGE_ICONS.doc}</span>
      <span><strong>${esc(title)}</strong><em>${esc(member.name || '고객')}님 · ${esc(member.car || '차량번호 미등록')}</em></span>
    </header>`;
}

/* 고객 예약취소 공용: 예약 삭제 + 관리자 알림 */
async function cancelMemberBooking(booking) {
  if (!booking) return false;
  if (!await pmConfirm(`${booking.date} ${booking.time} ${booking.branch} 예약을 취소할까요?`, { title: '예약 취소', okText: '예약취소', danger: true })) return false;
  const arr = getBookings();
  const key = bookingKey(booking);
  const idx = arr.findIndex(b => bookingKey(b) === key);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  store.set('pm-bookings', arr);
  pushAdminNotification(`${booking.name || booking.car || '고객'}님이 ${booking.date} ${booking.time} ${booking.branch} 예약을 취소했습니다.`, { type: 'booking-cancel', car: booking.car || '' });
  logWorkAudit('예약 취소', { name: booking.name, car: booking.car, phone: booking.phone, model: booking.model, branch: booking.branch, service: (booking.services || []).join(', '), bookingDate: booking.date, bookingTime: booking.time }, '', '고객이 예약을 취소함', '고객');
  logEvent('booking_cancel', { branch: booking.branch, date: booking.date, time: booking.time });
  return true;
}

/* 작업현황 상세: 입고 → 작업 → 검수 → 확인 4단계 + 단계별 사진 */
async function openWorkStatusPage() {
  if (!member) return openMemberModal('login');
  const serviceRuns = store.get('pm-service-runs', []).filter(r => r.car === member.car || r.memberId === member.id);
  const run = serviceRuns.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

  if (!run) {
    openModal(`
      <h3>작업현황</h3>
      ${myPagePageHeader('작업현황', 'wrench')}
      <div class="wd-empty">
        <span class="wd-empty-icon">${MYPAGE_ICONS.wrench}</span>
        <p>지금은 진행 중인 작업이 없어요</p>
        <span>예약 후 차량이 입고되면 여기에서<br>작업 과정을 사진으로 확인할 수 있어요.</span>
      </div>
      <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약</button></div>
    `, true, false, openMyPageModal);
    modalCard.classList.add('mypage-card');
    myPageBackActions();
    return;
  }

  const steps = run.steps || [];
  const curIdx = run.currentStep || 0;
  const cur = steps[curIdx] || {};
  const runDone = !!run.completedAt || /완료/.test(run.status || '');
  const inspecting = !!cur.submitted && !cur.approved;
  const serviceName = run.serviceName || run.service || '정비';

  /* 데이터 스텝(입고/작업/출고 등)을 표시 4단계로 분류 */
  const groupOf = s => (s.name || '').includes('입고') ? 0 : (s.name || '').includes('출고') ? 3 : 1;
  const groups = [[], [], [], []];
  steps.forEach((s, i) => groups[groupOf(s)].push({ ...s, idx: i }));

  const groupState = gi => {
    if (runDone) return 'done';
    const g = groups[gi];
    if (gi === 2) return inspecting ? 'now' : 'wait';
    if (!g.length) return 'wait';
    if (g.every(s => s.approved)) return 'done';
    if (g.some(s => s.idx === curIdx)) return gi === 2 ? 'now' : (inspecting ? 'done' : 'now');
    return g[0].idx < curIdx ? 'done' : 'wait';
  };

  const STAGE_META = [
    { label: '입고', icon: 'car', text: { done: '차량이 입고되었어요', now: '차량 입고 처리 중이에요', wait: '차량 입고를 기다리고 있어요' } },
    { label: '작업', icon: 'wrench', text: { done: `${serviceName} 작업을 마쳤어요`, now: `지금 ${serviceName} 작업 중이에요`, wait: '작업 대기 중이에요' } },
    { label: '검수', icon: 'search', text: { done: '검수를 마쳤어요', now: '작업 결과를 검수하고 있어요', wait: '검수 대기 중이에요' } },
    { label: '확인', icon: 'flag', text: { done: '작업이 완료되었어요. 차량을 확인해주세요', now: '출고 준비 중이에요', wait: '출고 대기 중이에요' } }
  ];
  const STATE_LABEL = { done: '완료', now: '진행중', wait: '대기' };

  const stageCards = await Promise.all(STAGE_META.map(async (meta, gi) => {
    const state = groupState(gi);
    const approvedKeys = groups[gi].filter(s => s.approved).flatMap(s => s.photoKeys || []);
    const pendingCount = groups[gi].filter(s => s.submitted && !s.approved).flatMap(s => s.photoKeys || []).length;
    const photos = (await Promise.all(approvedKeys.map(async k => ({ src: await assetSrc(k) })))).filter(p => p.src);
    const photoHtml = photos.length
      ? `<div class="run-photo-grid wd-photos">${photos.map(p => `<figure><img src="${esc(p.src)}" alt="${esc(meta.label)} 사진"></figure>`).join('')}</div>`
      : pendingCount
        ? `<p class="wd-hint">사진 ${pendingCount}장 검수 중 — 확인이 끝나면 공개돼요</p>`
        : groups[gi].length ? '<p class="wd-hint">등록된 사진이 없어요</p>' : '';
    return `
    <article class="wd-stage ${state}">
      <header>
        <span class="wd-icon">${MYPAGE_ICONS[meta.icon]}</span>
        <strong>${meta.label}</strong>
        <em>${STATE_LABEL[state]}</em>
      </header>
      <p>${esc(meta.text[state])}</p>
      ${photoHtml}
    </article>`;
  }));

  openModal(`
    <h3>작업현황</h3>
    ${myPagePageHeader('작업현황', 'wrench')}
    <p class="wd-service"><strong>${esc(serviceName)}</strong>${run.branch ? ` · ${esc(run.branch)}` : ''}</p>
    <section class="work-detail">${stageCards.join('')}</section>
    <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약</button></div>
  `, true, false, openMyPageModal);
  modalCard.classList.add('mypage-card');
  myPageBackActions();
}

function openMyAlertsPage() {
  if (!member) return openMemberModal('login');
  const notices = getMessagesFor(member).filter(m => m.serviceContext?.runId);
  openModal(`
    <h3>알림</h3>
    ${myPagePageHeader('알림', 'bell')}
    <section class="mypage-section">
      <ul class="service-run-list alert-list">${notices.length ? notices.slice(-12).reverse().map(n => `<li><strong>${esc(new Date(n.createdAt).toLocaleString('ko-KR'))}</strong><span>${esc(n.message)}</span><button type="button" class="mini-btn delete-alert" data-id="${esc(n.id)}">알림삭제</button></li>`).join('') : '<li>새 알림이 없습니다.</li>'}</ul>
    </section>
    <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약</button></div>
  `, true, false, openMyPageModal);
  modalCard.classList.add('mypage-card');
  myPageBackActions();
  modalCard.querySelectorAll('.delete-alert').forEach(btn => {
    btn.addEventListener('click', () => {
      store.set('pm-messages', store.get('pm-messages', []).filter(m => m.id !== btn.dataset.id));
      openMyAlertsPage();
    });
  });
}

function openMyInfoPage() {
  if (!member) return openMemberModal('login');
  openModal(`
    <h3>내 정보</h3>
    ${myPagePageHeader('내 정보', 'user')}
    <form id="my-info-form" class="mypage-form">
      <label>아이디<input type="text" value="${esc(member.id || '')}" disabled></label>
      <label>이름<input type="text" id="mi-name" value="${esc(member.name || '')}" required></label>
      <label>차량명<input type="text" id="mi-model" value="${esc(member.model || '')}" placeholder="예: BMW 520d M Sport"></label>
      <label>차량번호<input type="text" id="mi-car" value="${esc(member.car || '')}" required placeholder="예: 12가3456"></label>
      <label>핸드폰번호<input type="tel" id="mi-phone" value="${esc(member.phone || '')}" placeholder="예: 010-1234-5678"></label>
      <label>이메일<input type="email" id="mi-email" value="${esc(member.email || '')}" placeholder="이메일 (선택)"></label>
      <label>주소
        <div class="address-field">
          <input type="text" id="mi-address" value="${esc(member.address || '')}" placeholder="주소 (선택)">
          <button type="button" id="mi-address-find">주소찾기</button>
        </div>
      </label>
      <p class="form-error" id="mi-error"></p>
      <p class="form-ok" id="mi-ok"></p>
      <button type="submit" class="modal-submit">정보 저장</button>
    </form>
    <h4 class="mypage-sec-title">비밀번호 변경</h4>
    <form id="my-pw-form" class="mypage-form">
      <input type="password" id="pw-current" placeholder="현재 비밀번호" required autocomplete="current-password">
      <input type="password" id="pw-new" placeholder="새 비밀번호" required autocomplete="new-password">
      <input type="password" id="pw-new2" placeholder="새 비밀번호 확인" required autocomplete="new-password">
      <p class="hint">비밀번호는 영어 또는 한글과 숫자를 포함해 8자 이상이어야 합니다.</p>
      <p class="form-error" id="pw-error"></p>
      <p class="form-ok" id="pw-ok"></p>
      <button type="submit" class="modal-submit">비밀번호 변경</button>
    </form>
    <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약</button></div>
  `, true, false, openMyPageModal);
  modalCard.classList.add('mypage-card');
  myPageBackActions();
  $('#mi-address-find').addEventListener('click', () => openAddressSearch($('#mi-address')));

  const saveMemberEverywhere = () => {
    const members = store.get('pm-members', []);
    const idx = members.findIndex(m => m.id === member.id);
    if (idx > -1) {
      members[idx] = { ...members[idx], ...member };
      store.set('pm-members', members);
    }
    store.set('pm-member', member);
    if (store.get('pm-auto-login', false)) store.setLocal('pm-auto-member', member);
  };

  $('#my-info-form').addEventListener('submit', e => {
    e.preventDefault();
    const err = $('#mi-error'), ok = $('#mi-ok');
    err.textContent = ''; ok.textContent = '';
    const name = $('#mi-name').value.trim();
    const model = $('#mi-model').value.trim();
    const car = $('#mi-car').value.trim();
    const phone = $('#mi-phone').value.trim();
    const email = $('#mi-email').value.trim();
    const address = $('#mi-address').value.trim();
    if (!name || !car) { err.textContent = '이름과 차량번호는 필수입니다.'; return; }
    const members = store.get('pm-members', []);
    if (members.some(m => m.car === car && m.id !== member.id)) { err.textContent = '이미 등록된 차량번호입니다.'; return; }
    member = { ...member, name, model, car, phone, email, address };
    saveMemberEverywhere();
    ok.textContent = '저장되었습니다.';
  });

  $('#my-pw-form').addEventListener('submit', e => {
    e.preventDefault();
    const err = $('#pw-error'), ok = $('#pw-ok');
    err.textContent = ''; ok.textContent = '';
    const current = $('#pw-current').value;
    const next = $('#pw-new').value;
    const next2 = $('#pw-new2').value;
    if (current !== (member.password || '')) { err.textContent = '현재 비밀번호가 일치하지 않습니다.'; return; }
    if (!validMemberPassword(next)) { err.textContent = '비밀번호는 영어 또는 한글과 숫자를 포함해 8자 이상이어야 합니다.'; return; }
    if (next !== next2) { err.textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
    if (next === current) { err.textContent = '현재 비밀번호와 다른 비밀번호를 입력해주세요.'; return; }
    member = { ...member, password: next };
    saveMemberEverywhere();
    $('#pw-current').value = $('#pw-new').value = $('#pw-new2').value = '';
    ok.textContent = '비밀번호가 변경되었습니다.';
  });
}

function openMyBookingsPage() {
  if (!member) return openMemberModal('login');
  const bookings = getBookings()
    .filter(b => b.car === member.car || b.memberId === member.id)
    .sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a));
  const canCancel = b => b.status !== '취소' && String(b.date || '') >= todayKey() && !runForBooking(b);
  const bookingRows = bookings.length ? bookings.map((b, i) => `
    <tr>
      <td>${esc(b.date)} ${esc(b.time)}</td>
      <td>${esc(b.branch)}</td>
      <td>${esc((b.services || []).join(', ') || '서비스 미선택')}</td>
      <td>${canCancel(b) ? `<button type="button" class="mini-btn danger cancel-booking" data-i="${i}">예약취소</button>` : esc(b.status || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4">예약 기록이 없습니다.</td></tr>';
  openModal(`
    <h3>예약 내역</h3>
    ${myPagePageHeader('예약 내역', 'calendar')}
    <section class="mypage-section">
      <table class="rec-table"><thead><tr><th>일시</th><th>지점</th><th>서비스</th><th>상태</th></tr></thead><tbody>${bookingRows}</tbody></table>
    </section>
    <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약</button></div>
  `, true, false, openMyPageModal);
  modalCard.classList.add('mypage-card');
  myPageBackActions();
  modalCard.querySelectorAll('.cancel-booking').forEach(btn => {
    btn.addEventListener('click', async () => {
      const booking = bookings[Number(btn.dataset.i)];
      if (await cancelMemberBooking(booking)) openMyBookingsPage();
    });
  });
}

async function openCustomerHistoryModal() {
  if (!member) return openMemberModal('login');
  const bookings = getBookings().filter(b => b.car === member.car || b.memberId === member.id);
  const customer = getCustomers()[member.car] || { records: [], memo: '' };
  const serviceRuns = store.get('pm-service-runs', []).filter(r => r.car === member.car || r.memberId === member.id);
  const photos = serviceRuns.flatMap(r => (r.steps || []).flatMap(s => s.approved ? (s.photoKeys || []).map(key => ({ key, name: `${r.serviceName || '작업'} · ${s.name || '사진'}` })) : []));
  const photoItems = await Promise.all(photos.map(async p => ({ ...p, src: await assetSrc(p.key) })));
  const photoGrid = photoItems.filter(p => p.src).length
    ? `<div class="run-photo-grid detail">${photoItems.filter(p => p.src).map(p => `<figure><img src="${esc(p.src)}" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>`
    : '<p class="hint">등록된 작업 이미지가 없습니다.</p>';
  const bookingRows = bookings.length ? bookings.map(b => `
    <tr><td>${esc(b.date)} ${esc(b.time)}</td><td>${esc(b.branch)}</td><td>${esc((b.services || []).join(', ') || '서비스 미선택')}</td><td>${esc(b.memo || '-')}</td></tr>
  `).join('') : '<tr><td colspan="4">예약 기록이 없습니다.</td></tr>';
  const recordRows = (customer.records || []).length ? customer.records.map(r => `
    <tr><td>${esc(r.date)}</td><td>${esc(r.service)}</td><td>${r.amount ? Number(r.amount).toLocaleString() + '원' : '-'}</td><td>${esc(r.payType || (r.paid ? '정산완료' : '미정산'))}</td></tr>
  `).join('') : '<tr><td colspan="4">정비/결제 기록이 없습니다.</td></tr>';
  openModal(`
    <h3>상세내역</h3>
    ${myPagePageHeader('상세내역', 'doc')}
    <section class="mypage-section">
      <h4>작업 이미지</h4>
      ${photoGrid}
    </section>
    <section class="mypage-section">
      <h4>예약 기록</h4>
      <table class="rec-table"><thead><tr><th>일시</th><th>지점</th><th>서비스</th><th>메모</th></tr></thead><tbody>${bookingRows}</tbody></table>
    </section>
    <section class="mypage-section">
      <h4>결제 / 서비스 기록</h4>
      <table class="rec-table"><thead><tr><th>날짜</th><th>서비스</th><th>금액</th><th>정산</th></tr></thead><tbody>${recordRows}</tbody></table>
    </section>
    <div class="modal-actions"><button type="button" class="modal-submit" id="back-my-page">내예약으로</button></div>
  `, true, false, openMyPageModal);
  $('#back-my-page').addEventListener('click', openMyPageModal);
}

async function openRunPhotosModal(runId) {
  const run = store.get('pm-service-runs', []).find(r => r.id === runId);
  const photos = (run?.steps || []).flatMap(s => s.approved ? (s.photoKeys || []).map(key => ({ key, name: s.name })) : []);
  const items = await Promise.all(photos.map(async p => ({ ...p, src: await assetSrc(p.key) })));
  openModal(`
    <h3>작업사진</h3>
    ${myPagePageHeader('작업사진', 'wrench')}
    <div class="run-photo-grid">${items.filter(p => p.src).map(p => `<figure><img src="${p.src}" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`).join('') || '<p class="hint">작업사진이 없습니다.</p>'}</div>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="back-my-page">내예약으로</button>
    </div>
  `, true, false, openMyPageModal);
  $('#back-my-page').addEventListener('click', openMyPageModal);
}

function getMessagesFor(customer) {
  const ids = [customer?.id, customer?.memberId, customer?.car].filter(Boolean).map(String);
  const phone = customer?.phone ? String(customer.phone) : '';
  return store.get('pm-messages', []).filter(m =>
    ids.includes(String(m.memberId || '')) ||
    ids.includes(String(m.car || '')) ||
    (phone && String(m.customer?.phone || '') === phone)
  );
}

function chatRowsHtml(target) {
  const messages = getMessagesFor(target);
  if (!messages.length) return '<li class="empty-msg">아직 메시지가 없습니다. 궁금한 점을 남겨주세요.</li>';
  return messages.map(m => {
    const mine = isAdmin ? m.from === 'admin' : m.from !== 'admin';
    return `
    <li class="chat-msg ${mine ? 'mine' : 'theirs'}">
      ${mine ? '' : `<strong>${m.from === 'admin' ? '프로모터스' : esc(target.name || '고객')}</strong>`}
      <p>${esc(m.message)}</p>
      <time>${esc(new Date(m.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time>
    </li>`;
  }).join('');
}

let chatLastStamp = '';
function updateChatList(force = false) {
  const stream = $('#chat-stream');
  if (!stream || !chatOpenTarget) return;
  const messages = getMessagesFor(chatOpenTarget);
  const stamp = `${messages.length}:${messages[messages.length - 1]?.id || ''}`;
  if (!force && stamp === chatLastStamp) return;
  chatLastStamp = stamp;
  stream.innerHTML = chatRowsHtml(chatOpenTarget);
  stream.scrollTop = stream.scrollHeight;
}

async function fetchRemoteMessages() {
  const supa = getSupabaseConfig();
  if (!supa) return null;
  try {
    const res = await fetch(`${supa.url}/rest/v1/site_data?select=payload&data_key=eq.pm-messages`, {
      headers: supabaseHeaders(supa, 'return=representation')
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows?.[0]?.payload) ? rows[0].payload : null;
  } catch { return null; }
}

/* 원격/로컬 메시지를 id 기준으로 병합해 전송 직후 새로고침에도 메시지가 유실되지 않게 한다 */
function mergeRemoteMessages(remote) {
  const local = store.get('pm-messages', []);
  const byId = new Map();
  [...remote, ...local].forEach(m => { if (m?.id) byId.set(m.id, m); });
  const merged = [...byId.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  store.setLocal('pm-messages', merged);
  if (merged.length > remote.length) syncSupabaseData('pm-messages', merged);
  return merged;
}

function openCustomerCenterModal(customer = member) {
  const target = customer || member;
  if (!target) return openMemberModal('login');
  chatOpenTarget = target;
  chatLastStamp = '';
  openModal(`
    <h3>고객센터</h3>
    ${isAdmin ? '' : myPagePageHeader('고객센터', 'headset')}
    <div class="customer-context">
      <strong>${esc(target.name || '-')}</strong>
      <span>${esc(target.car || '-')} · ${esc(target.model || '-')} · ${esc(target.phone || '-')}</span>
    </div>
    <ul class="chat-stream" id="chat-stream" aria-live="polite"></ul>
    <form id="message-form" class="chat-form">
      <textarea id="message-body" rows="1" placeholder="메시지를 입력하세요" required></textarea>
      <button type="submit" class="chat-send">전송</button>
    </form>
    ${isAdmin ? '' : '<button type="button" class="chat-back" id="back-from-chat">‹ 내예약으로</button>'}
  `, true, false, isAdmin ? null : openMyPageModal);
  modalCard.classList.add('mypage-card');
  updateChatList(true);
  const textarea = $('#message-body');
  const send = () => {
    const text = textarea.value.trim();
    if (!text) return;
    const all = store.get('pm-messages', []);
    all.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      memberId: target.id || target.car || '',
      car: target.car || '',
      from: isAdmin ? 'admin' : 'customer',
      message: text,
      serviceContext: null,
      customer: target,
      createdAt: new Date().toISOString()
    });
    store.set('pm-messages', all);
    if (!isAdmin) pushAdminNotification(`${target.name || target.car || '고객'}님의 새 채팅 문의가 도착했습니다.`, { type: 'inquiry', car: target.car || '' });
    textarea.value = '';
    updateChatList(true);
    textarea.focus();
  };
  $('#message-form').addEventListener('submit', e => { e.preventDefault(); send(); });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('#back-from-chat')?.addEventListener('click', openMyPageModal);
}

function initRealtimeChat() {
  clearInterval(chatTimer);
  let tick = 0;
  chatTimer = setInterval(async () => {
    const chatOpen = !modal.hidden && chatOpenTarget && $('#chat-stream');
    if (chatOpen) {
      /* 채팅이 열려 있으면 메시지만 가볍게 가져와 목록만 갱신 (입력창 포커스 유지) */
      const remote = await fetchRemoteMessages();
      if (remote) mergeRemoteMessages(remote);
      updateChatList();
    } else {
      tick += 1;
      if (tick % 2 === 0 && getSupabaseConfig()) hydrateSupabaseData().catch(() => {});
    }
  }, 2500);
}

/* ---------- 관리자 로그인 모달 ---------- */
function openAdminModal() {
  const sub = getSubAdmin();
  const main = getMainAdmin();
  openModal(`
    <h3>관리자 로그인</h3>
    <form id="admin-form">
      <input type="password" id="a-pw" placeholder="관리자 비밀번호" required>
      <p class="form-error" id="a-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">로그인</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#admin-form').addEventListener('submit', e => {
    e.preventDefault();
    const inputPw = $('#a-pw').value;
    const subAccount = sub.accounts.find(account => account.password === inputPw);
    if (inputPw === main.password || subAccount) {
      isAdmin = true;
      adminRole = inputPw === main.password ? 'main' : 'general';
      adminBranch = inputPw === main.password ? '' : (subAccount.branch || '');
      sessionStorage.setItem('pm-admin', '1');
      sessionStorage.setItem('pm-admin-role', adminRole);
      if (adminBranch) sessionStorage.setItem('pm-admin-branch', adminBranch);
      else sessionStorage.removeItem('pm-admin-branch');
      closeModal();
      applyAuthUI();
    } else {
      $('#a-error').textContent = '비밀번호가 올바르지 않습니다.';
    }
  });
}

/* ============================================================
   오시는길 (지점) — 관리자: 추가/수정/삭제
   ============================================================ */
async function renderBranches() {
  const branches = getBranches();
  const wrap = $('#branches');
  const preview = $('#branch-preview');
  wrap.innerHTML = '';
  preview.hidden = true;
  preview.innerHTML = '';
  if (!branches[selectedBranchIndex]) selectedBranchIndex = 0;

  const mediaBoxes = [];
  for (const [i, b] of branches.entries()) {
    const card = document.createElement('article');
    card.className = 'branch branch-large' + (i === selectedBranchIndex ? ' focus' : '');
    card.id = 'branch-' + i;
    const branchImageKeys = b.imageKeys?.length ? b.imageKeys : (b.imageKey ? [b.imageKey] : []);
    const media = await createImageCarousel(branchImageKeys, b.name, 'branch-large-media', b);
    mediaBoxes.push({ media, key: branchImageKeys[0] || '' });
    card.append(media);

    const h3 = document.createElement('h3'); h3.textContent = b.name;
    const tel = document.createElement('p'); tel.className = 'branch-tel';
    if (/^[\d.\-\s]+$/.test(b.tel)) {
      const a = document.createElement('a');
      a.href = 'tel:' + b.tel.replace(/[^\d]/g, '');
      a.textContent = b.tel;
      tel.append(a);
    } else tel.textContent = b.tel;

    const addr = document.createElement('p'); addr.className = 'branch-addr';
    const addrLink = document.createElement('a');
    addrLink.href = normalizeUrl(b.map) || `https://map.naver.com/p/search/${encodeURIComponent(b.addr || b.name)}`;
    addrLink.target = '_blank';
    addrLink.rel = 'noopener';
    addrLink.textContent = b.addr;
    addr.append(addrLink);
    card.append(h3, tel, addr);

    card.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      selectedBranchIndex = i;
      renderBranches();
      logEvent('branch_select', { branch: b.name });
    });

    if (isMainAdmin()) card.append(cardActions(
      () => openBranchModal(i),
      async () => { if (await pmConfirm(`"${b.name}" 지점을 삭제할까요?`, { title: '지점 삭제', okText: '삭제', danger: true })) { const arr = getBranches(); arr.splice(i, 1); store.set('pm-branches', arr); applyAuthUI(); } }
    ));
    wrap.append(card);
  }

  /* 드롭다운도 지점 목록과 동기화 */
  const dd = $('#dropdown-branches');
  dd.innerHTML = '';
  branches.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.dataset.view = 'location'; btn.dataset.branch = i;
    btn.textContent = b.name;
    btn.addEventListener('click', () => {
        showView('location');
        selectedBranchIndex = i;
        renderBranches();
        const el = document.getElementById('branch-' + i);
      if (el) {
        $$('.branch').forEach(x => x.classList.remove('focus'));
        el.classList.add('focus');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    dd.append(btn);
  });

  applyUniformBranchMediaRatio(mediaBoxes);
}

/* 모든 지점 카드의 이미지 영역을 같은 비율(가장 세로가 긴 이미지 기준)로 맞춘다.
   지점을 새로 만들어도 자동으로 같은 규격이 적용된다. */
async function applyUniformBranchMediaRatio(items) {
  const ratios = [];
  for (const { key } of items) {
    const url = key ? await assetSrc(key) : '';
    if (!url) continue;
    const ratio = await new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => resolve(probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : 0);
      probe.onerror = () => resolve(0);
      probe.src = url;
    });
    if (ratio > 0) ratios.push(ratio);
  }
  if (!ratios.length) return;
  const uniform = Math.min(...ratios);
  items.forEach(({ media }) => { media.style.aspectRatio = String(uniform); });
}

async function createImageCarousel(keys = [], alt = '', className = '', branch = null) {
  const media = document.createElement('div');
  media.className = `${className} ${keys.length ? '' : 'empty'}`.trim();
  const urls = await Promise.all(keys.map(k => assetSrc(k)));
  const valid = urls.filter(Boolean);
  if (!valid.length) {
    media.textContent = '이미지 준비중';
    return media;
  }
  let index = 0;
  const track = document.createElement('div');
  track.className = 'image-track';
  valid.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt;
    img.addEventListener('click', e => {
      e.stopPropagation();
      if (branch) openBranchPhotoModal(branch, url);
      else openImagePreview(url, alt);
    });
    track.append(img);
  });
  media.append(track);
  if (valid.length > 1) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'image-next';
    next.ariaLabel = '다음 이미지';
    next.textContent = '›';
    next.addEventListener('click', e => {
      e.stopPropagation();
      index = (index + 1) % valid.length;
      track.style.transform = `translateX(${-100 * index}%)`;
    });
    media.append(next);
  }
  return media;
}

function openImagePreview(url, alt = '') {
  openModal(`
    <img class="image-preview-large" src="${esc(url)}" alt="${esc(alt)}">
    <div class="modal-actions"><button type="button" class="modal-submit" onclick="closeModal()">닫기</button></div>
  `, true);
}

function openBranchPhotoModal(branch, url) {
  const tel = phoneHref(branch.tel);
  const mobile = phoneHref(branch.mobile);
  const place = normalizeUrl(branch.map) || `https://map.naver.com/p/search/${encodeURIComponent(branch.addr || branch.name)}`;
  openModal(`
    <img class="image-preview-large" src="${esc(url)}" alt="${esc(branch.name)}">
    <div class="branch-photo-info">
      <h3>${esc(branch.name || '')}</h3>
      <p>${esc(branch.addr || '')}</p>
      <div class="branch-photo-actions">
        ${tel ? `<a class="mini-btn add" href="${tel}">전화연결</a>` : ''}
        ${mobile ? `<a class="mini-btn" href="${mobile}">휴대폰 연결</a>` : ''}
        <a class="mini-btn" href="${esc(place)}" target="_blank" rel="noopener">플레이스 연결</a>
      </div>
    </div>
  `, true);
}

function openBranchModal(index) {
  const b = index != null ? getBranches()[index] : { name: '', tel: '', mobile: '', addr: '', map: '', url: '', imageKey: '', imageKeys: [] };
  openModal(`
    <h3>${index != null ? '지점 수정' : '지점 추가'}</h3>
    <form id="branch-form">
      <input type="text" id="b-name" placeholder="지점명 (예: 프로모터스 안산점)" required>
      <input type="text" id="b-tel" placeholder="매장 전화번호 (예: 031.831.9738)" required>
      <input type="text" id="b-mobile" placeholder="핸드폰번호 (선택)">
      <input type="text" id="b-addr" placeholder="주소" required>
      <input type="url" id="b-map" placeholder="네이버 플레이스/지도 링크 (선택)">
      <input type="url" id="b-url" placeholder="지점 상세 URL (선택)">
      <div>
        <p class="field-title">지점 이미지 (최대 10장)</p>
        <div class="album-manager" id="branch-img-manager"></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#b-name').value = b.name; $('#b-tel').value = b.tel;
  $('#b-mobile').value = b.mobile || ''; $('#b-addr').value = b.addr;
  $('#b-map').value = b.map; $('#b-url').value = b.url || '';
  let imageKeys = b.imageKeys?.length ? [...b.imageKeys] : (b.imageKey ? [b.imageKey] : []);

  mountAlbumGrid($('#branch-img-manager'), imageKeys, {
    prefix: 'branch',
    limit: 10,
    onChange: keys => { imageKeys = keys; }
  });

  $('#branch-form').addEventListener('submit', async e => {
    e.preventDefault();
    const arr = getBranches();
    const data = {
      name: $('#b-name').value.trim(), tel: $('#b-tel').value.trim(),
      mobile: $('#b-mobile').value.trim(), addr: $('#b-addr').value.trim(),
      map: $('#b-map').value.trim(), url: $('#b-url').value.trim(), imageKey: imageKeys[0] || '', imageKeys
    };
    if (index != null) arr[index] = data; else arr.push(data);
    store.set('pm-branches', arr);
    closeModal();
    applyAuthUI();
  });
}

/* ============================================================
   블로그 / 정비사례 / 공지 — 관리자 CMS
   ============================================================ */
function plainFromHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  return (t.content.textContent || '').replace(/\s+/g, ' ').trim();
}

async function renderImageStrip(keys = [], alt = '') {
  const urls = await Promise.all(keys.map(k => assetSrc(k)));
  return urls.filter(Boolean).map(url => `<img src="${url}" alt="${esc(alt)}">`).join('');
}

function editorImageKeys(editor) {
  return [...editor.querySelectorAll('img[data-asset-key]')].map(img => img.dataset.assetKey).filter(Boolean).slice(0, 10);
}

function saveEditorRange(editor) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}

async function insertImagesIntoEditor(editor, keys, range = null) {
  let insertRange = range;
  if (!insertRange || !editor.contains(insertRange.commonAncestorContainer)) {
    insertRange = document.createRange();
    insertRange.selectNodeContents(editor);
    insertRange.collapse(false);
  }
  for (const key of keys) {
    const src = await assetSrc(key);
    if (!src) continue;
    const wrap = document.createElement('figure');
    wrap.className = 'editor-image';
    wrap.innerHTML = `<img data-asset-key="${esc(key)}" src="${src}" alt=""><figcaption contenteditable="true">사진 설명 또는 URL 메모</figcaption>`;
    const spacer = document.createElement('p');
    spacer.innerHTML = '<br>';
    insertRange.insertNode(spacer);
    insertRange.insertNode(wrap);
    insertRange.setStartAfter(spacer);
    insertRange.collapse(true);
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(insertRange);
  editor.focus();
}

function applyEditorToolbar(toolbar, editor, options = {}) {
  let lastRange = null;
  const remember = () => { lastRange = saveEditorRange(editor) || lastRange; };
  ['keyup', 'mouseup', 'focus', 'input'].forEach(type => editor.addEventListener(type, remember));
  editor.addEventListener('click', e => {
    editor.querySelectorAll('.editor-image.selected').forEach(el => el.classList.remove('selected'));
    const figure = e.target.closest('.editor-image');
    if (!figure || !editor.contains(figure)) return;
    figure.classList.add('selected');
  });
  editor.addEventListener('keydown', e => {
    if (!['Backspace', 'Delete'].includes(e.key)) return;
    const selected = editor.querySelector('.editor-image.selected');
    if (!selected) return;
    e.preventDefault();
    selected.remove();
    remember();
  });
  toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value || null;
      document.execCommand(btn.dataset.cmd, false, value);
      editor.focus();
    });
  });
  toolbar.querySelectorAll('[data-font]').forEach(select => {
    select.addEventListener('change', () => {
      document.execCommand('fontName', false, select.value);
      editor.focus();
    });
  });
  toolbar.querySelectorAll('[data-size]').forEach(select => {
    select.addEventListener('change', () => {
      document.execCommand('fontSize', false, select.value);
      editor.focus();
    });
  });
  toolbar.querySelectorAll('[data-link]').forEach(btn => {
    btn.addEventListener('click', async () => {
      remember();
      const url = normalizeUrl(await pmPrompt('연결할 URL을 입력하세요.', { title: 'URL 연결', placeholder: 'https://' }) || '');
      if (url) {
        if (lastRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(lastRange);
        }
        document.execCommand('createLink', false, url);
      }
      editor.focus();
    });
  });
  toolbar.querySelectorAll('[data-image]').forEach(btn => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    toolbar.append(input);
    btn.addEventListener('click', () => {
      remember();
      input.click();
    });
    input.addEventListener('change', async e => {
      const currentCount = editorImageKeys(editor).length;
      const room = 10 - currentCount;
      if (room <= 0) {
        pmAlert('본문 이미지는 최대 10장까지 넣을 수 있습니다.');
        e.target.value = '';
        return;
      }
      const keys = await saveFiles(e.target.files, options.prefix || 'post', room);
      await insertImagesIntoEditor(editor, keys, lastRange);
      options.onImages?.(keys);
      e.target.value = '';
    });
  });
}

function editorHtml(id, value = '') {
  return `
    <div class="editor-wrap">
      <div class="editor-toolbar">
        <button type="button" class="editor-icon-btn" data-image aria-label="이미지 추가">▧</button>
        <select data-font aria-label="글꼴">
          <option value="Pretendard, Arial, sans-serif">기본</option>
          <option value="Noto Sans KR, sans-serif">Noto Sans KR</option>
          <option value="Malgun Gothic, sans-serif">맑은 고딕</option>
          <option value="serif">명조</option>
        </select>
        <select data-size aria-label="글씨 크기">
          <option value="3">본문</option>
          <option value="4">크게</option>
          <option value="5">제목</option>
          <option value="6">강조</option>
        </select>
        <button type="button" data-cmd="bold">B</button>
        <button type="button" data-cmd="formatBlock" data-value="h3">제목</button>
        <button type="button" data-cmd="formatBlock" data-value="p">본문</button>
        <button type="button" data-cmd="justifyCenter">중앙</button>
        <button type="button" data-cmd="insertUnorderedList">목록</button>
        <button type="button" data-link>URL</button>
      </div>
      <div class="rich-editor" id="${id}" contenteditable="true">${value}</div>
    </div>`;
}

async function hydrateInlineImages(root = document) {
  const imgs = [...root.querySelectorAll('img[data-asset-key]')];
  await Promise.all(imgs.map(async img => {
    const src = await assetSrc(img.dataset.assetKey);
    if (src) img.src = src;
  }));
}

async function mountAlbumGrid(wrap, keys, options) {
  const limit = options.limit || 10;
  let current = [...keys].slice(0, limit);
  const commit = async () => {
    await options.onChange([...current]);
    await draw();
  };

  async function draw() {
    wrap.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', async e => {
      const room = limit - current.length;
      if (room <= 0) {
        pmAlert(`이미지는 최대 ${limit}장까지 등록할 수 있습니다.`);
        e.target.value = '';
        return;
      }
      const added = await saveFiles(e.target.files, options.prefix || 'album', room);
      current = [...current, ...added].slice(0, limit);
      if (options.editor) await insertImagesIntoEditor(options.editor, added);
      e.target.value = '';
      await commit();
    });
    wrap.append(input);

    const grid = document.createElement('div');
    grid.className = 'album-slots';
    wrap.append(grid);

    for (let i = 0; i < limit; i++) {
      const key = current[i];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'album-slot' + (key ? ' filled' : ' empty');
      slot.dataset.index = i;
      slot.draggable = !!key;
      if (key) {
        slot.innerHTML = `
          <img src="${await assetSrc(key)}" alt="">
          <span>${i + 1}</span>
          <i aria-hidden="true">×</i>`;
      } else {
        slot.innerHTML = `<b>+</b><span>${i + 1}</span>`;
      }
      slot.addEventListener('click', e => {
        if (e.target.tagName === 'I') {
          current.splice(i, 1);
          commit();
          return;
        }
        input.click();
      });
      slot.addEventListener('dragstart', e => {
        if (!key) return;
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        slot.classList.add('dragging');
      });
      slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        slot.classList.add('drop-target');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-target'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drop-target');
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = key ? i : current.length - 1;
        if (!Number.isInteger(from) || from < 0 || from >= current.length || from === to) return;
        const [moved] = current.splice(from, 1);
        current.splice(Math.max(0, Math.min(to, current.length)), 0, moved);
        commit();
      });
      grid.append(slot);
    }
  }

  await draw();
  return { getKeys: () => [...current] };
}

function renderBlogFeed() {
  const feed = $('#blog-feed');
  if (!feed) return;
  const settings = getBlogSettings();
  feed.innerHTML = '';

  if (!settings.rss) return;
  if (['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '4173') {
    const local = document.createElement('p');
    local.className = 'hint warn';
    local.textContent = '로컬 정적 미리보기에서는 블로그 프록시가 실행되지 않습니다. Cloudflare 배포 후 표시됩니다.';
    feed.append(local);
    return;
  }
  const sources = [
    settings.proxy ? `${settings.proxy}${encodeURIComponent(settings.rss)}` : settings.rss
  ].filter(Boolean);

  fetchFirstText(sources)
    .then(xml => {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const items = [...doc.querySelectorAll('item')].slice(0, 50);
      if (!items.length) throw new Error('empty blog feed');
      const grid = document.createElement('div');
      grid.className = 'post-grid';
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '블로그 글';
        const link = item.querySelector('link')?.textContent || settings.url;
        const desc = item.querySelector('description')?.textContent || '';
        const image = firstImageFromHtml(desc);
        const imageSrc = image ? `${settings.imageProxy}${encodeURIComponent(image)}` : '';
        const card = document.createElement('article');
        card.className = 'post-card blog-card';
        card.innerHTML = `
          <div class="post-images ${imageSrc ? '' : 'empty'}">${imageSrc ? `<img src="${esc(imageSrc)}" alt="${esc(title)}">` : '<span>사진 준비중</span>'}</div>
          <div class="post-body">
            <time>${esc(formatKoreanBlogDate(item.querySelector('pubDate')?.textContent || ''))}</time>
            <h3>${esc(title)}</h3>
            <p>${esc(plainFromHtml(desc).slice(0, 74))}</p>
          </div>`;
        card.addEventListener('click', () => window.open(normalizeUrl(link), '_blank', 'noopener'));
        grid.append(card);
      });
      const more = document.createElement('article');
      more.className = 'post-card blog-card blog-more-card';
      more.innerHTML = `
        <div class="post-images empty"><span>더보기</span></div>
        <div class="post-body">
          <time>OFFICIAL BLOG</time>
          <h3>정비사례 더 보러가기</h3>
          <p>네이버 공식블로그에서 프로모터스의 더 많은 작업 기록을 확인하세요.</p>
        </div>`;
      more.addEventListener('click', () => window.open(normalizeUrl(settings.url), '_blank', 'noopener'));
      grid.append(more);
      feed.append(grid);
    })
    .catch(() => {
      const err = document.createElement('p');
      err.className = 'hint warn';
      err.textContent = '블로그 글을 불러오지 못했습니다. 블로그 URL, RSS 주소, Cloudflare Functions 배포 여부를 확인하세요.';
      feed.append(err);
    });
}

function firstImageFromHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  const img = t.content.querySelector('img[src]');
  return img ? normalizeUrl(img.getAttribute('src')) : '';
}

function formatKoreanBlogDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

async function fetchFirstText(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`blog feed ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('blog feed unavailable');
}

function isPublished(item) {
  if (isAdmin || !item?.scheduledAt) return true;
  return new Date(item.scheduledAt).getTime() <= Date.now();
}

async function renderNotices() {
  const allNotices = getNotices();
  const notices = allNotices.filter(isPublished);
  const album = $('#album');
  album.innerHTML = '';

  if (!notices.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '등록된 공지사항이 없습니다.';
    album.append(empty);
    return;
  }

  for (const [i, n] of notices.entries()) {
    const card = document.createElement('article');
    const imageHtml = await renderImageStrip(n.imageKeys || [], n.title);
    card.className = `notice-card post-card ${imageHtml ? 'has-image' : 'text-only'}`;
    card.innerHTML = `
      ${imageHtml ? `<div class="post-images">${imageHtml}</div>` : ''}
      <div class="notice-body">
        <time>${esc(n.date || '')}</time>
        <h3>${esc(n.title || '')}</h3>
        <p>${esc(plainFromHtml(n.bodyHtml || n.body).slice(0, 260))}</p>
      </div>`;
    card.addEventListener('click', e => {
      if (!e.target.closest('button, a')) openPostView(n, { kind: 'notice', index: allNotices.indexOf(n) });
    });
    if (isMainAdmin()) card.append(cardActions(
      () => {
        openNoticeModal(allNotices.indexOf(n));
      },
      async () => {
        if (await pmConfirm('이 공지를 삭제할까요?', { title: '공지 삭제', okText: '삭제', danger: true })) { const arr = getNotices(); arr.splice(allNotices.indexOf(n), 1); store.set('pm-notices', arr); renderNotices(); }
      }
    ));
    album.append(card);
  }
}

function openNoticeModal(index) {
  const n = index != null ? getNotices()[index] : { date: today(), title: '', bodyHtml: '', imageKeys: [], postUrl: '', scheduledAt: '' };
  openModal(`
    <h3>${index != null ? '공지 수정' : '새 공지 작성'}</h3>
    <form id="notice-form">
      <input type="text" id="n-title" placeholder="제목" required>
      <input type="text" id="n-date" placeholder="날짜 (예: 2026.07.08)" required>
      <input type="url" id="n-url" placeholder="게시글 URL (선택)">
      <label class="field-title">예약발행 시간
        <input type="datetime-local" id="n-scheduled">
      </label>
      ${editorHtml('n-editor', cleanHtml(n.bodyHtml || n.body || ''))}
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true, true);
  $('#n-title').value = n.title || '';
  $('#n-date').value = n.date || today();
  $('#n-url').value = n.postUrl || '';
  $('#n-scheduled').value = n.scheduledAt || '';
  let imageKeys = [...(n.imageKeys || [])];
  const editor = $('#n-editor');
  applyEditorToolbar(modalCard.querySelector('.editor-toolbar'), editor, {
    prefix: 'notice',
    onImages: keys => { imageKeys = [...imageKeys, ...keys].slice(0, 10); }
  });
  hydrateInlineImages(editor);

  $('#notice-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getNotices();
    const data = {
      date: $('#n-date').value.trim(),
      title: $('#n-title').value.trim(),
      postUrl: $('#n-url').value.trim(),
      scheduledAt: $('#n-scheduled').value,
      bodyHtml: cleanHtml($('#n-editor').innerHTML),
      imageKeys: editorImageKeys(editor).length ? editorImageKeys(editor) : imageKeys
    };
    if (index != null) arr[index] = data; else arr.unshift(data);
    store.set('pm-notices', arr);
    closeModal();
    renderNotices();
  });
}

function renderCaseFilters() {
  const wrap = $('#case-brand-filter');
  if (!wrap) return;
  wrap.innerHTML = '';
  BRANDS.forEach(brand => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = brand === selectedCaseBrand ? 'active' : '';
    btn.textContent = brand;
    btn.addEventListener('click', () => { selectedCaseBrand = brand; renderCases(); });
    wrap.append(btn);
  });
}

async function renderCases() {
  renderCaseFilters();
  renderBlogFeed();
  const cases = getCases().filter(isPublished);
  const allCases = getCases();
  const filtered = selectedCaseBrand === '전체' ? cases : cases.filter(c => c.brand === selectedCaseBrand);
  const list = $('#case-list');
  list.innerHTML = '';
  $('#case-empty').style.display = filtered.length ? 'none' : '';

  for (const c of filtered) {
    const realIndex = allCases.indexOf(c);
    const card = document.createElement('article');
    card.className = 'post-card case-card';
    const imageHtml = await renderImageStrip(c.imageKeys || [], c.title);
    card.innerHTML = `
      <div class="post-images ${imageHtml ? '' : 'empty'}">${imageHtml || '<span>사진 준비중</span>'}</div>
      <div class="post-body">
        <div class="post-meta"><time>${esc(c.date || '')}</time><span>${esc(c.brand || '기타')}</span></div>
        <h3>${esc(c.title || '')}</h3>
        <p>${esc(plainFromHtml(c.bodyHtml || c.body).slice(0, 140))}</p>
      </div>`;
    card.addEventListener('click', e => {
      if (!e.target.closest('button, a')) openPostView(c);
    });
    if (isMainAdmin()) card.append(cardActions(
      () => openCaseModal(realIndex),
      async () => { if (await pmConfirm('이 정비사례를 삭제할까요?', { title: '정비사례 삭제', okText: '삭제', danger: true })) { const arr = getCases(); arr.splice(realIndex, 1); store.set('promotors-cases', arr); renderCases(); } }
    ));
    list.append(card);
  }
}

function openCaseModal(index = null) {
  const c = index != null ? getCases()[index] : { date: today(), title: '', brand: 'BMW', bodyHtml: '', imageKeys: [], postUrl: '', scheduledAt: '' };
  openModal(`
    <h3>${index != null ? '정비사례 수정' : '정비사례 작성'}</h3>
    <form id="case-edit-form">
      <input type="text" id="ce-title" placeholder="제목" required>
      <select id="ce-brand">${BRANDS.filter(b => b !== '전체').map(b => `<option>${esc(b)}</option>`).join('')}</select>
      <input type="text" id="ce-date" placeholder="날짜" required>
      <input type="url" id="ce-url" placeholder="게시글 URL (선택)">
      <label class="field-title">예약발행 시간
        <input type="datetime-local" id="ce-scheduled">
      </label>
      ${editorHtml('ce-editor', cleanHtml(c.bodyHtml || c.body || ''))}
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true, true);
  $('#ce-title').value = c.title || '';
  $('#ce-brand').value = c.brand || '기타';
  $('#ce-date').value = c.date || today();
  $('#ce-url').value = c.postUrl || '';
  $('#ce-scheduled').value = c.scheduledAt || '';
  let imageKeys = [...(c.imageKeys || [])];
  const editor = $('#ce-editor');
  applyEditorToolbar(modalCard.querySelector('.editor-toolbar'), editor, {
    prefix: 'case',
    onImages: keys => { imageKeys = [...imageKeys, ...keys].slice(0, 10); }
  });
  hydrateInlineImages(editor);

  $('#case-edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getCases();
    const data = {
      title: $('#ce-title').value.trim(),
      brand: $('#ce-brand').value,
      date: $('#ce-date').value.trim(),
      postUrl: $('#ce-url').value.trim(),
      scheduledAt: $('#ce-scheduled').value,
      bodyHtml: cleanHtml($('#ce-editor').innerHTML),
      imageKeys: editorImageKeys(editor).length ? editorImageKeys(editor) : imageKeys
    };
    if (index != null) arr[index] = data; else arr.unshift(data);
    store.set('promotors-cases', arr);
    closeModal();
    renderCases();
  });
}

async function openPostView(post, options = {}) {
  const images = await renderImageStrip(post.imageKeys || [], post.title);
  const contentHtml = cleanHtml(post.bodyHtml || post.body || '');
  const hasInlineImages = /data-asset-key=/.test(contentHtml);
  const canEditNotice = isMainAdmin() && options.kind === 'notice' && options.index != null;
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.date,
    author: { '@type': 'Organization', name: '프로모터스' }
  };
  openModal(`
    <article class="post-view">
      <script type="application/ld+json">${JSON.stringify(articleSchema).replace(/</g, '\\u003c')}</script>
      ${canEditNotice ? `
        <div class="post-admin-actions">
          <button type="button" class="mini-btn" id="post-edit-notice">수정</button>
          <button type="button" class="mini-btn danger" id="post-delete-notice">삭제</button>
        </div>` : ''}
      <h3>${esc(post.title || '')}</h3>
      <p class="post-meta-line">${esc(post.date || '')}${post.brand ? ' · ' + esc(post.brand) : ''}</p>
      ${post.postUrl ? `<a class="post-link" href="${esc(normalizeUrl(post.postUrl))}" target="_blank" rel="noopener">원문/관련 URL 열기</a>` : ''}
      ${hasInlineImages ? '' : `<div class="post-images detail ${images ? '' : 'empty'}">${images || '<span>사진 준비중</span>'}</div>`}
      <div class="post-content">${contentHtml}</div>
    </article>
  `, true);
  hydrateInlineImages(modalCard);
  if (canEditNotice) {
    $('#post-edit-notice')?.addEventListener('click', () => openNoticeModal(options.index));
    $('#post-delete-notice')?.addEventListener('click', async () => {
      if (!await pmConfirm('이 공지를 삭제할까요?', { title: '공지 삭제', okText: '삭제', danger: true })) return;
      const arr = getNotices();
      arr.splice(options.index, 1);
      store.set('pm-notices', arr);
      closeModal();
      renderNotices();
    });
  }
}

/* ---------- 수정/삭제 버튼 묶음 ---------- */
function cardActions(onEdit, onDelete) {
  const div = document.createElement('div');
  div.className = 'card-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'mini-btn'; edit.textContent = '수정';
  edit.addEventListener('click', onEdit);
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'mini-btn danger'; del.textContent = '삭제';
  del.addEventListener('click', onDelete);
  div.append(edit, del);
  return div;
}

/* ============================================================
   소개 이미지 앨범 — 최대 10장 / 순서 변경 / 자동 슬라이드
   ============================================================ */
async function renderIntroSlides() {
  const photo = $('#shop-photo');
  const frame = $('#intro-slider');
  const dots = $('#intro-dots');
  const slides = getIntroSlides();
  if (!photo || !frame || !dots) return;

  clearInterval(introTimer);
  frame.innerHTML = '';
  dots.innerHTML = '';
  photo.classList.toggle('no-img', !slides.length && introDataReady);
  photo.classList.toggle('has-multiple', slides.length > 1);
  introSlideIndex = Math.max(0, Math.min(introSlideIndex, slides.length - 1));

  if (!slides.length) return;
  for (const [i, slide] of slides.entries()) {
    const img = document.createElement('img');
    img.className = i === introSlideIndex ? 'active' : '';
    img.src = await assetSrc(slide.key);
    img.alt = slide.alt || `프로모터스 소개 이미지 ${i + 1}`;
    frame.append(img);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = i === introSlideIndex ? 'active' : '';
    dot.ariaLabel = `${i + 1}번째 소개 이미지`;
    dot.addEventListener('click', () => { introSlideIndex = i; renderIntroSlides(); });
    dots.append(dot);
  }

  introTimer = null;
}

function moveIntroSlide(step) {
  const slides = getIntroSlides();
  if (!slides.length) return;
  introSlideIndex = (introSlideIndex + step + slides.length) % slides.length;
  renderIntroSlides();
}

async function openIntroAlbumModal() {
  const slides = getIntroSlides();
  openModal(`
    <h3>소개 이미지 관리</h3>
    <div class="album-manager" id="intro-manager"></div>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="intro-save">닫기</button>
    </div>
  `, true);
  await mountAlbumGrid($('#intro-manager'), slides.map(s => s.key), {
    prefix: 'intro',
    limit: 10,
    onChange: keys => {
      store.set('pm-intro-slides', keys.map((key, i) => ({ key, alt: `프로모터스 소개 이미지 ${i + 1}` })));
      renderIntroSlides();
    }
  });
  $('#intro-save').addEventListener('click', closeModal);
}

async function initShopImage() {
  const oldFile = await assetDb.get('shop-image').catch(() => null);
  if (oldFile && !getIntroSlides().length) {
    await assetDb.set('intro-legacy-shop-image', oldFile);
    store.set('pm-intro-slides', [{ key: 'intro-legacy-shop-image', alt: '프로모터스 소개 이미지' }]);
  }
  $('#intro-prev').addEventListener('click', () => moveIntroSlide(-1));
  $('#intro-next').addEventListener('click', () => moveIntroSlide(1));
  ['mousemove', 'pointerdown', 'mouseenter', 'touchstart', 'focusin'].forEach(type => {
    $('#shop-photo').addEventListener(type, () => { introLastActivity = Date.now(); }, { passive: true });
  });
  $('#btn-shop-img').addEventListener('click', openIntroAlbumModal);
  $('#shop-img-input').addEventListener('change', async e => {
    const current = getIntroSlides();
    const keys = await saveFiles(e.target.files, 'intro', 10 - current.length);
    store.set('pm-intro-slides', [...current, ...keys.map(key => ({ key, alt: '프로모터스 소개 이미지' }))].slice(0, 10));
    e.target.value = '';
    renderIntroSlides();
  });
  renderIntroSlides();
}

/* ============================================================
   정비예약 - 지점 선택 → (로그인 필수) → 캘린더
   ============================================================ */
const getBookings = () => store.get('pm-bookings', []);
const SLOT_TIMES = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
let cal = null; /* { branch, y, m, selDate, selTime } */

function openReserveFlow() {
  if (isAdmin) {
    closeModal();
    showView('adm-book');
    initAdmBook();
    return;
  }
  if (!member) {
    openModal(`
      <h3>정비예약</h3>
      <p style="margin-bottom:18px; color:#555f6b; line-height:1.6;">예약은 <strong>로그인 후</strong> 이용하실 수 있습니다.<br>차량번호로 간편하게 가입하세요.</p>
      <div class="modal-actions">
        <button type="button" class="modal-submit" id="go-login">로그인</button>
        <button type="button" class="modal-cancel" id="go-signup">회원가입</button>
      </div>
    `);
    $('#go-login').addEventListener('click', () => openMemberModal('login'));
    $('#go-signup').addEventListener('click', () => openMemberModal('signup'));
    return;
  }
  const activeBooking = getBookings().find(b =>
    (b.memberId === member.id || b.car === member.car) &&
    b.status !== '취소' &&
    String(b.date || '') >= todayKey()
  );
  if (activeBooking) {
    const cancellable = !runForBooking(activeBooking);
    openModal(`
      <h3>정비예약</h3>
      <p class="confirm-copy">이미 예약이 있습니다.<br>
        <strong>${esc(activeBooking.date)} ${esc(activeBooking.time)} · ${esc(activeBooking.branch)}</strong><br>
        ${esc((activeBooking.services || []).join(', ') || '')}</p>
      <p class="cal-msg">${cancellable ? '예약을 취소하면 새 예약을 진행할 수 있습니다.' : '이미 작업이 시작되어 취소할 수 없습니다. 지점으로 문의해주세요.'}</p>
      <div class="modal-actions">
        ${cancellable ? '<button type="button" class="modal-submit danger" id="cancel-active-booking">예약 취소</button>' : ''}
        <button type="button" class="modal-cancel" onclick="closeModal()">닫기</button>
      </div>
    `);
    $('#cancel-active-booking')?.addEventListener('click', async () => {
      if (await cancelMemberBooking(activeBooking)) openBranchSelect();
    });
    return;
  }
  openBranchSelect();
}

function openBranchSelect() {
  const branches = getBranches();
  openModal(`
    <h3>예약 지점 선택</h3>
    <div class="branch-select" id="branch-select"></div>
  `);
  const wrap = $('#branch-select');
  branches.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.name;
    btn.addEventListener('click', () => {
      const now = new Date();
      cal = { branch: b.name, y: now.getFullYear(), m: now.getMonth(), selDate: null, selTime: null };
      renderCalendar();
    });
    wrap.append(btn);
  });
}

function dateKey(y, m, d) { return `${y}.${String(m + 1).padStart(2, '0')}.${String(d).padStart(2, '0')}`; }

function renderCalendar(message) {
  const { branch, y, m } = cal;
  const bookings = getBookings().filter(b => b.branch === branch);
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  openModal(`
    <h3>${branch} 정비예약</h3>
    <div class="cal-user">
      <strong>${member.car}</strong> · ${member.model || '차량명 미입력'} (${member.name}님)
    </div>
    <div class="cal-head">
      <button type="button" class="cal-nav" id="cal-prev">‹</button>
      <h4>${y}. ${String(m + 1).padStart(2, '0')}</h4>
      <button type="button" class="cal-nav" id="cal-next">›</button>
    </div>
    <div class="cal-grid" id="cal-grid"></div>
    <div id="cal-slots"></div>
    ${message ? `<p class="cal-msg ok">${message}</p>` : '<p class="cal-msg">날짜를 선택하면 예약 가능한 시간이 표시됩니다. 초록 점은 내 예약입니다.</p>'}
  `, true);

  const grid = $('#cal-grid');
  ['일','월','화','수','목','금','토'].forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'cal-dow' + (i === 0 ? ' sun' : '');
    el.textContent = d;
    grid.append(el);
  });
  for (let i = 0; i < first; i++) {
    const el = document.createElement('button');
    el.className = 'cal-day empty';
    el.disabled = true;
    grid.append(el);
  }
  for (let d = 1; d <= days; d++) {
    const key = dateKey(y, m, d);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cal-day';
    el.textContent = d;
    const dayBookings = bookings.filter(b => b.date === key);
    if (dayBookings.length) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = '예약 ' + dayBookings.length;
      el.append(cnt);
    }
    if (dayBookings.some(b => b.car === member.car)) el.classList.add('mine');
    const isPast = key < todayKey;
    const isSunday = new Date(y, m, d).getDay() === 0;
    if (isPast || isSunday) el.disabled = true;
    if (cal.selDate === key) el.classList.add('sel');
    el.addEventListener('click', () => { cal.selDate = key; cal.selTime = null; renderCalendar(); });
    grid.append(el);
  }

  $('#cal-prev').addEventListener('click', () => {
    cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; }
    cal.selDate = null; cal.selTime = null; renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; }
    cal.selDate = null; cal.selTime = null; renderCalendar();
  });

  if (cal.selDate) renderSlots(bookings);
}

function renderSlots(branchBookings) {
  const wrap = $('#cal-slots');
  const dayBookings = branchBookings.filter(b => b.date === cal.selDate);
  const blockedTimes = getBlocked()
    .filter(b => b.branch === cal.branch && b.date === cal.selDate)
    .map(b => b.time);

  wrap.innerHTML = `
    <p class="slots-title">${cal.selDate} 예약 시간 선택</p>
    <div class="slots" id="slots"></div>
    <div class="modal-actions"><button type="button" class="modal-submit" id="confirm-booking" ${cal.selTime ? '' : 'disabled'}>예약하기</button></div>
    <p class="cal-msg">이미 예약된 시간만 선택할 수 없습니다. 내 예약(초록)을 누르면 취소됩니다.</p>`;

  const slots = $('#slots');
  SLOT_TIMES.forEach(t => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'slot';
    el.textContent = t;
    const taken = dayBookings.find(b => b.time === t);

    if (blockedTimes.includes(t)) {
      el.textContent = 'X';
      el.disabled = true;
      el.classList.add('blocked');
      el.title = '이 시간에는 예약이 있습니다. 전화로 문의해주세요.';
    } else if (taken && taken.car === member.car) {
      el.classList.add('mine');
      el.title = '내 예약 - 누르면 취소';
      el.addEventListener('click', async () => {
        if (await cancelMemberBooking(taken)) renderCalendar('예약이 취소되었습니다.');
      });
    } else if (taken) {
      el.disabled = true; /* 해당 시간만 차단 - 다른 시간은 예약 가능 */
    } else {
      if (cal.selTime === t) el.classList.add('sel');
      el.addEventListener('click', () => { cal.selTime = t; renderSlots(branchBookings); });
    }
    slots.append(el);
  });

  $('#confirm-booking').addEventListener('click', () => {
    if (cal.selTime) renderServiceStep();
  });
}

/* ---------- 예약 2단계: 서비스 선택 ---------- */
function renderServiceStep() {
  const products = getProducts();
  openModal(`
    <h3>어떤 서비스가 필요하세요?</h3>
    <p class="cal-msg">${cal.branch} · ${cal.selDate} ${cal.selTime} · ${member.car}</p>
    <div class="svc-mileage-field">
      <label for="svc-mileage">현재 주행거리</label>
      <input type="number" id="svc-mileage" min="0" placeholder="현재 주행거리(km)" required>
    </div>
    <div class="svc-list" id="svc-list"></div>
    <textarea id="svc-memo" rows="3" placeholder="요청사항 메모 (기타 선택 시 내용을 적어주세요)"></textarea>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="svc-confirm">예약 확정</button>
      <button type="button" class="modal-cancel" id="svc-back">이전</button>
    </div>
  `, true);

  const list = $('#svc-list');
  const options = [...products.map(p => ({ value: p.name, label: p.name })),
                   { value: '기타', label: '기타 (아래 메모에 내용을 적어주세요)' }];
  options.forEach(o => {
    const l = document.createElement('label');
    l.className = 'svc-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = o.value;
    l.append(cb, document.createTextNode(' ' + o.label));
    list.append(l);
  });

  $('#svc-back').addEventListener('click', () => renderCalendar());
  $('#svc-confirm').addEventListener('click', () => {
    const services = [...list.querySelectorAll('input:checked')].map(c => c.value);
    const memo = $('#svc-memo').value.trim();
    const mileage = $('#svc-mileage').value.trim();
    if (!mileage) { pmAlert('현재 주행거리를 입력해주세요.'); return; }
    if (!services.length && !memo) { pmAlert('서비스를 선택하거나 기타 메모를 입력해주세요.'); return; }
    const activeBooking = getBookings().find(b =>
      (b.memberId === member.id || b.car === member.car) &&
      b.status !== '취소' &&
      String(b.date || '') >= todayKey()
    );
    if (activeBooking) {
      pmAlert(`${activeBooking.date} ${activeBooking.time} 예약된 날짜가 있습니다. 취소 후 신청해주세요.`);
      return;
    }
    const arr = getBookings();
    if (arr.some(b => b.branch === cal.branch && b.date === cal.selDate && b.time === cal.selTime)) {
      renderCalendar('죄송합니다. 방금 다른 고객이 해당 시간을 예약했습니다.'); return;
    }
    arr.push({ id: `book-${Date.now()}-${Math.random().toString(36).slice(2)}`,
               branch: cal.branch, date: cal.selDate, time: cal.selTime,
               memberId: member.id || '',
               car: member.car, name: member.name, phone: member.phone, model: member.model || '',
               services, memo, mileage, status: '승인대기' });
    store.set('pm-bookings', arr);
    pushAdminNotification(`${member.name} ${member.car} ${cal.branch} ${cal.selDate} ${cal.selTime} 예약 승인 요청`, { bookingId: arr[arr.length - 1].id });
    logWorkAudit('고객 예약', { name: member.name, car: member.car, phone: member.phone, model: member.model, branch: cal.branch, service: services.join(', ') || '서비스 미선택', bookingDate: cal.selDate, bookingTime: cal.selTime }, '', memo ? `요청메모: ${memo}` : '', '고객');
    const done = `${cal.branch} ${cal.selTime} 예약 신청이 접수되었습니다. 관리자 승인 후 확정됩니다.`;
    cal.selTime = null;
    openBookingDoneModal(done);
  });
}

function openBookingDoneModal(message) {
  openModal(`
    <div class="booking-done">
      <div class="check-mark">✓</div>
      <h3>${esc(message)}</h3>
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="booking-done-ok">확인</button>
    </div>
  `);
  $('#booking-done-ok').addEventListener('click', () => {
    closeModal();
    openMyPageModal();
  });
}

/* ============================================================
   관리자: 예약관리 — 현황 캘린더 / 예약금지 / 변경 / 취소
   ============================================================ */
let adm = null;

function initAdmBook() {
  const now = new Date();
  const branches = currentAdminBranches();
  if (!adm) adm = { branch: branches[0]?.name, y: now.getFullYear(), m: now.getMonth(), selDate: null };
  if (isGeneralAdmin() && adminBranch) adm.branch = adminBranch;
  renderAdmBook();
}

function renderAdmBook() {
  const body = $('#adm-book-body');
  if (!isAdmin || !adm) { body.innerHTML = ''; return; }
  const branches = currentAdminBranches();
  if (!branches.length) {
    body.innerHTML = '<p class="hint">담당 지점이 없습니다. 메인관리자에게 지점 권한을 확인해주세요.</p>';
    return;
  }
  if (!branches.some(b => b.name === adm.branch)) adm.branch = branches[0]?.name;
  const bookings = getBookings().filter(b => b.branch === adm.branch);
  const blocked = getBlocked().filter(b => b.branch === adm.branch);
  const first = new Date(adm.y, adm.m, 1).getDay();
  const days = new Date(adm.y, adm.m + 1, 0).getDate();

  body.innerHTML = `
    <div class="adm-tabs" id="adm-branch-tabs"></div>
    <div class="cal-head">
      <button type="button" class="cal-nav" id="adm-prev">‹</button>
      <h4>${adm.y}. ${String(adm.m + 1).padStart(2, '0')}</h4>
      <button type="button" class="cal-nav" id="adm-next">›</button>
    </div>
    <div class="cal-grid" id="adm-grid"></div>
    <div id="adm-day"></div>`;

  const tabs = $('#adm-branch-tabs');
  branches.forEach(b => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tab' + (b.name === adm.branch ? ' active' : '');
    t.textContent = b.name;
    t.disabled = isGeneralAdmin() && adminBranch && b.name !== adminBranch;
    t.addEventListener('click', () => { if (!canAccessBranch(b.name)) return; adm.branch = b.name; adm.selDate = null; renderAdmBook(); });
    tabs.append(t);
  });

  const grid = $('#adm-grid');
  ['일','월','화','수','목','금','토'].forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'cal-dow' + (i === 0 ? ' sun' : '');
    el.textContent = d;
    grid.append(el);
  });
  for (let i = 0; i < first; i++) {
    const el = document.createElement('button');
    el.className = 'cal-day empty'; el.disabled = true;
    grid.append(el);
  }
  for (let d = 1; d <= days; d++) {
    const key = dateKey(adm.y, adm.m, d);
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'cal-day'; el.textContent = d;
    const cnt = bookings.filter(b => b.date === key).length;
    const blk = blocked.filter(b => b.date === key).length;
    if (cnt || blk) {
      const c = document.createElement('span');
      c.className = 'cnt';
      c.textContent = (cnt ? '예약 ' + cnt : '') + (cnt && blk ? ' · ' : '') + (blk ? '완료 ' + blk : '');
      el.append(c);
    }
    if (adm.selDate === key) el.classList.add('sel');
    el.addEventListener('click', () => { adm.selDate = key; renderAdmBook(); });
    grid.append(el);
  }
  $('#adm-prev').addEventListener('click', () => { adm.m--; if (adm.m < 0) { adm.m = 11; adm.y--; } adm.selDate = null; renderAdmBook(); });
  $('#adm-next').addEventListener('click', () => { adm.m++; if (adm.m > 11) { adm.m = 0; adm.y++; } adm.selDate = null; renderAdmBook(); });

  if (adm.selDate) renderAdmDay();
}

function renderAdmDay() {
  const wrap = $('#adm-day');
  const bookings = getBookings();
  const blocked = getBlocked();
  wrap.innerHTML = `<p class="slots-title">${adm.selDate} 시간대 현황</p><div id="slot-rows"></div>`;
  const rows = $('#slot-rows');

  SLOT_TIMES.forEach(t => {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const bIdx = bookings.findIndex(b => b.branch === adm.branch && b.date === adm.selDate && b.time === t);
    const blkIdx = blocked.findIndex(b => b.branch === adm.branch && b.date === adm.selDate && b.time === t);

    const time = document.createElement('strong');
    time.textContent = t;
    const info = document.createElement('span');
    info.className = 'slot-info';
    row.append(time, info);

    if (bIdx > -1) {
      const b = bookings[bIdx];
      info.innerHTML = `
        <b>${esc(b.car || '-')}</b> · ${esc(b.name || '-')} · ${esc(b.model || '-')} ·
        ${esc((b.services && b.services.length) ? b.services.join(', ') : '서비스 미선택')} ·
        <a href="${phoneHref(b.phone)}">${esc(b.phone || '-')}</a>${b.mileage ? ' · ' + Number(b.mileage).toLocaleString() + 'km' : ''}${b.status ? ' · ' + esc(b.status) : ''}${b.memo ? ' · ' + esc(b.memo) : ''}`;
      if (b.status === '승인대기' && isMainAdmin()) {
        row.append(miniBtn('예약승인', () => approveBooking(b.id)));
      }
      row.append(miniBtn('변경', () => openMoveBooking(bIdx)),
                 miniBtn('취소', async () => {
                   if (!await pmConfirm('이 예약을 취소할까요?', { title: '예약 취소', okText: '예약취소', danger: true })) return;
                   const arr = getBookings(); arr.splice(bIdx, 1); store.set('pm-bookings', arr);
                   logWorkAudit('예약 취소', { name: b.name, car: b.car, phone: b.phone, model: b.model, branch: b.branch, service: (b.services || []).join(', '), bookingDate: b.date, bookingTime: b.time }, '', '관리자가 예약을 취소함');
                   renderAdmBook();
                 }, true));
    } else if (blkIdx > -1) {
      info.textContent = '예약완료';
      info.classList.add('blocked-text');
      row.append(miniBtn('완료 해제', () => {
        const arr = getBlocked(); arr.splice(blkIdx, 1); store.set('pm-blocked', arr); renderAdmBook();
      }));
    } else {
      info.textContent = '비어있음';
      row.append(miniBtn('예약완료', () => {
        const arr = getBlocked(); arr.push({ branch: adm.branch, date: adm.selDate, time: t }); store.set('pm-blocked', arr); renderAdmBook();
      }),
      miniBtn('예약추가', () => openAdminBookingModal(t)));
    }
    rows.append(row);
  });
}

function miniBtn(text, fn, danger) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini-btn' + (danger ? ' danger' : '');
  b.textContent = text;
  b.addEventListener('click', fn);
  return b;
}

function approveBooking(bookingId) {
  if (!isMainAdmin()) return;
  const arr = getBookings();
  const booking = arr.find(b => b.id === bookingId);
  if (!booking) return;
  booking.status = '예약확정';
  booking.approvedAt = new Date().toISOString();
  store.set('pm-bookings', arr);
  pushCustomerMessage(booking, `${booking.branch} ${booking.date} ${booking.time} 예약이 확정되었습니다.`, { bookingId: booking.id, type: 'booking-approved' });
  renderAdmBook();
}

function openMoveBooking(idx) {
  const b = getBookings()[idx];
  openModal(`
    <h3>예약 변경</h3>
    <p class="cal-msg">${b.car} ${b.name} · 현재 ${b.date} ${b.time}</p>
    <form id="move-form">
      <input type="date" id="mv-date" required>
      <select id="mv-time">${SLOT_TIMES.map(t => `<option>${t}</option>`).join('')}</select>
      <p class="form-error" id="mv-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">변경</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>`);
  $('#mv-date').value = b.date.replaceAll('.', '-');
  $('#mv-time').value = b.time;
  $('#move-form').addEventListener('submit', e => {
    e.preventDefault();
    const nd = $('#mv-date').value.replaceAll('-', '.');
    const nt = $('#mv-time').value;
    const all = getBookings();
    if (all.some((x, i) => i !== idx && x.branch === b.branch && x.date === nd && x.time === nt)) {
      $('#mv-error').textContent = '해당 시간에 이미 예약이 있습니다.'; return;
    }
    if (getBlocked().some(x => x.branch === b.branch && x.date === nd && x.time === nt)) {
      $('#mv-error').textContent = '해당 시간은 예약완료 상태입니다.'; return;
    }
    all[idx] = { ...b, date: nd, time: nt };
    store.set('pm-bookings', all);
    closeModal();
    renderAdmBook();
  });
}

function openAdminBookingModal(time) {
  const members = store.get('pm-members', []);
  const products = getProducts();
  openModal(`
    <h3>관리자 예약 추가</h3>
    <p class="cal-msg">${esc(adm.branch)} · ${esc(adm.selDate)} ${esc(time)}</p>
    <form id="admin-book-form">
      <select id="ab-member">
        <option value="">직접 입력</option>
        ${members.map(m => `<option value="${esc(m.id || m.car)}">${esc(m.name || '-')} · ${esc(m.car || '-')} · ${esc(m.model || '-')} · ${esc(m.phone || '-')}</option>`).join('')}
      </select>
      <input type="text" id="ab-car" placeholder="차량번호" required>
      <input type="text" id="ab-name" placeholder="이름" required>
      <input type="text" id="ab-model" placeholder="모델" required>
      <input type="tel" id="ab-phone" placeholder="전화번호" required>
      <div class="svc-list" id="ab-services"></div>
      <textarea id="ab-memo" rows="3" placeholder="요청사항 / 관리자 메모"></textarea>
      <p class="form-error" id="ab-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">예약추가</button>
        <button type="button" class="modal-cancel" onclick="closeModal()">취소</button>
      </div>
    </form>
  `, true);

  const serviceWrap = $('#ab-services');
  [...products.map(p => p.name), '기타'].forEach(name => {
    const label = document.createElement('label');
    label.className = 'svc-item';
    label.innerHTML = `<input type="checkbox" value="${esc(name)}"> ${esc(name)}`;
    serviceWrap.append(label);
  });

  $('#ab-member').addEventListener('change', e => {
    const selected = members.find(m => (m.id || m.car) === e.target.value);
    if (!selected) return;
    $('#ab-car').value = selected.car || '';
    $('#ab-name').value = selected.name || '';
    $('#ab-model').value = selected.model || '';
    $('#ab-phone').value = selected.phone || '';
  });

  $('#admin-book-form').addEventListener('submit', e => {
    e.preventDefault();
    const all = getBookings();
    if (all.some(b => b.branch === adm.branch && b.date === adm.selDate && b.time === time)) {
      $('#ab-error').textContent = '해당 시간에 이미 예약이 있습니다.';
      return;
    }
    if (getBlocked().some(b => b.branch === adm.branch && b.date === adm.selDate && b.time === time)) {
      $('#ab-error').textContent = '해당 시간은 예약완료 상태입니다.';
      return;
    }
    const memberKey = $('#ab-member').value;
    const selected = members.find(m => (m.id || m.car) === memberKey);
    const services = [...serviceWrap.querySelectorAll('input:checked')].map(input => input.value);
    const memo = $('#ab-memo').value.trim();
    if (!services.length && !memo) {
      $('#ab-error').textContent = '서비스를 선택하거나 메모를 입력해주세요.';
      return;
    }
    all.push({
      id: `book-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      branch: adm.branch,
      date: adm.selDate,
      time,
      memberId: selected?.id || '',
      car: $('#ab-car').value.trim(),
      name: $('#ab-name').value.trim(),
      model: $('#ab-model').value.trim(),
      phone: $('#ab-phone').value.trim(),
      services,
      memo,
      status: '예약확정',
      createdBy: 'admin'
    });
    store.set('pm-bookings', all);
    const added = all[all.length - 1];
    logWorkAudit('예약 등록(직접)', { name: added.name, car: added.car, phone: added.phone, model: added.model, branch: added.branch, service: services.join(', ') || '서비스 미선택', bookingDate: added.date, bookingTime: added.time }, '', memo ? `메모: ${memo}` : '');
    closeModal();
    renderAdmBook();
  });
}

/* ============================================================
   관리자: 고객관리 — 메모 / 서비스 이력 / 정산
   ============================================================ */
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

function mutateCust(car, fn) {
  const customers = getCustomers();
  const c = customers[car] || { memo: '', records: [] };
  fn(c);
  customers[car] = c;
  store.set('pm-customers', customers);
  renderAdmCust();
}

function bookingTimestamp(b) {
  if (!b?.date) return 0;
  const date = String(b.date).replace(/\./g, '-');
  const time = b.time || '00:00';
  const stamp = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function latestBookingForMember(m, bookings = getBookings()) {
  return bookings
    .filter(b => b.memberId === m.id || b.car === m.car || b.phone === m.phone)
    .sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a))[0] || null;
}

function memoEntriesFor(c) {
  const entries = Array.isArray(c.memoEntries) ? [...c.memoEntries] : [];
  if (!entries.length && c.memo) {
    entries.push({
      id: 'legacy-memo',
      body: c.memo,
      createdAt: c.memoUpdatedAt || new Date().toISOString()
    });
  }
  return entries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/* 입력시간: 분까지만 표시 */
function fmtMinute(iso) {
  return new Date(iso || Date.now()).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function memoEntryHtml(entry) {
  return `
    <article class="memo-entry" data-memo-id="${esc(entry.id)}">
      <header class="memo-entry-head">
        <time>${esc(fmtMinute(entry.createdAt))}${entry.updatedAt ? ' <i>(수정됨)</i>' : ''}</time>
        <span class="memo-entry-actions">
          <button type="button" class="memo-edit" data-memo="${esc(entry.id)}">수정</button>
          <button type="button" class="memo-del" data-memo="${esc(entry.id)}">삭제</button>
        </span>
      </header>
      ${entry.title ? `<p class="memo-line"><span class="memo-label">제목</span><strong>${esc(entry.title)}</strong></p>` : ''}
      ${entry.amount ? `<p class="memo-line"><span class="memo-label">금액</span><em>${Number(entry.amount).toLocaleString()}원</em></p>` : ''}
      ${entry.body ? `<p class="memo-line memo-body"><span class="memo-label">내용</span><span class="memo-text">${esc(entry.body)}</span></p>` : ''}
    </article>`;
}

/* 고객관리: 예약과 자동 연동된 작업 행 (클릭 시 작업 데이터로 이동) */
function custRunRowHtml(run) {
  const photoCount = runAllPhotos(run).length;
  return `
    <button type="button" class="cust-run-row" data-run="${esc(run.id)}">
      <time>${esc(run.bookingDate || '-')} ${esc(run.bookingTime || '')}</time>
      <strong>${esc(run.service || run.serviceName || '-')}</strong>
      <span>${esc(run.branch || '-')}${photoCount ? ` · 사진 ${photoCount}장` : ''}</span>
      <em>${esc(run.status || '-')}</em>
    </button>`;
}

function renderAdmCust() {
  const body = $('#adm-cust-body');
  if (!isMainAdmin()) { body.innerHTML = ''; return; }
  const bookings = getBookings();
  const members = store.get('pm-members', [])
    .map(m => ({ ...m, latestBooking: latestBookingForMember(m, bookings) }))
    .sort((a, b) => bookingTimestamp(b.latestBooking) - bookingTimestamp(a.latestBooking));
  const customers = getCustomers();
  body.innerHTML = `
    <datalist id="service-product-options">${getProducts().map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
    <div id="cust-list">${members.length ? '' : '<p class="hint">가입된 고객이 없습니다.</p>'}</div>`;
  const list = $('#cust-list');

  members.forEach(m => {
    const c = customers[m.car] || { memo: '', records: [] };
    const bookCnt = bookings.filter(b => b.memberId === m.id || b.car === m.car || b.phone === m.phone).length;
    const total = (c.records || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const unpaid = (c.records || []).filter(r => !r.paid).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const memberRuns = getServiceRuns()
      .filter(r => r.car === m.car || (m.id && r.memberId === m.id))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latestText = m.latestBooking ? `${m.latestBooking.date} ${m.latestBooking.time}` : '예약 없음';
    const isOpen = openCustCards.has(m.car);
    const memoFilter = custMemoFilters.get(m.car) || { date: '', text: '', open: false };
    custMemoFilters.set(m.car, memoFilter);
    const card = document.createElement('article');
    card.className = 'cust-card' + (isOpen ? ' open' : '');
    card.innerHTML = `
      <button type="button" class="cust-summary" aria-expanded="${isOpen}">
        <strong>${esc(m.name || '-')}</strong>
        <span>${esc(m.car || '-')}</span>
        <span>${esc(m.model || '-')}</span>
        <a href="${phoneHref(m.phone)}" data-phone>${esc(m.phone || '-')}</a>
        <em>최근 ${esc(latestText)}</em>
      </button>
      <div class="cust-detail" ${isOpen ? '' : 'hidden'}>
        <div class="cust-head">
          <strong>${esc(m.name || '-')}</strong>
          <span>${esc(m.car || '-')} · ${esc(m.model || '-')} · <a href="${phoneHref(m.phone)}">${esc(m.phone || '-')}</a></span>
          <em>예약 ${bookCnt}건 · 합계 ${total.toLocaleString()}원 · 미수 ${unpaid.toLocaleString()}원</em>
        </div>
        <div class="cust-actions">
          <button type="button" class="mini-btn detail-view">상세정보</button>
          <button type="button" class="mini-btn customer-chat">문의사항</button>
        </div>
        <p class="cust-sec-title">메모 <span>날짜·내용으로 검색 · 수정/삭제 가능</span></p>
        <div class="memo-tools">
          <input type="date" class="memo-search-date" value="${esc(memoFilter.date)}" aria-label="메모 날짜 검색">
          <input type="search" class="memo-search-text" value="${esc(memoFilter.text)}" placeholder="메모 내용 검색">
          <button type="button" class="fold-toggle memo-fold" hidden></button>
        </div>
        <div class="memo-book"></div>
        <div class="memo-form postit">
          <div class="memo-form-row">
            <input type="text" class="memo-title" placeholder="제목">
            <input type="number" class="memo-amount" placeholder="금액(원)" min="0">
          </div>
          <div class="memo-form-main">
            <textarea class="cust-memo" rows="2" placeholder="내용을 입력하면 날짜/시간별 기록으로 저장됩니다."></textarea>
            <div class="memo-form-side">
              <button type="button" class="mini-btn add memo-save">메모 저장</button>
              <button type="button" class="mini-btn memo-edit-cancel" hidden>수정 취소</button>
            </div>
          </div>
        </div>
        <p class="cust-sec-title">작업 내역 <span>예약 자동 연동 · 클릭하면 저장된 작업 데이터로 이동</span></p>
        <div class="cust-runs">
          ${memberRuns.length ? `
            ${custRunRowHtml(memberRuns[0])}
            ${memberRuns.length > 1 ? `
              <div class="fold-rest" data-fold-body="runs" hidden>${memberRuns.slice(1).map(custRunRowHtml).join('')}</div>
              <button type="button" class="fold-toggle" data-fold="runs" data-label="더보기 ${memberRuns.length - 1}개 ▼">더보기 ${memberRuns.length - 1}개 ▼</button>
            ` : ''}
          ` : '<p class="hint">연동된 작업이 없습니다. 예약에서 입고를 시작하면 자동으로 표시됩니다.</p>'}
        </div>
        <table class="rec-table spreadsheet">
          <thead><tr><th>날짜</th><th>서비스</th><th>내용</th><th>금액</th><th>결제수단</th><th>정산</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <form class="rec-form">
          <input type="date" class="rec-date" required>
          <input type="text" class="rec-svc" list="service-product-options" placeholder="받은 서비스" required>
          <input type="text" class="rec-note" placeholder="내용 (선택)">
          <input type="number" class="rec-amt" placeholder="금액(원)" min="0">
          <select class="rec-paytype"><option>현금</option><option>카드</option><option>계좌이체</option></select>
          <label class="rec-paid-label"><input type="checkbox" class="rec-paid"> 정산완료</label>
          <button type="submit" class="mini-btn add rec-add">추가</button>
        </form>
        <div class="cust-danger">
          <span class="cust-danger-note">블랙리스트 등록 시 해당 핸드폰번호로 재가입·로그인이 불가하며, 자료는 보안 화면에 보관됩니다.</span>
          <button type="button" class="mini-btn danger cust-block">블랙리스트</button>
          <button type="button" class="mini-btn danger cust-delete">고객삭제</button>
        </div>
      </div>
    `;

    const tbody = card.querySelector('tbody');
    (c.records || []).forEach((r, ri) => {
      const tr = document.createElement('tr');
      if (ri > 0) { tr.classList.add('fold-rest-row'); tr.hidden = true; }
      tr.innerHTML = `<td>${esc(r.date)}</td><td>${esc(r.service)}</td><td>${esc(r.note || '-')}</td><td>${r.amount ? Number(r.amount).toLocaleString() + '원' : '-'}</td><td>${esc(r.payType || '-')}</td>`;
      const tdPaid = document.createElement('td');
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pay-pill' + (r.paid ? ' paid' : '');
      pill.textContent = r.paid ? '정산' : '미정산';
      pill.addEventListener('click', () => mutateCust(m.car, cc => { cc.records[ri].paid = !cc.records[ri].paid; }));
      tdPaid.append(pill);
      const tdDel = document.createElement('td');
      tdDel.append(miniBtn('삭제', async () => { if (await pmConfirm('기록을 삭제할까요?', { title: '기록 삭제', okText: '삭제', danger: true })) mutateCust(m.car, cc => cc.records.splice(ri, 1)); }, true));
      tr.append(tdPaid, tdDel);
      tbody.append(tr);
    });
    if ((c.records || []).length > 1) {
      const recToggle = document.createElement('button');
      recToggle.type = 'button';
      recToggle.className = 'fold-toggle';
      recToggle.dataset.fold = 'rec';
      recToggle.dataset.label = `더보기 ${c.records.length - 1}개 ▼`;
      recToggle.textContent = recToggle.dataset.label;
      card.querySelector('.rec-table').after(recToggle);
    }

    /* ---------- 메모: 검색/2개 노출 + 접기펴기/수정/삭제 ---------- */
    const memoBook = card.querySelector('.memo-book');
    const memoFoldBtn = card.querySelector('.memo-fold');
    const memoForm = card.querySelector('.memo-form');
    const memoSaveBtn = card.querySelector('.memo-save');
    const memoCancelBtn = card.querySelector('.memo-edit-cancel');

    const currentEntries = () => memoEntriesFor(getCustomers()[m.car] || { memo: '', records: [] });

    const resetMemoForm = () => {
      delete memoForm.dataset.editing;
      card.querySelector('.memo-title').value = '';
      card.querySelector('.memo-amount').value = '';
      card.querySelector('.cust-memo').value = '';
      memoSaveBtn.textContent = '메모 저장';
      memoCancelBtn.hidden = true;
    };

    const startMemoEdit = id => {
      const entry = currentEntries().find(en => en.id === id);
      if (!entry) return;
      memoForm.dataset.editing = id;
      card.querySelector('.memo-title').value = entry.title || '';
      card.querySelector('.memo-amount').value = entry.amount || '';
      card.querySelector('.cust-memo').value = entry.body || '';
      memoSaveBtn.textContent = '메모 수정';
      memoCancelBtn.hidden = false;
      card.querySelector('.cust-memo').focus();
    };

    const deleteMemo = async id => {
      if (!await pmConfirm('이 메모를 삭제할까요?', { title: '메모 삭제', okText: '삭제', danger: true })) return;
      const all = getCustomers();
      const cc = all[m.car] || { memo: '', records: [] };
      cc.memoEntries = memoEntriesFor(cc).filter(en => en.id !== id);
      if (id === 'legacy-memo') cc.memo = '';
      all[m.car] = cc;
      store.set('pm-customers', all);
      paintMemoBook();
    };

    const paintMemoBook = () => {
      const f = custMemoFilters.get(m.car) || { date: '', text: '', open: false };
      const all = currentEntries();
      const entries = all.filter(entry => {
        const dateOk = !f.date || String(entry.createdAt || '').slice(0, 10) === f.date;
        const textOk = !f.text || `${entry.title || ''} ${entry.body || ''}`.toLowerCase().includes(f.text.trim().toLowerCase());
        return dateOk && textOk;
      });
      if (!entries.length) {
        memoBook.innerHTML = all.length ? '<p class="hint">검색된 메모가 없습니다.</p>' : '<p class="hint">저장된 메모가 없습니다.</p>';
        memoFoldBtn.hidden = true;
        return;
      }
      /* 최근 2개까지 노출, 나머지는 접기/펴기 */
      const rest = entries.slice(2);
      memoBook.innerHTML = `
        ${entries.slice(0, 2).map(memoEntryHtml).join('')}
        ${rest.length ? `<div class="fold-rest" ${f.open ? '' : 'hidden'}>${rest.map(memoEntryHtml).join('')}</div>` : ''}`;
      memoFoldBtn.hidden = !rest.length;
      memoFoldBtn.textContent = f.open ? '접기 ▲' : `더보기 ${rest.length}개 ▼`;
      memoBook.querySelectorAll('.memo-edit').forEach(btn => btn.addEventListener('click', () => startMemoEdit(btn.dataset.memo)));
      memoBook.querySelectorAll('.memo-del').forEach(btn => btn.addEventListener('click', () => deleteMemo(btn.dataset.memo)));
    };
    paintMemoBook();

    memoFoldBtn.addEventListener('click', () => {
      memoFilter.open = !memoFilter.open;
      paintMemoBook();
    });
    card.querySelector('.memo-search-date').addEventListener('change', e => {
      memoFilter.date = e.target.value;
      paintMemoBook();
    });
    card.querySelector('.memo-search-text').addEventListener('input', e => {
      memoFilter.text = e.target.value;
      paintMemoBook();
    });
    memoCancelBtn.addEventListener('click', resetMemoForm);
    memoSaveBtn.addEventListener('click', () => {
      const title = card.querySelector('.memo-title').value.trim();
      const amount = card.querySelector('.memo-amount').value.trim();
      const bodyText = card.querySelector('.cust-memo').value.trim();
      if (!bodyText && !title && !amount) return;
      const all = getCustomers();
      const cNext = all[m.car] || { memo: '', records: [] };
      const entries = memoEntriesFor(cNext);
      const editing = memoForm.dataset.editing;
      if (editing) {
        const target = entries.find(en => en.id === editing);
        if (target) {
          target.title = title;
          target.amount = amount;
          target.body = bodyText;
          target.updatedAt = new Date().toISOString();
          if (editing === 'legacy-memo') cNext.memo = bodyText || title;
        }
        cNext.memoEntries = entries;
      } else {
        cNext.memo = bodyText || title;
        cNext.memoUpdatedAt = new Date().toISOString();
        cNext.memoEntries = [
          { id: `memo-${Date.now()}-${Math.random().toString(36).slice(2)}`, title, amount, body: bodyText, createdAt: cNext.memoUpdatedAt },
          ...entries
        ].slice(0, 200);
      }
      all[m.car] = cNext;
      store.set('pm-customers', all);
      resetMemoForm();
      paintMemoBook();
    });

    card.querySelector('[data-phone]').addEventListener('click', e => e.stopPropagation());
    card.querySelector('.cust-summary').addEventListener('click', e => {
      const detail = card.querySelector('.cust-detail');
      const expanded = detail.hidden;
      detail.hidden = !expanded;
      e.currentTarget.setAttribute('aria-expanded', String(expanded));
      card.classList.toggle('open', expanded);
      if (expanded) openCustCards.add(m.car); else openCustCards.delete(m.car);
    });
    card.querySelectorAll('.fold-toggle[data-fold]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.fold === 'rec') {
          const rows = card.querySelectorAll('tr.fold-rest-row');
          const show = rows[0]?.hidden;
          rows.forEach(row => { row.hidden = !show; });
          btn.textContent = show ? '접기 ▲' : btn.dataset.label;
        } else {
          const foldBody = card.querySelector(`[data-fold-body="${btn.dataset.fold}"]`);
          if (!foldBody) return;
          foldBody.hidden = !foldBody.hidden;
          btn.textContent = foldBody.hidden ? btn.dataset.label : '접기 ▲';
        }
      });
    });
    card.querySelectorAll('.cust-run-row').forEach(btn => {
      btn.addEventListener('click', () => openRunAlbumModal(btn.dataset.run, { allowDelete: true, onClose: renderAdmCust }));
    });
    card.querySelector('.detail-view').addEventListener('click', () => openCustomerDetail(m));
    card.querySelector('.customer-chat').addEventListener('click', () => openCustomerCenterModal(m));
    card.querySelector('.cust-block').addEventListener('click', () => banMember(m, 'blocked'));
    card.querySelector('.cust-delete').addEventListener('click', () => banMember(m, 'deleted'));

    const form = card.querySelector('.rec-form');
    form.querySelector('.rec-date').value = new Date().toISOString().slice(0, 10);
    form.addEventListener('submit', e => {
      e.preventDefault();
      mutateCust(m.car, cc => cc.records.unshift({
        date: form.querySelector('.rec-date').value.replaceAll('-', '.'),
        service: form.querySelector('.rec-svc').value.trim(),
        note: form.querySelector('.rec-note').value.trim(),
        amount: form.querySelector('.rec-amt').value,
        payType: form.querySelector('.rec-paytype').value,
        paid: form.querySelector('.rec-paid').checked,
        createdAt: new Date().toISOString()
      }));
    });

    list.append(card);
  });
}

/* 고객 블랙리스트/삭제: 계정은 회원 목록에서 제거, 기록은 보안 화면에 보관.
   블랙리스트 등록 시 해당 핸드폰번호는 재가입·로그인 불가. 고객 자료(메모·정비내역)는 유지. */
async function banMember(m, type) {
  const label = type === 'blocked' ? '블랙리스트 등록' : '삭제';
  const msg = type === 'blocked'
    ? `${m.name || m.car || '고객'} 고객을 블랙리스트에 등록할까요?\n등록하면 해당 핸드폰번호로 재가입할 수 없고 로그인도 제한됩니다.\n자료는 보안 화면에 보관됩니다.`
    : `${m.name || m.car || '고객'} 고객을 삭제할까요?\n계정이 삭제되어 로그인할 수 없습니다.\n기록은 보안 화면에 보관됩니다.`;
  if (!await pmConfirm(msg, { title: label, okText: label, danger: true })) return;
  const { latestBooking, ...snapshot } = m;
  const banned = getBannedMembers();
  banned.unshift({
    id: `ban-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    at: new Date().toISOString(),
    member: snapshot
  });
  store.set('pm-banned-members', banned);
  store.set('pm-members', store.get('pm-members', []).filter(x => x.id !== m.id));
  openCustCards.delete(m.car);
  renderAdmCust();
  pmAlert(`${label} 처리되었습니다. 보안 화면에서 확인할 수 있습니다.`);
}

function openCustomerDetail(m) {
  const bookings = getBookings().filter(b => b.car === m.car);
  const bookingRows = bookings.length ? bookings.map(b => `
    <tr><td>${esc(b.date)} ${esc(b.time)}</td><td>${esc(b.branch)}</td><td>${esc((b.services || []).join(', ') || '-')}</td><td>${esc(b.memo || '-')}</td></tr>
  `).join('') : '<tr><td colspan="4">예약 기록이 없습니다.</td></tr>';
  openModal(`
    <h3>고객 상세정보</h3>
    <dl class="detail-list">
      <dt>아이디</dt><dd>${esc(m.id || '-')}</dd>
      <dt>이름</dt><dd>${esc(m.name || '-')}</dd>
      <dt>차량명</dt><dd>${esc(m.model || '-')}</dd>
      <dt>차량번호</dt><dd>${esc(m.car || '-')}</dd>
      <dt>핸드폰번호</dt><dd><a href="${phoneHref(m.phone)}">${esc(m.phone || '-')}</a></dd>
      <dt>이메일</dt><dd>${esc(m.email || '-')}</dd>
      <dt>주소</dt><dd>${esc(m.address || '-')}</dd>
    </dl>
    <h4 class="modal-subtitle">예약 일정</h4>
    <table class="rec-table"><thead><tr><th>일시</th><th>지점</th><th>서비스</th><th>메모</th></tr></thead><tbody>${bookingRows}</tbody></table>
    <div class="modal-actions"><button type="button" class="modal-submit" onclick="document.getElementById('modal').hidden=true">닫기</button></div>
  `, true);
}

/* ============================================================
   관리자: 상품관리 — 예약 시 선택 가능한 서비스
   ============================================================ */
function renderAdmProd() {
  const body = $('#adm-prod-body');
  if (!isMainAdmin()) { body.innerHTML = ''; return; }
  const products = getProducts();
  body.innerHTML = products.length ? '' : '<p class="hint">등록된 상품이 없습니다. 상품을 추가하면 고객 예약 화면에 표시됩니다.</p>';

  products.forEach((p, i) => {
    const card = document.createElement('article');
    card.className = 'prod-card';
    const main = document.createElement('div');
    main.className = 'prod-main';
    main.innerHTML = `<strong>${esc(p.name)}</strong>
      ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
      <p>절차: ${normalizeProductSteps(p).map(s => esc(s.name)).join(' > ')}</p>`;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(miniBtn('수정', () => openProductModal(i)),
                   miniBtn('삭제', async () => {
                     if (!await pmConfirm(`"${p.name}" 상품을 삭제할까요?`, { title: '상품 삭제', okText: '삭제', danger: true })) return;
                     const arr = getProducts(); arr.splice(i, 1); store.set('pm-products', arr); renderAdmProd();
                   }, true));
    card.append(main, actions);
    body.append(card);
  });
}

function workflowSteps(product) {
  return normalizeProductSteps(product);
}

function renderServiceRunAdmin(body) {
  const members = store.get('pm-members', []);
  const products = getProducts();
  const runs = store.get('pm-service-runs', []);
  const panel = document.createElement('section');
  panel.className = 'service-admin-panel';
  panel.innerHTML = `
    <h3>실시간 서비스</h3>
    <form id="service-run-form" class="rec-form">
      <select id="sr-member" required>${members.map(m => `<option value="${esc(m.id || m.car)}">${esc(m.name)} · ${esc(m.car)} · ${esc(m.model || '-')}</option>`).join('')}</select>
      <select id="sr-product" required>${products.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>
      <input type="text" id="sr-reason" placeholder="입고 사유">
      <button type="submit" class="mini-btn add">작업 시작</button>
    </form>
    <div id="service-run-list"></div>`;
  body.append(panel);

  const list = panel.querySelector('#service-run-list');
  list.innerHTML = runs.length ? '' : '<p class="hint">진행 중인 실시간 서비스가 없습니다.</p>';
  runs.forEach((run, i) => {
    const step = run.steps?.[run.currentStep] || run.steps?.[run.steps.length - 1];
    const card = document.createElement('article');
    card.className = 'service-run-card';
    const steps = (run.steps || []).map((s, si) => `<span class="${s.approved ? 'done' : si === run.currentStep ? 'active' : ''}">${esc(s.name)}</span>`).join('');
    card.innerHTML = `
      <div class="service-run-head">
        <strong>${esc(run.name)} · ${esc(run.car)}</strong>
        <em>${esc(run.service)} · ${esc(run.status || '진행중')}</em>
      </div>
      <p>${esc(run.reason || '')}</p>
      <div class="service-steps">${steps}</div>
      <p class="hint">현재 단계: ${esc(step?.name || '완료')}</p>
      <div class="service-run-actions">
        <button type="button" class="mini-btn upload-step">사진첨부</button>
        <button type="button" class="mini-btn approve-step">다음 단계</button>
        <button type="button" class="mini-btn danger delete-run">삭제</button>
        <input type="file" class="step-file" accept="image/*" hidden>
      </div>`;
    const file = card.querySelector('.step-file');
    card.querySelector('.upload-step').addEventListener('click', () => file.click());
    file.addEventListener('change', async e => {
      const arr = store.get('pm-service-runs', []);
      const target = arr[i];
      const current = target.steps[target.currentStep];
      current.photoKeys = [...(current.photoKeys || []), ...(await saveFiles(e.target.files, 'service', 5))];
      store.set('pm-service-runs', arr);
      renderAdmProd();
    });
    card.querySelector('.approve-step').addEventListener('click', () => {
      const arr = store.get('pm-service-runs', []);
      const target = arr[i];
      const current = target.steps[target.currentStep];
      if (current?.photoRequired && !current?.photoKeys?.length) {
        pmAlert('사진을 첨부해야 다음 단계로 이동할 수 있습니다.');
        return;
      }
      current.approved = true;
      current.approvedAt = new Date().toISOString();
      if (target.currentStep < target.steps.length - 1) target.currentStep += 1;
      else target.status = '출고 완료';
      store.set('pm-service-runs', arr);
      renderAdmProd();
    });
    card.querySelector('.delete-run').addEventListener('click', async () => {
      if (!await pmConfirm('실시간 서비스 기록을 삭제할까요?', { title: '기록 삭제', okText: '삭제', danger: true })) return;
      const arr = store.get('pm-service-runs', []);
      arr.splice(i, 1);
      store.set('pm-service-runs', arr);
      renderAdmProd();
    });
    list.append(card);
  });

  panel.querySelector('#service-run-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const memberKey = panel.querySelector('#sr-member').value;
    const product = products[Number(panel.querySelector('#sr-product').value)];
    const customer = members.find(m => (m.id || m.car) === memberKey);
    if (!customer || !product) return;
    const arr = store.get('pm-service-runs', []);
    arr.unshift({
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      memberId: customer.id || customer.car,
      car: customer.car,
      name: customer.name,
      phone: customer.phone,
      model: customer.model,
      service: product.name,
      reason: panel.querySelector('#sr-reason').value.trim(),
      steps: workflowSteps(product).map(step => ({ name: step.name, photoRequired: step.photoRequired, memoRequired: step.memoRequired, approvalRequired: step.approvalRequired, photoKeys: [], approved: false })),
      currentStep: 0,
      status: '진행중',
      createdAt: new Date().toISOString()
    });
    store.set('pm-service-runs', arr);
    renderAdmProd();
  });
}

function openProductModal(index) {
  const p = index != null ? getProducts()[index] : { name: '', desc: '', steps: defaultWorkflowSteps() };
  openModal(`
    <h3>${index != null ? '상품 수정' : '상품 추가'}</h3>
    <form id="prod-form">
      <input type="text" id="p-name" placeholder="상품명 (예: 엔진오일 교환)" required>
      <textarea id="p-desc" rows="3" placeholder="설명 (선택)"></textarea>
      <div class="workflow-editor" id="workflow-editor"></div>
      <button type="button" class="mini-btn add" id="add-step">+ 단계 추가</button>
      <p class="hint">사진은 사진 필수, 메모는 특이사항 필수, 승인은 메인관리자 승인 필수입니다.</p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>`);
  $('#p-name').value = p.name;
  $('#p-desc').value = p.desc || '';
  let steps = normalizeProductSteps(p);
  const drawSteps = () => {
    const wrap = $('#workflow-editor');
    wrap.innerHTML = '';
    steps.forEach((step, i) => {
      const row = document.createElement('div');
      row.className = 'workflow-row';
      row.innerHTML = `
        <strong>${i + 1}</strong>
        <input type="text" class="step-name" value="${esc(step.name)}" placeholder="단계명" required>
        <label><input type="checkbox" class="step-photo" ${step.photoRequired ? 'checked' : ''}> 사진</label>
        <label><input type="checkbox" class="step-memo" ${step.memoRequired ? 'checked' : ''}> 메모</label>
        <label><input type="checkbox" class="step-approval" ${step.approvalRequired ? 'checked' : ''}> 승인</label>
        <button type="button" class="mini-btn danger step-del" ${steps.length <= 1 ? 'disabled' : ''}>삭제</button>`;
      row.querySelector('.step-name').addEventListener('input', e => { steps[i].name = e.target.value; });
      row.querySelector('.step-photo').addEventListener('change', e => { steps[i].photoRequired = e.target.checked; });
      row.querySelector('.step-memo').addEventListener('change', e => { steps[i].memoRequired = e.target.checked; });
      row.querySelector('.step-approval').addEventListener('change', e => { steps[i].approvalRequired = e.target.checked; });
      row.querySelector('.step-del').addEventListener('click', () => { steps.splice(i, 1); drawSteps(); });
      wrap.append(row);
    });
    $('#add-step').disabled = steps.length >= 10;
  };
  drawSteps();
  $('#add-step').addEventListener('click', () => {
    if (steps.length >= 10) return;
    steps.push({ name: `작업${steps.length}`, photoRequired: true, memoRequired: false, approvalRequired: false });
    drawSteps();
  });
  $('#prod-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getProducts();
    const data = {
      name: $('#p-name').value.trim(),
      desc: $('#p-desc').value.trim(),
      steps: steps
        .map(s => ({ name: String(s.name || '').trim(), photoRequired: !!s.photoRequired, memoRequired: !!s.memoRequired, approvalRequired: !!s.approvalRequired }))
        .filter(s => s.name)
        .slice(0, 10)
    };
    if (!data.steps.length) data.steps = defaultWorkflowSteps();
    if (index != null) arr[index] = data; else arr.push(data);
    store.set('pm-products', arr);
    closeModal();
    renderAdmProd();
  });
}

function bookingKey(b) {
  return b.id || `${b.branch}|${b.date}|${b.time}|${b.car}`;
}

function getServiceRuns() {
  return store.get('pm-service-runs', []);
}

function runForBooking(booking) {
  const key = bookingKey(booking);
  return getServiceRuns().find(r => r.bookingKey === key);
}

function isRunCompleted(run) {
  return !!run?.completedAt || run?.status === '출고 완료' || run?.status === '완료';
}

function customerForBooking(booking) {
  const members = store.get('pm-members', []);
  return members.find(m => (booking.memberId && m.id === booking.memberId) || m.car === booking.car) || booking;
}

function selectedProductForBooking(booking) {
  const products = getProducts();
  return products.find(p => (booking.services || []).includes(p.name)) || products[0] || { name: '실시간 서비스', steps: defaultWorkflowSteps() };
}

function pushAdminNotification(message, payload = {}) {
  const list = store.get('pm-admin-notifications', []);
  list.unshift({ id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`, message, payload, read: false, createdAt: new Date().toISOString() });
  store.set('pm-admin-notifications', list.slice(0, 200));
}

/* ---------- 작업 감사 기록 (보안 화면에서 날짜·시간과 함께 열람) ---------- */
function adminActorLabel() {
  if (isMainAdmin()) return '메인관리자';
  if (isGeneralAdmin()) return adminBranch ? `${adminBranch} 관리자` : '일반관리자';
  return '시스템';
}

function logWorkAudit(action, run, stepName = '', detail = '', actor = '') {
  const list = store.get('pm-work-audit', []);
  const step = stepName ? (run?.steps || []).find(s => s.name === stepName) : null;
  list.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    by: actor || adminActorLabel(),
    action,
    car: run?.car || '',
    customer: run?.name || '',
    phone: run?.phone || '',
    model: run?.model || '',
    branch: run?.branch || '',
    service: run?.service || run?.serviceName || '',
    bookingDate: run?.bookingDate || '',
    bookingTime: run?.bookingTime || '',
    step: stepName,
    memo: step?.memo || '',
    photos: (step?.photoKeys || []).length,
    detail
  });
  store.set('pm-work-audit', list.slice(0, 500));
}

/* run의 모든 단계 사진 목록 (단계명 포함) */
function runAllPhotos(run) {
  return (run?.steps || []).flatMap((s, si) => (s.photoKeys || []).map(key => ({ key, step: s.name || `단계${si + 1}`, si })));
}

/* 앨범형 커버: 첫 장 바로 노출 + 장수, 클릭 시 전체 앨범 */
async function renderRunAlbumCover(run) {
  const photos = runAllPhotos(run);
  if (!photos.length) return '<p class="hint">등록된 사진이 없습니다.</p>';
  const src = await assetSrc(photos[0].key);
  return `
    <button type="button" class="album-cover" data-album="${esc(run.id)}">
      ${src ? `<img src="${src}" alt="작업 사진">` : '<span class="album-cover-empty">사진</span>'}
      <span class="album-cover-count">사진 ${photos.length}장 · 전체 보기</span>
    </button>`;
}

/* 사진 소프트 삭제: 목록에서 빼고 삭제 이력에 보관 (메인관리자가 승인화면에서 열람) */
function softDeleteRunPhoto(runId, stepIndex, key) {
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  const step = run?.steps?.[stepIndex];
  if (!run || !step) return false;
  const idx = (step.photoKeys || []).indexOf(key);
  if (idx === -1) return false;
  step.photoKeys.splice(idx, 1);
  step.deletedPhotos = step.deletedPhotos || [];
  step.deletedPhotos.push({ key, at: new Date().toISOString(), by: adminActorLabel() });
  store.set('pm-service-runs', arr);
  logWorkAudit('사진 삭제', run, step.name, '사진 1장 삭제 (삭제 이력 보관)');
  return true;
}

/* 전체 앨범 모달: 단계별 사진 + (권한 시) 삭제, 메인관리자는 삭제된 사진도 열람 */
async function openRunAlbumModal(runId, { allowDelete = false, onClose = null } = {}) {
  const run = getServiceRuns().find(r => r.id === runId);
  if (!run) return;
  const sections = await Promise.all((run.steps || []).map(async (step, si) => {
    const items = await Promise.all((step.photoKeys || []).map(async key => ({ key, src: await assetSrc(key) })));
    const photosHtml = items.filter(p => p.src).map(p => `
      <figure class="album-item">
        <img src="${esc(p.src)}" alt="${esc(step.name)} 사진">
        ${allowDelete ? `<button type="button" class="album-del" data-run="${esc(run.id)}" data-si="${si}" data-key="${esc(p.key)}" aria-label="사진 삭제">×</button>` : ''}
      </figure>`).join('');
    const deleted = isMainAdmin() && (step.deletedPhotos || []).length
      ? await Promise.all(step.deletedPhotos.map(async d => ({ ...d, src: await assetSrc(d.key) })))
      : [];
    const deletedHtml = deleted.filter(d => d.src).map(d => `
      <figure class="album-item deleted">
        <img src="${esc(d.src)}" alt="삭제된 사진">
        <figcaption>${esc(d.by || '-')} 삭제 · ${esc(new Date(d.at).toLocaleString('ko-KR'))}</figcaption>
      </figure>`).join('');
    if (!photosHtml && !deletedHtml) return '';
    return `
      <section class="album-step">
        <h4>${esc(step.name)} <span>${(step.photoKeys || []).length}장</span></h4>
        <div class="album-grid">${photosHtml || '<p class="hint">사진 없음</p>'}</div>
        ${deletedHtml ? `<p class="album-deleted-title">삭제된 사진 (메인관리자만 표시)</p><div class="album-grid">${deletedHtml}</div>` : ''}
      </section>`;
  }));
  openModal(`
    <h3>작업 사진</h3>
    <p class="cal-msg">${esc(run.name || '-')} · ${esc(run.car || '-')} · ${esc(run.service || '-')}</p>
    <div class="album-wrap">${sections.join('') || '<p class="hint">등록된 사진이 없습니다.</p>'}</div>
    <div class="modal-actions"><button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">닫기</button></div>
  `, true);
  modalCard.querySelectorAll('.album-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await pmConfirm('이미지를 삭제할까요?', { title: '이미지 삭제', okText: '삭제', danger: true })) return;
      if (softDeleteRunPhoto(btn.dataset.run, Number(btn.dataset.si), btn.dataset.key)) {
        await openRunAlbumModal(runId, { allowDelete, onClose });
        if (onClose) onClose();
      }
    });
  });
}

/* 단계에 저장된 사진을 모두 삭제 이력으로 이동 (자동삭제) */
function clearStepPhotos(step) {
  const count = (step.photoKeys || []).length;
  if (!count) return 0;
  step.deletedPhotos = step.deletedPhotos || [];
  step.photoKeys.forEach(key => step.deletedPhotos.push({ key, at: new Date().toISOString(), by: adminActorLabel() }));
  step.photoKeys = [];
  return count;
}

/* 단계 되돌리기: 제출 취소 또는 이전 단계로 — 해당 단계에 저장된 사진은 자동 삭제 */
async function revertServiceStep(runId) {
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  if (!run) return;
  const step = run.steps?.[run.currentStep];
  if (!step) return;
  if (step.submitted) {
    if (!await pmConfirm(`${step.name} 단계 처리를 취소할까요?\n이 단계에 저장된 사진은 삭제됩니다.`, { title: '단계 취소', okText: '단계 취소', danger: true })) return;
    const removed = clearStepPhotos(step);
    step.submitted = false;
    step.approved = false;
    run.completedAt = null;
    run.status = `${step.name} 대기`;
    logWorkAudit('단계 취소', run, step.name, removed ? `제출 취소 · 사진 ${removed}장 삭제` : '제출 취소');
  } else if (run.currentStep > 0) {
    const prev = run.steps[run.currentStep - 1];
    if (!await pmConfirm(`${prev.name} 단계로 되돌릴까요?\n${prev.name} 단계에 저장된 사진은 삭제됩니다.`, { title: '단계 되돌리기', okText: '되돌리기', danger: true })) return;
    run.currentStep -= 1;
    const removed = clearStepPhotos(prev);
    prev.submitted = false;
    prev.approved = false;
    run.completedAt = null;
    run.status = `${prev.name} 대기`;
    logWorkAudit('단계 되돌리기', run, prev.name, removed ? `${prev.name} 단계로 복귀 · 사진 ${removed}장 삭제` : `${prev.name} 단계로 복귀`);
  } else {
    pmAlert('되돌릴 단계가 없습니다.');
    return;
  }
  store.set('pm-service-runs', arr);
  renderAdmWork();
  if (isMainAdmin()) renderAdmApproval();
}

function pushCustomerMessage(customer, message, payload = {}) {
  const all = store.get('pm-messages', []);
  all.push({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    memberId: customer.id || customer.memberId || customer.car || '',
    car: customer.car || '',
    from: 'admin',
    message,
    serviceContext: payload,
    customer,
    createdAt: new Date().toISOString()
  });
  store.set('pm-messages', all);
}

function createRunFromBooking(booking) {
  const product = selectedProductForBooking(booking);
  const customer = customerForBooking(booking);
  const runs = getServiceRuns();
  const existing = runForBooking(booking);
  if (existing) return existing;
  const run = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    bookingKey: bookingKey(booking),
    bookingDate: booking.date,
    bookingTime: booking.time,
    branch: booking.branch,
    memberId: customer.id || booking.memberId || booking.car,
    car: booking.car,
    name: booking.name,
    phone: booking.phone,
    model: booking.model,
    service: product.name,
    reason: booking.memo || '',
    steps: workflowSteps(product).map(step => ({
      name: step.name,
      photoRequired: step.photoRequired,
      memoRequired: step.memoRequired,
      approvalRequired: step.approvalRequired,
      photoKeys: [],
      memo: '',
      submitted: false,
      submittedAt: '',
      approved: false,
      approvedAt: ''
    })),
    currentStep: 0,
    status: '입고 대기',
    createdAt: new Date().toISOString()
  };
  runs.unshift(run);
  store.set('pm-service-runs', runs);
  return run;
}

function stepStateLabel(run) {
  const step = run.steps?.[run.currentStep];
  if (!step) return run.status || '완료';
  if (step.submitted && !step.approved) return `${step.name} 승인대기`;
  return `${step.name} 대기`;
}

async function renderStepPhotos(step) {
  const keys = step?.photoKeys || [];
  const urls = await Promise.all(keys.map(k => assetSrc(k)));
  return urls.filter(Boolean).map(url => `<img src="${url}" alt="${esc(step.name)} 사진">`).join('');
}

async function renderStepPhotoAlbum(keys, stepName) {
  const photoKeys = [...(keys || [])].slice(0, 10);
  const urls = await Promise.all(photoKeys.map(k => assetSrc(k)));
  const slots = [`
    <button type="button" class="step-photo-slot camera" data-camera aria-label="카메라로 촬영">
      <span class="camera-mark" aria-hidden="true"></span>
      <strong>카메라</strong>
    </button>
  `];
  for (let i = 0; i < 9; i++) {
    const key = photoKeys[i];
    const url = urls[i];
    if (key && url) {
      slots.push(`
        <div class="step-photo-slot filled">
          <img src="${url}" alt="${esc(stepName)} 사진 ${i + 1}">
          <button type="button" class="step-photo-remove" data-remove="${i}" aria-label="사진 삭제">×</button>
        </div>
      `);
    } else {
      slots.push(`
        <button type="button" class="step-photo-slot empty" data-gallery aria-label="사진첩에서 선택">
          <span>+</span>
          <strong>사진첩</strong>
        </button>
      `);
    }
  }
  return slots.join('');
}

function renderAdmWork() {
  const body = $('#adm-work-body');
  if (!isAdmin) { body.innerHTML = ''; return; }
  const today = todayKey();
  const allowedBranches = currentAdminBranches().map(b => b.name);
  if (!allowedBranches.length) {
    body.innerHTML = '<p class="hint">담당 지점이 없습니다. 메인관리자에게 지점 권한을 확인해주세요.</p>';
    return;
  }
  const todayBookings = getBookings()
    .filter(b => isMainAdmin() || allowedBranches.includes(b.branch))
    .filter(b => b.date === today)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const todayKeys = new Set(todayBookings.map(bookingKey));
  const carriedRuns = getServiceRuns()
    .filter(run => isMainAdmin() || allowedBranches.includes(run.branch))
    .filter(run => !isRunCompleted(run))
    .filter(run => run.bookingDate !== today || !todayKeys.has(run.bookingKey))
    .sort((a, b) => `${a.bookingDate || ''} ${a.bookingTime || ''}`.localeCompare(`${b.bookingDate || ''} ${b.bookingTime || ''}`));
  const workItems = [
    ...todayBookings.map(booking => ({ booking, run: runForBooking(booking), carried: false })),
    ...carriedRuns.map(run => ({ booking: null, run, carried: true }))
  ];
  body.innerHTML = `
    <div class="work-head">
      <strong>${today} 오늘 예약 · 미출고 작업</strong>
      <span>${workItems.length}건</span>
    </div>
    <div id="work-list"></div>`;
  const list = $('#work-list');
  if (!workItems.length) {
    list.innerHTML = '<p class="hint">오늘 예약 또는 미출고 작업이 없습니다.</p>';
    return;
  }
  workItems.forEach(({ booking, run, carried }) => {
    const source = booking || run;
    const dateLabel = booking ? booking.date : run.bookingDate;
    const timeLabel = booking ? booking.time : run.bookingTime;
    const card = document.createElement('article');
    card.className = 'work-card collapsible';
    card.innerHTML = `
      <div class="work-card-head">
        <strong>${carried ? '미출고 · ' : ''}${esc(dateLabel || today)} ${esc(timeLabel || '')} · ${esc(source.name || '-')} · ${esc(source.car || '-')}</strong>
        <a href="${phoneHref(source.phone)}">${esc(source.phone || '-')}</a>
      </div>
      <p>${esc(source.branch || '-')} · ${esc(source.model || '-')} · ${esc(booking ? ((booking.services || []).join(', ') || '서비스 미선택') : (run.service || '서비스 미선택'))}</p>
      <p class="hint">${run ? esc(stepStateLabel(run)) : '작업 시작 전'}</p>
      <div class="work-card-detail" hidden>
        ${run ? `<div class="service-steps">${run.steps.map((s, i) => `<span class="${s.approved ? 'done' : i === run.currentStep ? 'active' : ''}">${esc(s.name)}</span>`).join('')}</div>` : ''}
        ${run ? '<div class="album-cover-wrap" data-cover></div>' : ''}
        <div class="service-run-actions"></div>
      </div>`;
    const actions = card.querySelector('.service-run-actions');
    if (!run) {
      actions.append(miniBtn('입고 시작', () => {
        const created = createRunFromBooking(booking);
        logWorkAudit('입고 시작', created, created.steps?.[0]?.name || '', '예약에서 작업 생성');
        renderAdmWork();
      }));
    } else {
      actions.append(miniBtn('현재 단계 처리', () => openStepSubmitModal(run.id)));
      actions.append(miniBtn('단계 취소', () => revertServiceStep(run.id), true));
      renderRunAlbumCover(run).then(html => {
        const cover = card.querySelector('[data-cover]');
        if (cover) cover.innerHTML = html;
        cover?.querySelector('.album-cover')?.addEventListener('click', () => {
          openRunAlbumModal(run.id, { allowDelete: true, onClose: renderAdmWork });
        });
      });
    }
    /* 카드 클릭 = 펼침, 다시 클릭 = 상태 줄까지만 표시 */
    card.addEventListener('click', e => {
      if (e.target.closest('button, a')) return;
      card.classList.toggle('open');
      card.querySelector('.work-card-detail').hidden = !card.classList.contains('open');
    });
    list.append(card);
  });
}

async function openStepSubmitModal(runId) {
  const run = getServiceRuns().find(r => r.id === runId);
  const step = run?.steps?.[run.currentStep];
  if (!run || !step) return;
  let pendingPhotoKeys = [...(step.photoKeys || [])].slice(0, 10);
  const album = await renderStepPhotoAlbum(pendingPhotoKeys, step.name);
  openModal(`
    <h3>${esc(step.name)} 처리</h3>
    <p class="cal-msg">${esc(run.bookingDate)} ${esc(run.bookingTime)} · ${esc(run.name)} · ${esc(run.car)} · ${esc(run.service)}</p>
    <form id="step-form">
      <div class="step-photo-uploader">
        <div class="step-photo-album" id="step-photo-album">${album}</div>
        <div class="step-photo-actions">
          <button type="button" class="mini-btn" id="step-gallery-btn">사진첩에서 선택</button>
          <span class="hint" id="step-photo-count">${pendingPhotoKeys.length}/10장</span>
        </div>
      </div>
      <input type="file" id="step-camera-file" accept="image/*" capture="environment" hidden>
      <input type="file" id="step-gallery-file" accept="image/*" multiple hidden>
      <textarea id="step-memo" rows="4" placeholder="특이사항${step.memoRequired ? ' (필수)' : ' (선택)'}">${esc(step.memo || '')}</textarea>
      <p class="hint">사진필수: ${step.photoRequired ? '예' : '아니오'} · 메모필수: ${step.memoRequired ? '예' : '아니오'}</p>
      <p class="form-error" id="step-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">다음단계</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true);
  const drawAlbum = async () => {
    $('#step-photo-album').innerHTML = await renderStepPhotoAlbum(pendingPhotoKeys, step.name);
    $('#step-photo-count').textContent = `${pendingPhotoKeys.length}/10장`;
  };
  const addStepPhotos = async files => {
    const remaining = 10 - pendingPhotoKeys.length;
    if (remaining <= 0) {
      $('#step-error').textContent = '사진은 최대 10장까지 등록할 수 있습니다.';
      return;
    }
    const selected = [...files].filter(file => /^image\//.test(file.type || ''));
    if (!selected.length) return;
    const keys = await saveFiles(selected, 'service', remaining);
    pendingPhotoKeys = [...pendingPhotoKeys, ...keys].slice(0, 10);
    $('#step-error').textContent = '';
    await drawAlbum();
  };
  $('#step-photo-album').addEventListener('click', async e => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      pendingPhotoKeys.splice(Number(removeBtn.dataset.remove), 1);
      await drawAlbum();
      return;
    }
    if (e.target.closest('[data-camera]')) {
      $('#step-camera-file').click();
      return;
    }
    if (e.target.closest('[data-gallery]')) $('#step-gallery-file').click();
  });
  $('#step-gallery-btn').addEventListener('click', () => $('#step-gallery-file').click());
  $('#step-camera-file').addEventListener('change', async e => {
    await addStepPhotos(e.target.files);
    e.target.value = '';
  });
  $('#step-gallery-file').addEventListener('change', async e => {
    await addStepPhotos(e.target.files);
    e.target.value = '';
  });
  $('#step-form').addEventListener('submit', async e => {
    e.preventDefault();
    const arr = getServiceRuns();
    const target = arr.find(r => r.id === runId);
    const current = target?.steps?.[target.currentStep];
    if (!target || !current) return;
    if (current.photoRequired && !pendingPhotoKeys.length) {
      $('#step-error').textContent = '이 단계는 사진 첨부가 필수입니다.';
      return;
    }
    const memo = $('#step-memo').value.trim();
    if (current.memoRequired && !memo) {
      $('#step-error').textContent = '이 단계는 특이사항 입력이 필수입니다.';
      return;
    }
    /* 업로드했다가 뺀 사진은 삭제 이력으로 보관 (메인관리자 열람용) */
    const removed = (current.photoKeys || []).filter(k => !pendingPhotoKeys.includes(k));
    if (removed.length) {
      current.deletedPhotos = current.deletedPhotos || [];
      removed.forEach(key => current.deletedPhotos.push({ key, at: new Date().toISOString(), by: adminActorLabel() }));
    }
    current.photoKeys = [...pendingPhotoKeys].slice(0, 10);
    current.memo = memo;
    current.submitted = true;
    current.submittedAt = new Date().toISOString();
    logWorkAudit('단계 처리', target, current.name, `사진 ${current.photoKeys.length}장${removed.length ? ` · 삭제 ${removed.length}장` : ''}${memo ? ' · 메모 있음' : ''}`);
    if (current.approvalRequired) {
      target.status = `${current.name} 승인대기`;
      pushAdminNotification(`${target.name} ${target.car} ${target.service} ${current.name} 승인 요청`, { runId, step: current.name });
    } else {
      current.approved = true;
      current.approvedAt = new Date().toISOString();
      if (target.currentStep < target.steps.length - 1) {
        target.currentStep += 1;
        target.status = `${target.steps[target.currentStep].name} 대기`;
      } else {
        target.status = '출고 완료';
        target.completedAt = new Date().toISOString();
      }
      logWorkAudit('자동 승인', target, current.name, '승인 불필요 단계 - 고객에게 전송됨');
      pushCustomerMessage(target, `${target.service} ${current.name} 처리되었습니다. 사진 확인 가능합니다.`, { runId, approvedStep: current.name });
    }
    store.set('pm-service-runs', arr);
    closeModal();
    renderAdmWork();
    if (isMainAdmin()) renderAdmApproval();
  });
}

function renderAdmApproval() {
  const body = $('#adm-approval-body');
  if (!isMainAdmin()) { body.innerHTML = ''; return; }
  /* 승인 필요 여부와 관계없이 제출된 단계가 있는 모든 작업 노출 */
  const runs = getServiceRuns()
    .filter(r => (r.steps || []).some(s => s.submitted || (s.deletedPhotos || []).length))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 30);
  body.innerHTML = runs.length ? '<div id="approval-list"></div>' : '<p class="hint">제출된 작업이 없습니다.</p>';
  const list = $('#approval-list');
  runs.forEach(run => {
    const pendingStep = run.steps?.[run.currentStep];
    const isPending = pendingStep?.submitted && !pendingStep?.approved;
    const statusChip = isRunCompleted(run) ? '출고완료' : isPending ? `${pendingStep.name} 승인대기` : '진행중';
    const card = document.createElement('article');
    card.className = 'work-card collapsible';
    card.innerHTML = `
      <div class="work-card-head">
        <strong>${esc(run.name || '-')} · ${esc(run.car || '-')} · ${esc(run.service || '-')}</strong>
        <a href="${phoneHref(run.phone)}">${esc(run.phone || '-')}</a>
      </div>
      <p>${esc(run.branch || '-')} · ${esc(run.bookingDate || '-')} ${esc(run.bookingTime || '')}</p>
      <p class="hint">${esc(statusChip)}</p>
      <div class="work-card-detail" hidden>
        <div class="album-cover-wrap" data-cover></div>
        <div class="approval-steps" data-steps></div>
      </div>`;
    renderRunAlbumCover(run).then(html => {
      const cover = card.querySelector('[data-cover]');
      if (cover) cover.innerHTML = html;
      cover?.querySelector('.album-cover')?.addEventListener('click', () => {
        openRunAlbumModal(run.id, { allowDelete: true, onClose: renderAdmApproval });
      });
    });
    const stepsWrap = card.querySelector('[data-steps]');
    (run.steps || []).forEach((step, si) => {
      if (!step.submitted && !(step.deletedPhotos || []).length) return;
      const row = document.createElement('div');
      row.className = 'approval-step-row';
      const state = step.approved
        ? (step.approvalRequired ? '승인됨' : '자동승인')
        : step.submitted ? '승인대기' : '제출취소됨';
      row.innerHTML = `
        <div class="approval-step-info">
          <strong>${esc(step.name)}</strong>
          <em class="state-${step.approved ? 'done' : step.submitted ? 'pending' : 'off'}">${state}</em>
          <span>${step.submittedAt ? esc(new Date(step.submittedAt).toLocaleString('ko-KR')) : '-'} · 사진 ${(step.photoKeys || []).length}장${(step.deletedPhotos || []).length ? ` · 삭제 ${(step.deletedPhotos || []).length}장` : ''}</span>
          ${step.memo ? `<p>${esc(step.memo)}</p>` : ''}
        </div>
        <div class="service-run-actions"></div>`;
      const actions = row.querySelector('.service-run-actions');
      if (step.submitted) {
        actions.append(miniBtn('수정', () => openStepEditModal(run.id, si)));
        actions.append(miniBtn('고객전송', () => sendStepToCustomer(run.id, si)));
        actions.append(miniBtn('삭제', () => deleteStepSubmission(run.id, si), true));
        if (!step.approved && si === run.currentStep) actions.append(miniBtn('반려', () => rejectServiceStep(run.id), true));
      }
      stepsWrap.append(row);
    });
    /* 카드 클릭 = 펼침, 다시 클릭 = 상태 줄까지만 표시 */
    card.addEventListener('click', e => {
      if (e.target.closest('button, a')) return;
      card.classList.toggle('open');
      card.querySelector('.work-card-detail').hidden = !card.classList.contains('open');
    });
    list.append(card);
  });
}

/* 승인화면: 제출 삭제 — 사진은 삭제 이력으로 보관, 해당 단계부터 다시 진행 */
async function deleteStepSubmission(runId, stepIndex) {
  if (!await pmConfirm('이 단계 제출을 삭제할까요?\n사진은 삭제 이력으로 보관됩니다.', { title: '제출 삭제', okText: '삭제', danger: true })) return;
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  const step = run?.steps?.[stepIndex];
  if (!run || !step) return;
  step.deletedPhotos = step.deletedPhotos || [];
  (step.photoKeys || []).forEach(key => step.deletedPhotos.push({ key, at: new Date().toISOString(), by: adminActorLabel() }));
  step.photoKeys = [];
  step.submitted = false;
  step.approved = false;
  run.currentStep = Math.min(run.currentStep, stepIndex);
  run.completedAt = null;
  run.status = `${step.name} 대기`;
  store.set('pm-service-runs', arr);
  logWorkAudit('제출 삭제', run, step.name, '메인관리자가 제출을 삭제 (사진 이력 보관)');
  renderAdmApproval();
  renderAdmWork();
}

/* 승인화면: 고객전송 — 미승인이면 승인 처리, 승인된 단계면 사진 안내 재전송 */
function sendStepToCustomer(runId, stepIndex) {
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  const step = run?.steps?.[stepIndex];
  if (!run || !step) return;
  if (!step.approved && stepIndex === run.currentStep) {
    approveServiceStep(runId);
    return;
  }
  pushCustomerMessage(run, `${run.service} ${step.name} 사진이 업데이트되었습니다. 확인해보세요.`, { runId, approvedStep: step.name });
  logWorkAudit('고객 전송', run, step.name, '사진 안내 메시지 재전송');
  store.set('pm-service-runs', arr);
  pmAlert('고객에게 전송했습니다.');
}

/* 승인화면: 수정 — 승인 여부와 관계없이 사진·메모 수정 */
async function openStepEditModal(runId, stepIndex) {
  const run = getServiceRuns().find(r => r.id === runId);
  const step = run?.steps?.[stepIndex];
  if (!run || !step) return;
  let pendingPhotoKeys = [...(step.photoKeys || [])].slice(0, 10);
  const album = await renderStepPhotoAlbum(pendingPhotoKeys, step.name);
  openModal(`
    <h3>${esc(step.name)} 수정</h3>
    <p class="cal-msg">${esc(run.name || '-')} · ${esc(run.car || '-')} · ${esc(run.service || '-')}</p>
    <form id="step-edit-form">
      <div class="step-photo-uploader">
        <div class="step-photo-album" id="edit-photo-album">${album}</div>
        <div class="step-photo-actions">
          <button type="button" class="mini-btn" id="edit-gallery-btn">사진첩에서 선택</button>
          <span class="hint" id="edit-photo-count">${pendingPhotoKeys.length}/10장</span>
        </div>
      </div>
      <input type="file" id="edit-camera-file" accept="image/*" capture="environment" hidden>
      <input type="file" id="edit-gallery-file" accept="image/*" multiple hidden>
      <textarea id="edit-memo" rows="4" placeholder="특이사항">${esc(step.memo || '')}</textarea>
      <p class="form-error" id="edit-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true);
  const drawAlbum = async () => {
    $('#edit-photo-album').innerHTML = await renderStepPhotoAlbum(pendingPhotoKeys, step.name);
    $('#edit-photo-count').textContent = `${pendingPhotoKeys.length}/10장`;
  };
  const addPhotos = async files => {
    const remaining = 10 - pendingPhotoKeys.length;
    if (remaining <= 0) { $('#edit-error').textContent = '사진은 최대 10장까지 등록할 수 있습니다.'; return; }
    const selected = [...files].filter(file => /^image\//.test(file.type || ''));
    if (!selected.length) return;
    const keys = await saveFiles(selected, 'service', remaining);
    pendingPhotoKeys = [...pendingPhotoKeys, ...keys].slice(0, 10);
    $('#edit-error').textContent = '';
    await drawAlbum();
  };
  $('#edit-photo-album').addEventListener('click', async e => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) { pendingPhotoKeys.splice(Number(removeBtn.dataset.remove), 1); await drawAlbum(); return; }
    if (e.target.closest('[data-camera]')) { $('#edit-camera-file').click(); return; }
    if (e.target.closest('[data-gallery]')) $('#edit-gallery-file').click();
  });
  $('#edit-gallery-btn').addEventListener('click', () => $('#edit-gallery-file').click());
  $('#edit-camera-file').addEventListener('change', async e => { await addPhotos(e.target.files); e.target.value = ''; });
  $('#edit-gallery-file').addEventListener('change', async e => { await addPhotos(e.target.files); e.target.value = ''; });
  $('#step-edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getServiceRuns();
    const target = arr.find(r => r.id === runId);
    const cur = target?.steps?.[stepIndex];
    if (!target || !cur) return;
    const removed = (cur.photoKeys || []).filter(k => !pendingPhotoKeys.includes(k));
    if (removed.length) {
      cur.deletedPhotos = cur.deletedPhotos || [];
      removed.forEach(key => cur.deletedPhotos.push({ key, at: new Date().toISOString(), by: adminActorLabel() }));
    }
    cur.photoKeys = [...pendingPhotoKeys].slice(0, 10);
    cur.memo = $('#edit-memo').value.trim();
    store.set('pm-service-runs', arr);
    logWorkAudit('제출 수정', target, cur.name, `사진 ${cur.photoKeys.length}장${removed.length ? ` · 삭제 ${removed.length}장` : ''}`);
    closeModal();
    renderAdmApproval();
    renderAdmWork();
  });
}

function approveServiceStep(runId) {
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  const step = run?.steps?.[run.currentStep];
  if (!run || !step) return;
  step.approved = true;
  step.approvedAt = new Date().toISOString();
  const isLast = run.currentStep >= run.steps.length - 1;
  const customerMsg = isLast
    ? `${run.service} 출고가 완료되었습니다. 사진 확인 가능합니다.`
    : `${run.service} ${run.steps[run.currentStep + 1].name}가 시작되었어요. 사진 확인 가능합니다.`;
  if (isLast) {
    run.status = '출고 완료';
    run.completedAt = new Date().toISOString();
  } else {
    run.currentStep += 1;
    run.status = `${run.steps[run.currentStep].name} 대기`;
  }
  pushCustomerMessage(run, customerMsg, { runId, approvedStep: step.name });
  logWorkAudit('승인 · 고객 전송', run, step.name, isLast ? '출고 완료 처리' : '다음 단계로 진행');
  store.set('pm-service-runs', arr);
  renderAdmApproval();
  renderAdmWork();
}

async function rejectServiceStep(runId) {
  const answer = await pmPrompt('반려 사유를 입력하세요.', { title: '반려', placeholder: '반려 사유 (선택)' });
  if (answer === null) return;
  const reason = answer.trim();
  const arr = getServiceRuns();
  const run = arr.find(r => r.id === runId);
  const step = run?.steps?.[run.currentStep];
  if (!run || !step) return;
  step.submitted = false;
  step.rejectedAt = new Date().toISOString();
  step.rejectReason = reason;
  run.status = `${step.name} 재작업`;
  pushAdminNotification(`${run.name} ${run.car} ${step.name} 반려: ${reason || '사유 없음'}`, { runId, step: step.name });
  logWorkAudit('반려', run, step.name, reason || '사유 없음');
  store.set('pm-service-runs', arr);
  renderAdmApproval();
  renderAdmWork();
}

function renderAdmSettings() {
  const body = $('#adm-settings-body');
  if (!isMainAdmin()) { body.innerHTML = ''; return; }
  const securityWindowActive = Date.now() < Number(sessionStorage.getItem('pm-security-until') || 0);
  if (!securityUnlocked && !securityWindowActive) {
    body.innerHTML = `
      <section class="settings-card security-gate-card">
        <h3>보안 비밀번호</h3>
        <form id="security-gate-inline" class="settings-form">
          <input type="password" id="security-pw-check" placeholder="보안 비밀번호" required>
          <button type="submit" class="mini-btn add">확인</button>
        </form>
        <label class="check-line"><input type="checkbox" id="security-1h"> 1시간 동안 비밀번호 입력 해제</label>
        <p class="field-help">체크하지 않으면 보안 화면에 들어올 때마다 비밀번호를 입력합니다.</p>
        <p class="form-error" id="security-error"></p>
      </section>`;
    $('#security-gate-inline').addEventListener('submit', e => {
      e.preventDefault();
      const current = getSecuritySettings().password || 'tmdgus123';
      if ($('#security-pw-check').value !== current) {
        $('#security-error').textContent = '보안 비밀번호가 맞지 않습니다.';
        return;
      }
      securityUnlocked = true;
      if ($('#security-1h').checked) sessionStorage.setItem('pm-security-until', String(Date.now() + 3600000));
      else sessionStorage.removeItem('pm-security-until');
      renderAdmSettings();
    });
    return;
  }
  const sub = getSubAdmin();
  const main = getMainAdmin();
  const branches = getBranches();
  const subRows = sub.accounts.length
    ? sub.accounts.map((account, i) => `
      <li>
        <span>${i + 1}</span>
        <strong>${esc(account.password)}</strong>
        <em>${account.branch ? esc(account.branch) : '전체 지점'}</em>
        <time>${account.createdAt ? esc(new Date(account.createdAt).toLocaleString('ko-KR')) : '생성일 없음'}</time>
        <button type="button" class="mini-btn danger sub-admin-delete" data-sub-admin="${esc(account.id)}">삭제</button>
      </li>`).join('')
    : '<li class="empty">생성된 일반관리자가 없습니다.</li>';
  body.innerHTML = `
    <section class="settings-card">
      <h3>일반 관리자 비밀번호 생성</h3>
      <form id="sub-admin-form" class="settings-form">
        <input type="text" id="sub-admin-password" placeholder="일반 관리자 비밀번호">
        <select id="sub-admin-branch">
          <option value="">전체 지점</option>
          ${branches.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('')}
        </select>
        <button type="button" class="mini-btn" id="make-sub-pw">자동생성</button>
        <button type="submit" class="mini-btn add">생성</button>
      </form>
      <p class="field-help">지점별 점주 계정은 담당 지점 예약관리와 작업현황만 볼 수 있습니다. 전체 지점은 보조 관리자용입니다.</p>
      <div class="sub-admin-summary">
        <strong>생성된 일반관리자 ${sub.accounts.length}개</strong>
        <ul class="sub-admin-list">${subRows}</ul>
      </div>
    </section>
    <section class="settings-card">
      <h3>메인관리자 비밀번호 변경</h3>
      <form id="main-admin-form" class="settings-form">
        <input type="password" id="main-admin-password" placeholder="새 메인관리자 비밀번호" value="${esc(main.password || '')}">
        <button type="submit" class="mini-btn add">변경</button>
      </form>
    </section>
    <section class="settings-card">
      <h3>이벤트 배너 관리</h3>
      <p class="field-help">마이·설정 화면의 이벤트 배너입니다. 첫 장은 프로모터스 앱 설치 안내로 고정되고, 이미지는 최대 4장까지 추가할 수 있습니다. 좌우로 밀어 넘겨볼 수 있습니다.</p>
      <div class="event-admin-grid" id="event-banner-list"><p class="hint">불러오는 중...</p></div>
      <div class="settings-actions">
        <button type="button" class="mini-btn add" id="event-banner-add">+ 배너 이미지 추가</button>
        <input type="file" id="event-banner-file" accept="image/*" multiple hidden>
      </div>
    </section>
    <section class="settings-card">
      <h3>블랙리스트</h3>
      <p class="field-help">블랙리스트에 등록된 회원은 해당 핸드폰번호로 재가입할 수 없고 로그인도 제한됩니다. 고객 자료(메모·정비내역)는 그대로 보관됩니다.</p>
      <ul class="banned-list">${(() => {
        const banned = getBannedMembers();
        if (!banned.length) return '<li class="empty">블랙리스트에 등록된 회원이 없습니다.</li>';
        return banned.map(b => `
          <li>
            <em class="ban-chip ${b.type === 'blocked' ? 'blocked' : 'deleted'}">${b.type === 'blocked' ? '블랙리스트' : '삭제'}</em>
            <strong>${esc(b.member?.name || '-')}</strong>
            <span>${esc(b.member?.car || '-')} · ${esc(b.member?.phone || '-')} · 아이디 ${esc(b.member?.id || '-')}</span>
            <time>${esc(new Date(b.at).toLocaleString('ko-KR'))}</time>
            <span class="ban-actions">
              <button type="button" class="mini-btn ban-restore" data-ban="${esc(b.id)}">${b.type === 'blocked' ? '해제' : '계정복구'}</button>
              <button type="button" class="mini-btn danger ban-remove" data-ban="${esc(b.id)}">기록삭제</button>
            </span>
          </li>`).join('');
      })()}</ul>
    </section>
    <section class="settings-card">
      <h3>작업 기록</h3>
      <p class="field-help">모든 작업 데이터(예약·입고·단계 처리·사진 삭제·승인·반려·수정)가 고객·차량 정보, 작업 메모, 사진 수, 날짜·시간과 함께 저장됩니다. 최근 100건 표시.</p>
      <ul class="audit-list">${(() => {
        const audit = store.get('pm-work-audit', []).slice(0, 100);
        if (!audit.length) return '<li class="empty">작업 기록이 없습니다.</li>';
        return audit.map(a => `
          <li>
            <time>${esc(new Date(a.at).toLocaleString('ko-KR'))}</time>
            <strong>${esc(a.action)}</strong>
            <span>${esc(a.by || '-')} · ${esc(a.customer || '-')} ${esc(a.car || '')}${a.model ? ` · ${esc(a.model)}` : ''}${a.phone ? ` · ${esc(a.phone)}` : ''}</span>
            <span>${esc(a.branch || '-')}${a.bookingDate ? ` · ${esc(a.bookingDate)} ${esc(a.bookingTime || '')}` : ''} · ${esc(a.service || '-')}${a.step ? ` · ${esc(a.step)}` : ''}${a.photos ? ` · 사진 ${a.photos}장` : ''}</span>
            ${a.memo ? `<em>작업메모: ${esc(a.memo)}</em>` : ''}
            ${a.detail ? `<em>${esc(a.detail)}</em>` : ''}
          </li>`).join('');
      })()}</ul>
    </section>
    <p class="form-error" id="security-save-msg"></p>`;
  wireEventBannerAdmin();
  $('#make-sub-pw').addEventListener('click', () => {
    $('#sub-admin-password').value = `pro${Math.random().toString(36).slice(2, 8)}!`;
  });
  $('#sub-admin-form').addEventListener('submit', e => {
    e.preventDefault();
    const password = $('#sub-admin-password').value.trim();
    if (!password) return;
    const current = getSubAdmin();
    if (current.accounts.some(account => account.password === password)) {
      $('#security-save-msg').textContent = '이미 생성된 일반 관리자 비밀번호입니다.';
      return;
    }
    current.accounts.push({
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      password,
      branch: $('#sub-admin-branch').value,
      createdAt: new Date().toISOString()
    });
    store.set('pm-sub-admin', { password: current.accounts[0]?.password || '', accounts: current.accounts });
    $('#security-save-msg').textContent = '일반 관리자 비밀번호가 생성되었습니다.';
    renderAdmSettings();
  });
  $$('.sub-admin-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = getSubAdmin();
      const accounts = current.accounts.filter(account => account.id !== btn.dataset.subAdmin);
      store.set('pm-sub-admin', { password: accounts[0]?.password || '', accounts });
      renderAdmSettings();
    });
  });
  $('#main-admin-form').addEventListener('submit', e => {
    e.preventDefault();
    const next = $('#main-admin-password').value.trim();
    if (!next) return;
    store.set('pm-main-admin', { password: next });
    $('#security-save-msg').textContent = '메인관리자 비밀번호가 변경되었습니다.';
  });
  $$('.ban-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      const banned = getBannedMembers();
      const entry = banned.find(b => b.id === btn.dataset.ban);
      if (!entry) return;
      const label = entry.type === 'blocked' ? '블랙리스트를 해제' : '계정을 복구';
      if (!await pmConfirm(`${entry.member?.name || entry.member?.car || '회원'}님의 ${label}할까요?\n다시 로그인과 가입이 가능해집니다.`, { title: '블랙리스트', okText: '확인' })) return;
      const members = store.get('pm-members', []);
      if (entry.member?.id && members.some(x => x.id === entry.member.id)) {
        pmAlert('같은 아이디로 가입된 회원이 이미 있어 복구할 수 없습니다. 기록삭제로 블랙리스트만 해제할 수 있습니다.');
        return;
      }
      if (entry.member) {
        members.push(entry.member);
        store.set('pm-members', members);
      }
      store.set('pm-banned-members', banned.filter(b => b.id !== entry.id));
      renderAdmSettings();
      renderAdmCust();
    });
  });
  $$('.ban-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await pmConfirm('이 기록을 삭제할까요?\n블랙리스트 상태였다면 해당 번호로 다시 가입할 수 있게 됩니다.', { title: '기록 삭제', okText: '삭제', danger: true })) return;
      store.set('pm-banned-members', getBannedMembers().filter(b => b.id !== btn.dataset.ban));
      renderAdmSettings();
    });
  });
}

/* ---------- 이벤트 배너 관리 (보안 화면, 메인관리자) ---------- */
const getEventBanners = () => store.get('pm-event-banners', []);

async function wireEventBannerAdmin() {
  const list = $('#event-banner-list');
  if (!list) return;
  const banners = getEventBanners().slice(0, 4);
  const items = await Promise.all(banners.map(async b => ({ ...b, src: await assetSrc(b.key) })));
  list.innerHTML = `
    <figure class="event-admin-item fixed">
      <img src="images/logo-icon.png" alt="앱 설치 안내 (고정)">
      <figcaption>앱 설치 안내 (고정)</figcaption>
    </figure>
    ${items.map(item => `
      <figure class="event-admin-item">
        ${item.src ? `<img src="${esc(item.src)}" alt="이벤트 배너">` : '<span class="hint">이미지 없음</span>'}
        <button type="button" class="album-del" data-banner="${esc(item.key)}" aria-label="배너 삭제">×</button>
      </figure>`).join('')}`;
  list.querySelectorAll('[data-banner]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await pmConfirm('이미지를 삭제할까요?', { title: '배너 삭제', okText: '삭제', danger: true })) return;
      store.set('pm-event-banners', getEventBanners().filter(b => b.key !== btn.dataset.banner));
      wireEventBannerAdmin();
    });
  });
  const addBtn = $('#event-banner-add');
  const fileInput = $('#event-banner-file');
  if (addBtn && fileInput && !addBtn.dataset.wired) {
    addBtn.dataset.wired = '1';
    addBtn.addEventListener('click', () => {
      if (getEventBanners().length >= 4) { pmAlert('배너 이미지는 최대 4장까지 등록할 수 있습니다.'); return; }
      fileInput.click();
    });
    fileInput.addEventListener('change', async e => {
      const room = 4 - getEventBanners().length;
      if (room <= 0) { pmAlert('배너 이미지는 최대 4장까지 등록할 수 있습니다.'); e.target.value = ''; return; }
      const keys = await saveFiles(e.target.files, 'event-banner', room);
      store.set('pm-event-banners', [...getEventBanners(), ...keys.map(key => ({ key, addedAt: new Date().toISOString() }))].slice(0, 4));
      e.target.value = '';
      wireEventBannerAdmin();
    });
  }
}

/* 지점 관리자: 담당 지점에 예약·작업 이력이 있는 고객의 문의만 노출 */
function inquiryVisibleToAdmin(msg) {
  if (!isGeneralAdmin() || !adminBranch) return true;
  const car = String(msg.car || msg.customer?.car || '');
  const memberId = String(msg.memberId || msg.customer?.id || '');
  const matches = list => list.some(x =>
    x.branch === adminBranch &&
    ((car && String(x.car || '') === car) || (memberId && String(x.memberId || '') === memberId)));
  return matches(getBookings()) || matches(getServiceRuns());
}

function renderAdmInquiry() {
  const body = $('#adm-inquiry-body');
  if (!isAdmin) { body.innerHTML = ''; return; }
  const messages = store.get('pm-messages', [])
    .filter(m => !m.serviceContext?.runId)
    .filter(inquiryVisibleToAdmin)
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  body.innerHTML = `<div class="inquiry-board" id="admin-inquiries">${messages.length ? '' : '<p class="hint">진행 중인 고객문의가 없습니다.</p>'}</div>`;
  renderAdminInquiries(messages);
}

function renderAdminInquiries(messages) {
  const wrap = $('#admin-inquiries');
  if (!wrap || !messages.length) return;
  const grouped = new Map();
  messages.forEach(msg => {
    const key = msg.memberId || msg.car || msg.customer?.id || msg.customer?.phone || msg.id;
    if (!grouped.has(key)) grouped.set(key, msg);
  });
  wrap.innerHTML = [...grouped.values()].slice(0, 12).map((msg, i) => {
    const customer = msg.customer || store.get('pm-members', []).find(m => m.id === msg.memberId || m.car === msg.car) || {};
    return `
      <article class="inquiry-row">
        <strong>${esc(customer.name || msg.car || '고객')}</strong>
        <span>${esc(customer.car || msg.car || '-')} · ${esc(new Date(msg.createdAt || Date.now()).toLocaleString('ko-KR'))}</span>
        <p>${esc(msg.message || '')}</p>
        <button type="button" class="mini-btn inquiry-open" data-inquiry="${i}">실시간 채팅</button>
      </article>`;
  }).join('');
  wrap.querySelectorAll('.inquiry-open').forEach((btn, i) => {
    const msg = [...grouped.values()][i];
    const customer = msg.customer || store.get('pm-members', []).find(m => m.id === msg.memberId || m.car === msg.car) || { id: msg.memberId, car: msg.car };
    btn.addEventListener('click', () => openCustomerCenterModal(customer));
  });
}

/* ============================================================
   이벤트 배너 + 앱 설치 (PWA)
   ============================================================ */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

async function requestAppInstall() {
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    promptEvent.prompt();
    try { await promptEvent.userChoice; } catch {}
    return;
  }
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    pmAlert('이미 홈 화면에 추가된 앱으로 사용 중입니다.', '앱 설치');
    return;
  }
  const guide = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? 'Safari 하단의 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택해주세요.'
    : '브라우저 메뉴(⋮)에서 "홈 화면에 추가" 또는 "앱 설치"를 선택해주세요.';
  pmAlert(`이 브라우저에서는 바로 설치를 지원하지 않습니다.\n${guide}`, '앱 설치');
}

async function eventBannerHtml() {
  const slides = [`
    <div class="event-slide install-slide" data-install role="button" tabindex="0">
      <img class="event-logo" src="images/logo-icon.png" alt="프로모터스 로고">
      <span class="event-copy">
        <strong>PRO MOTORS</strong>
        <span>1초 프로모터스 앱 다운로드</span>
      </span>
      <span class="event-install-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M6 11l6 6 6-6"/><path d="M5 21h14"/></svg>
        <em>설치</em>
      </span>
    </div>`];
  const banners = getEventBanners().slice(0, 4);
  const items = await Promise.all(banners.map(async b => ({ ...b, src: await assetSrc(b.key) })));
  items.filter(i => i.src).forEach(i => slides.push(`<div class="event-slide"><img src="${esc(i.src)}" alt="이벤트 배너"></div>`));
  return `
    <div class="event-banner" data-event-banner aria-label="이벤트 배너">
      <div class="event-track">${slides.join('')}</div>
      ${slides.length > 1 ? `<div class="event-dots">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
    </div>`;
}

function wireEventBanner(scope = modalCard) {
  const banner = scope.querySelector('[data-event-banner]');
  if (!banner) return;
  const track = banner.querySelector('.event-track');
  const dots = [...banner.querySelectorAll('.event-dots i')];
  track.addEventListener('scroll', () => {
    const idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    dots.forEach((d, i) => d.classList.toggle('on', i === idx));
  }, { passive: true });
  const install = banner.querySelector('[data-install]');
  install?.addEventListener('click', requestAppInstall);
  install?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestAppInstall(); }
  });
}

/* ============================================================
   모바일 하단 탭바 — 소개 · 매장안내 · 정비사례 · 게시판 · 마이
   ============================================================ */
function showAdminViewFromMenu(view) {
  showView(view);
  /* 설정 메뉴에서 진입 시 이전에 보던 지점/날짜 상태를 초기화해 새로 연 느낌을 준다 */
  if (view === 'adm-book') { adm = null; initAdmBook(); }
  if (view === 'adm-work') renderAdmWork();
  if (view === 'adm-approval') renderAdmApproval();
  if (view === 'adm-cust') renderAdmCust();
  if (view === 'adm-prod') renderAdmProd();
  if (view === 'adm-inquiry') renderAdmInquiry();
  if (view === 'adm-settings') renderAdmSettings();
}

/* 관리자용 마이(설정): 고객 내예약 페이지와 같은 전체화면 구성 */
async function openAdminSettingsPage() {
  const menus = [
    { view: 'adm-book', label: '예약관리', icon: 'calendar' },
    { view: 'adm-work', label: '작업현황', icon: 'wrench' },
    { view: 'adm-inquiry', label: '고객문의', icon: 'headset' },
    ...(isMainAdmin() ? [
      { view: 'adm-approval', label: '작업승인', icon: 'check' },
      { view: 'adm-cust', label: '고객관리', icon: 'user' },
      { view: 'adm-prod', label: '상품관리', icon: 'doc' },
      { view: 'adm-settings', label: '보안', icon: 'lock' }
    ] : [])
  ];
  const banner = await eventBannerHtml();
  openModal(`
    <h3>설정</h3>
    <section class="mypage-account-card">
      <div class="mypage-profile admin-profile">
        <span class="profile-avatar" aria-hidden="true">${MYPAGE_ICONS.user}</span>
        <span class="profile-text">
          <strong>관리자 모드</strong>
          <span>프로모터스</span>
        </span>
      </div>
    </section>
    <h4 class="mypage-sec-title">관리 메뉴</h4>
    <nav class="mypage-quick admin-settings-quick" aria-label="관리 메뉴">
      ${menus.map(menu => `
        <button type="button" data-adm-view="${menu.view}">
          <span class="quick-icon">${MYPAGE_ICONS[menu.icon]}</span>
          <strong>${menu.label}</strong>
        </button>`).join('')}
    </nav>
    ${banner}
    <button type="button" class="mypage-cs-btn" id="admin-settings-logout">
      <span class="cs-icon" aria-hidden="true">${MYPAGE_ICONS.user}</span>
      <span class="cs-text"><strong>로그아웃</strong><span>관리자 모드를 종료합니다</span></span>
      <b>›</b>
    </button>
  `, true);
  modalCard.classList.add('mypage-card');
  wireEventBanner();
  modalCard.querySelectorAll('[data-adm-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      showAdminViewFromMenu(btn.dataset.admView);
      window.scrollTo(0, 0);
    });
  });
  $('#admin-settings-logout').addEventListener('click', () => {
    closeModal();
    logout();
  });
}

/* 마이 탭: 관리자=설정, 고객=내예약, 비로그인=로그인/회원가입 */
function openMobileMy() {
  if (isAdmin) openAdminSettingsPage();
  else if (member) openMyPageModal();
  else openMemberModal('login');
  syncMobileTabbar(true);
}

function initMobileTabbar() {
  /* 관리자 화면 상단(모바일 전용) ‹ 관리 메뉴 버튼: 설정 페이지로 복귀 */
  $$('.adm-back').forEach(btn => btn.addEventListener('click', openAdminSettingsPage));
  $$('#mobile-tabbar [data-mtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mtab;
      if (tab === 'my') { openMobileMy(); return; }
      closeModal();
      showView(tab);
      if (tab === 'cases') activateTab('tab-blog');
      $('.nav-row')?.scrollIntoView({ block: 'start' });
    });
  });
}

/* ============================================================
   시작
   ============================================================ */
/* PC 고정 캔버스: 1920×1080 화면을 가로폭에 꽉 차게 (좌우 여백 없음) */
function fitStage() {
  const hero = $('.hero');
  if (window.matchMedia('(min-width: 901px)').matches) {
    hero.style.zoom = '';
    hero.style.transform = '';
  } else {
    hero.style.zoom = '';
    hero.style.transform = '';
  }
}
window.addEventListener('resize', fitStage);
window.visualViewport?.addEventListener('resize', fitStage);
new ResizeObserver(fitStage).observe(document.documentElement);
fitStage();
document.body.dataset.view = document.querySelector('.view.active')?.id.replace('view-', '') || 'intro';

async function startApp() {
  /* PWA: 홈 화면 추가(앱 설치)를 위해 서비스워커 등록 */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  /* 로컬 캐시로 즉시 화면을 그리고, 원격 데이터는 백그라운드에서 갱신한다.
     첫 진입 화면이 나왔다가 다른 화면으로 튀는 현상을 막는다. */
  wireNav();
  initMobileTabbar();
  initShopImage();
  $('#btn-add-notice').addEventListener('click', () => openNoticeModal(null));
  $('#btn-add-case').addEventListener('click', () => openCaseModal(null));
  $('#btn-add-branch').addEventListener('click', () => openBranchModal(null));
  $('#btn-add-product').addEventListener('click', () => openProductModal(null));
  $('.btn-reserve').addEventListener('click', e => { e.preventDefault(); openReserveFlow(); });
  $('.logo').addEventListener('dblclick', () => {
    if (isAdmin) {
      showView(isMainAdmin() ? 'adm-settings' : 'adm-book');
      if (isMainAdmin()) renderAdmSettings();
      else initAdmBook();
      return;
    }
    openAdminModal();
  });
  initRealtimeChat();
  applyAuthUI();
  const initialView = getHomeView();
  showView(initialView);
  if (initialView === 'cases') activateTab('tab-blog');

  /* 원격 데이터 수신 후 화면 전환 없이 내용만 다시 그린다 */
  await hydrateSupabaseData();
  introDataReady = true;
  await migrateLocalAssetsToSupabase();
  applyAuthUI();
  renderIntroSlides();
}

startApp();
