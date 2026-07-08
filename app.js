/* ============================================================
   프로모터스 - 화면 전환 / 로그인 / 관리자 CMS
   데이터는 localStorage에 우선 저장되고, Supabase 설정 시 원격 동기화됩니다.
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
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
  if (objectUrls.has(key)) return objectUrls.get(key);
  try {
    const file = await assetDb.get(key);
    if (!file) return '';
    const url = URL.createObjectURL(file);
    objectUrls.set(key, url);
    return url;
  } catch { return ''; }
}

async function saveFiles(files, prefix, limit) {
  const selected = [...files].slice(0, limit);
  const keys = [];
  for (const file of selected) {
    const key = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await assetDb.set(key, file);
    keys.push(key);
  }
  return keys;
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

function phoneHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
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
  'pm-customers',
  'pm-bookings',
  'pm-members',
  'pm-blog-settings'
];
let isHydratingSupabase = false;

function getSupabaseConfig() {
  const supa = store.get('pm-supabase', null);
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
    rows.forEach(row => store.setLocal(row.data_key, row.payload));
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

/* ---------- 상태 ---------- */
let isAdmin = sessionStorage.getItem('pm-admin') === '1';
let member = store.get('pm-member', null);

/* ---------- 기본 데이터 ---------- */
const DEFAULT_BRANCHES = [
  { name: '프로모터스 안산점', tel: '031.831.9738', mobile: '', addr: '[주소를 입력해주세요]', map: '', url: '', imageKey: '' },
  { name: '프로모터스 새솔점', tel: '[전화번호를 입력해주세요]', mobile: '', addr: '[주소를 입력해주세요]', map: '', url: '', imageKey: '' }
];
const DEFAULT_NOTICES = [];

const DEFAULT_PRODUCTS = [
  { name: '엔진오일 교환', price: '', desc: '', link: '' },
  { name: '미션오일 교환', price: '', desc: '', link: '' },
  { name: '브레이크 패드 교체', price: '', desc: '', link: '' },
  { name: '타이어 교체/위치교환', price: '', desc: '', link: '' },
  { name: '에어컨 필터 교체', price: '', desc: '', link: '' }
];

const getBranches  = () => store.get('pm-branches', DEFAULT_BRANCHES);
const getNotices   = () => store.get('pm-notices', DEFAULT_NOTICES);
const getCases     = () => store.get('promotors-cases', []);
const getProducts  = () => store.get('pm-products', DEFAULT_PRODUCTS);
const getBlocked   = () => store.get('pm-blocked', []);
const getCustomers = () => store.get('pm-customers', {});
const getIntroSlides = () => store.get('pm-intro-slides', []);
const getBlogSettings = () => store.get('pm-blog-settings', { url: '', rss: '', proxy: '' });
const today = () => new Date().toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');
const BRANDS = ['전체','Mercedes-Benz','BMW','Audi','Volkswagen','Ferrari','Lamborghini','Maserati','Jaguar','Bentley','Rolls-Royce','MINI','Volvo','Lexus','Jeep','Land Rover','Porsche','기타'];
let selectedCaseBrand = '전체';
let selectedBranchIndex = 0;
let introSlideIndex = 0;
let introTimer = null;

/* ============================================================
   화면(뷰) 전환 — 오른쪽만 변경, 왼쪽 고정
   ============================================================ */
function showView(name) {
  document.body.dataset.view = name;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.top-nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('.right-panel').scrollTop = 0;
}

function wireNav() {
  $$('.top-nav [data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      showView(btn.dataset.view);
      if (btn.dataset.view === 'adm-book') initAdmBook();
      if (btn.dataset.view === 'adm-cust') renderAdmCust();
      if (btn.dataset.view === 'adm-prod') renderAdmProd();
      if (btn.dataset.tab) activateTab(btn.dataset.tab);
      if (btn.dataset.branch !== undefined) {
        const el = document.getElementById('branch-' + btn.dataset.branch);
        if (el) {
          $$('.branch').forEach(b => b.classList.remove('focus'));
          el.classList.add('focus');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
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

function openModal(html, wide) {
  modalCard.classList.toggle('wide', !!wide);
  modalCard.innerHTML = html;
  modal.hidden = false;
  const first = modalCard.querySelector('input, textarea');
  if (first) first.focus();
}
function closeModal() { modal.hidden = true; modalCard.innerHTML = ''; }
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ============================================================
   로그인 / 회원가입 / 관리자
   ============================================================ */
function applyAuthUI() {
  document.body.classList.toggle('admin', isAdmin);
  const bar = $('#auth-bar');
  bar.innerHTML = '';

  if (isAdmin) {
    bar.append(span('auth-user', '관리자 모드'), authBtn('로그아웃', logout));
  } else if (member) {
    bar.append(authBtn('로그아웃', logout));
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
  renderAdmCust();
  renderAdmProd();
  if (isAdmin) initAdmBook();
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
  member = null;
  sessionStorage.removeItem('pm-admin');
  store.del('pm-member');
  /* 관리자 화면에 있었다면 소개로 이동 */
  if (document.querySelector('.view.active')?.id.startsWith('view-adm')) showView('intro');
  applyAuthUI();
}

/* ---------- 회원 로그인 / 가입 모달 ---------- */
function openMemberModal(tab) {
  openModal(`
    <h3>회원 ${tab === 'login' ? '로그인' : '가입'}</h3>
    <div class="modal-tabs">
      <button type="button" class="mtab ${tab === 'login' ? 'active' : ''}" data-t="login">로그인</button>
      <button type="button" class="mtab ${tab === 'signup' ? 'active' : ''}" data-t="signup">회원가입</button>
    </div>
    <form id="member-form">
      <input type="text" id="m-car" placeholder="차량번호 (예: 12가3456)" required>
      ${tab === 'signup' ? '<input type="text" id="m-name" placeholder="이름" required>' : ''}
      ${tab === 'signup' ? '<input type="text" id="m-model" placeholder="차량명 (예: BMW 520d)" required>' : ''}
      <input type="tel" id="m-phone" placeholder="핸드폰번호 (예: 010-1234-5678)" required>
      <p class="form-error" id="m-error"></p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">${tab === 'login' ? '로그인' : '가입하기'}</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);

  modalCard.querySelectorAll('.mtab').forEach(b =>
    b.addEventListener('click', () => openMemberModal(b.dataset.t)));

  $('#member-form').addEventListener('submit', e => {
    e.preventDefault();
    const car = $('#m-car').value.trim();
    const phone = $('#m-phone').value.trim();
    const members = store.get('pm-members', []);
    const err = $('#m-error');

    if (tab === 'signup') {
      const name = $('#m-name').value.trim();
      const model = $('#m-model').value.trim();
      if (members.some(m => m.car === car)) { err.textContent = '이미 가입된 차량번호입니다.'; return; }
      members.push({ car, name, phone, model });
      store.set('pm-members', members);
      member = { car, name, phone, model };
    } else {
      const found = members.find(m => m.car === car && m.phone === phone);
      if (!found) { err.textContent = '일치하는 회원 정보가 없습니다. 차량번호와 핸드폰번호를 확인해주세요.'; return; }
      member = found;
    }
    store.set('pm-member', member);
    closeModal();
    applyAuthUI();
  });
}

/* ---------- 관리자 로그인 모달 ---------- */
function openAdminModal() {
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
    if ($('#a-pw').value === ADMIN_PW) {
      isAdmin = true;
      sessionStorage.setItem('pm-admin', '1');
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
  if (!branches[selectedBranchIndex]) selectedBranchIndex = 0;

  for (const [i, b] of branches.entries()) {
    const card = document.createElement('article');
    card.className = 'branch' + (i === selectedBranchIndex ? ' focus' : '');
    card.id = 'branch-' + i;

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

    if (b.map) {
      const map = document.createElement('a');
      map.className = 'branch-map'; map.href = b.map; map.target = '_blank'; map.rel = 'noopener';
      map.textContent = '네이버 지도에서 보기';
      card.append(map);
    }
    if (b.url) {
      const site = document.createElement('a');
      site.className = 'branch-map';
      site.href = normalizeUrl(b.url);
      site.target = '_blank';
      site.rel = 'noopener';
      site.textContent = '지점 페이지 열기';
      card.append(site);
    }
    card.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      selectedBranchIndex = i;
      renderBranches();
      logEvent('branch_select', { branch: b.name });
    });

    if (isAdmin) card.append(cardActions(
      () => openBranchModal(i),
      () => { if (confirm('"' + b.name + '" 지점을 삭제할까요?')) { const arr = getBranches(); arr.splice(i, 1); store.set('pm-branches', arr); applyAuthUI(); } }
    ));
    wrap.append(card);
  }

  const current = branches[selectedBranchIndex];
  preview.innerHTML = '';
  if (current) {
    const imgSrc = await assetSrc(current.imageKey);
    preview.innerHTML = `
      <div class="branch-preview-media ${imgSrc ? '' : 'empty'}">${imgSrc ? `<img src="${imgSrc}" alt="${esc(current.name)} 이미지">` : '이미지 준비중'}</div>
      <div class="branch-preview-body">
        <h3>${esc(current.name)}</h3>
        <a class="preview-phone" href="${phoneHref(current.tel)}">${esc(current.tel || '매장전화 미입력')}</a>
        ${current.mobile ? `<a class="preview-phone" href="${phoneHref(current.mobile)}">${esc(current.mobile)}</a>` : ''}
        <a class="preview-address" href="${normalizeUrl(current.map) || `https://map.naver.com/p/search/${encodeURIComponent(current.addr || current.name)}`}" target="_blank" rel="noopener">${esc(current.addr || '주소 미입력')}</a>
        ${current.url ? `<a class="branch-map" href="${normalizeUrl(current.url)}" target="_blank" rel="noopener">지점 URL 열기</a>` : ''}
      </div>`;
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
}

function openBranchModal(index) {
  const b = index != null ? getBranches()[index] : { name: '', tel: '', mobile: '', addr: '', map: '', url: '', imageKey: '' };
  openModal(`
    <h3>${index != null ? '지점 수정' : '지점 추가'}</h3>
    <form id="branch-form">
      <input type="text" id="b-name" placeholder="지점명 (예: 프로모터스 안산점)" required>
      <input type="text" id="b-tel" placeholder="매장 전화번호 (예: 031.831.9738)" required>
      <input type="text" id="b-mobile" placeholder="핸드폰번호 (선택)">
      <input type="text" id="b-addr" placeholder="주소" required>
      <input type="url" id="b-map" placeholder="네이버 플레이스/지도 링크 (선택)">
      <input type="url" id="b-url" placeholder="지점 상세 URL (선택)">
      <label class="file-label">지점 이미지
        <input type="file" id="b-img" accept="image/*">
      </label>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#b-name').value = b.name; $('#b-tel').value = b.tel;
  $('#b-mobile').value = b.mobile || ''; $('#b-addr').value = b.addr;
  $('#b-map').value = b.map; $('#b-url').value = b.url || '';
  let imageKey = b.imageKey || '';

  $('#b-img').addEventListener('change', async e => {
    if (!e.target.files[0]) return;
    imageKey = (await saveFiles(e.target.files, 'branch', 1))[0];
  });

  $('#branch-form').addEventListener('submit', async e => {
    e.preventDefault();
    const arr = getBranches();
    const data = {
      name: $('#b-name').value.trim(), tel: $('#b-tel').value.trim(),
      mobile: $('#b-mobile').value.trim(), addr: $('#b-addr').value.trim(),
      map: $('#b-map').value.trim(), url: $('#b-url').value.trim(), imageKey
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

function applyEditorToolbar(toolbar, editor) {
  toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      editor.focus();
    });
  });
}

function editorHtml(id, value = '') {
  return `
    <div class="editor-wrap">
      <div class="editor-toolbar">
        <button type="button" data-cmd="bold">B</button>
        <button type="button" data-cmd="insertUnorderedList">목록</button>
        <button type="button" data-cmd="formatBlock">본문</button>
      </div>
      <div class="rich-editor" id="${id}" contenteditable="true">${value}</div>
    </div>`;
}

function renderBlogFeed() {
  const feed = $('#blog-feed');
  if (!feed) return;
  const settings = getBlogSettings();
  feed.innerHTML = '';

  if (settings.url) {
    const a = document.createElement('a');
    a.className = 'btn-blog';
    a.href = normalizeUrl(settings.url);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '네이버 공식블로그 열기';
    feed.append(a);
  }

  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = settings.rss
    ? '블로그 자동 표시를 시도합니다. 네이버/프록시 CORS 설정에 따라 차단될 수 있습니다.'
    : '관리자 로그인 후 블로그 URL과 RSS/프록시 주소를 등록하세요.';
  feed.append(note);

  if (!settings.rss) return;
  const source = settings.proxy
    ? `${settings.proxy}${encodeURIComponent(settings.rss)}`
    : settings.rss;

  fetch(source)
    .then(r => r.text())
    .then(xml => {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const items = [...doc.querySelectorAll('item')].slice(0, 6);
      if (!items.length) return;
      const grid = document.createElement('div');
      grid.className = 'post-grid';
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '블로그 글';
        const link = item.querySelector('link')?.textContent || settings.url;
        const desc = item.querySelector('description')?.textContent || '';
        const card = document.createElement('article');
        card.className = 'post-card';
        card.innerHTML = `
          <time>${esc((item.querySelector('pubDate')?.textContent || '').slice(0, 16))}</time>
          <h3>${esc(title)}</h3>
          <p>${esc(plainFromHtml(desc).slice(0, 90))}</p>
          <a href="${esc(normalizeUrl(link))}" target="_blank" rel="noopener">게시글 보기</a>`;
        grid.append(card);
      });
      feed.append(grid);
    })
    .catch(() => {
      const err = document.createElement('p');
      err.className = 'hint warn';
      err.textContent = '브라우저에서 블로그 피드를 직접 불러오지 못했습니다. 프록시 또는 서버 함수가 필요합니다.';
      feed.append(err);
    });
}

function openBlogSettings() {
  const s = getBlogSettings();
  const supa = store.get('pm-supabase', { url: '', anon: '' });
  openModal(`
    <h3>블로그 / 수파베이스 연동</h3>
    <form id="blog-settings-form">
      <input type="url" id="blog-url" placeholder="네이버 공식블로그 URL">
      <input type="url" id="blog-rss" placeholder="블로그 RSS 또는 프록시 원본 URL">
      <input type="url" id="blog-proxy" placeholder="RSS 프록시 주소 (선택, 끝에 ?url= 형태 권장)">
      <hr class="modal-sep">
      <input type="url" id="supa-url" placeholder="Supabase Project URL">
      <input type="text" id="supa-anon" placeholder="Supabase anon key">
      <p class="hint">공식 네이버 검색 API는 Client Secret이 필요해서 프론트에 넣으면 안 됩니다. 운영 자동연동은 서버 함수가 필요합니다.</p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#blog-url').value = s.url || '';
  $('#blog-rss').value = s.rss || '';
  $('#blog-proxy').value = s.proxy || '';
  $('#supa-url').value = supa.url || '';
  $('#supa-anon').value = supa.anon || '';
  $('#blog-settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    store.set('pm-blog-settings', {
      url: $('#blog-url').value.trim(),
      rss: $('#blog-rss').value.trim(),
      proxy: $('#blog-proxy').value.trim()
    });
    store.set('pm-supabase', {
      url: $('#supa-url').value.trim(),
      anon: $('#supa-anon').value.trim()
    });
    await hydrateSupabaseData();
    closeModal();
    applyAuthUI();
  });
}

async function renderNotices() {
  const notices = getNotices();
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
    card.className = 'notice-card post-card';
    const imageHtml = await renderImageStrip(n.imageKeys || [], n.title);
    card.innerHTML = `
      <div class="post-images ${imageHtml ? '' : 'empty'}">${imageHtml || '<span>사진 준비중</span>'}</div>
      <div class="notice-body">
        <time>${esc(n.date || '')}</time>
        <h3>${esc(n.title || '')}</h3>
        <p>${esc(plainFromHtml(n.bodyHtml || n.body).slice(0, 120))}</p>
      </div>`;
    card.addEventListener('click', e => {
      if (!e.target.closest('button, a')) openPostView(n);
    });
    if (isAdmin) card.append(cardActions(
      () => openNoticeModal(i),
      () => { if (confirm('이 공지를 삭제할까요?')) { const arr = getNotices(); arr.splice(i, 1); store.set('pm-notices', arr); renderNotices(); } }
    ));
    album.append(card);
  }
}

function openNoticeModal(index) {
  const n = index != null ? getNotices()[index] : { date: today(), title: '', bodyHtml: '', imageKeys: [] };
  openModal(`
    <h3>${index != null ? '공지 수정' : '새 공지 작성'}</h3>
    <form id="notice-form">
      <input type="text" id="n-title" placeholder="제목" required>
      <input type="text" id="n-date" placeholder="날짜 (예: 2026.07.08)" required>
      ${editorHtml('n-editor', cleanHtml(n.bodyHtml || n.body || ''))}
      <label class="file-label">사진 추가
        <input type="file" id="n-img" accept="image/*" multiple>
      </label>
      <p class="hint">사진은 여러 장 등록할 수 있고 큰 파일은 브라우저 저장소에 보관됩니다.</p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true);
  $('#n-title').value = n.title || '';
  $('#n-date').value = n.date || today();
  let imageKeys = [...(n.imageKeys || [])];
  applyEditorToolbar(modalCard.querySelector('.editor-toolbar'), $('#n-editor'));

  $('#n-img').addEventListener('change', async e => {
    imageKeys = [...imageKeys, ...(await saveFiles(e.target.files, 'notice', 20))];
    e.target.value = '';
  });

  $('#notice-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getNotices();
    const data = {
      date: $('#n-date').value.trim(),
      title: $('#n-title').value.trim(),
      bodyHtml: cleanHtml($('#n-editor').innerHTML),
      imageKeys
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
  const cases = getCases();
  const filtered = selectedCaseBrand === '전체' ? cases : cases.filter(c => c.brand === selectedCaseBrand);
  const list = $('#case-list');
  list.innerHTML = '';
  $('#case-empty').style.display = filtered.length ? 'none' : '';

  for (const c of filtered) {
    const realIndex = cases.indexOf(c);
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
    if (isAdmin) card.append(cardActions(
      () => openCaseModal(realIndex),
      () => { if (confirm('이 정비사례를 삭제할까요?')) { const arr = getCases(); arr.splice(realIndex, 1); store.set('promotors-cases', arr); renderCases(); } }
    ));
    list.append(card);
  }
}

function openCaseModal(index = null) {
  const c = index != null ? getCases()[index] : { date: today(), title: '', brand: 'BMW', bodyHtml: '', imageKeys: [] };
  openModal(`
    <h3>${index != null ? '정비사례 수정' : '정비사례 작성'}</h3>
    <form id="case-edit-form">
      <input type="text" id="ce-title" placeholder="제목" required>
      <select id="ce-brand">${BRANDS.filter(b => b !== '전체').map(b => `<option>${esc(b)}</option>`).join('')}</select>
      <input type="text" id="ce-date" placeholder="날짜" required>
      ${editorHtml('ce-editor', cleanHtml(c.bodyHtml || c.body || ''))}
      <label class="file-label">사진 추가
        <input type="file" id="ce-img" accept="image/*" multiple>
      </label>
      <p class="hint">브랜드를 선택하면 실제 정비사례 탭에서 브랜드별로 필터링됩니다.</p>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `, true);
  $('#ce-title').value = c.title || '';
  $('#ce-brand').value = c.brand || '기타';
  $('#ce-date').value = c.date || today();
  let imageKeys = [...(c.imageKeys || [])];
  applyEditorToolbar(modalCard.querySelector('.editor-toolbar'), $('#ce-editor'));

  $('#ce-img').addEventListener('change', async e => {
    imageKeys = [...imageKeys, ...(await saveFiles(e.target.files, 'case', 30))];
    e.target.value = '';
  });

  $('#case-edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getCases();
    const data = {
      title: $('#ce-title').value.trim(),
      brand: $('#ce-brand').value,
      date: $('#ce-date').value.trim(),
      bodyHtml: cleanHtml($('#ce-editor').innerHTML),
      imageKeys
    };
    if (index != null) arr[index] = data; else arr.unshift(data);
    store.set('promotors-cases', arr);
    closeModal();
    renderCases();
  });
}

async function openPostView(post) {
  const images = await renderImageStrip(post.imageKeys || [], post.title);
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
      <h3>${esc(post.title || '')}</h3>
      <p class="post-meta-line">${esc(post.date || '')}${post.brand ? ' · ' + esc(post.brand) : ''}</p>
      <div class="post-images detail ${images ? '' : 'empty'}">${images || '<span>사진 준비중</span>'}</div>
      <div class="post-content">${cleanHtml(post.bodyHtml || post.body || '')}</div>
    </article>
  `, true);
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
  photo.classList.toggle('no-img', !slides.length);
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

  if (slides.length > 1) {
    introTimer = setInterval(() => moveIntroSlide(1), 3000);
  }
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
    <label class="file-label">이미지 추가 (최대 10장)
      <input type="file" id="intro-add-files" accept="image/*" multiple>
    </label>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="intro-save">닫기</button>
    </div>
  `, true);

  async function draw() {
    const wrap = $('#intro-manager');
    const current = getIntroSlides();
    wrap.innerHTML = current.length ? '' : '<p class="hint">등록된 소개 이미지가 없습니다.</p>';
    for (const [i, slide] of current.entries()) {
      const row = document.createElement('div');
      row.className = 'album-row';
      row.innerHTML = `
        <img src="${await assetSrc(slide.key)}" alt="">
        <span>${i + 1}</span>
        <button type="button" data-act="up">위로</button>
        <button type="button" data-act="down">아래로</button>
        <button type="button" data-act="del">삭제</button>`;
      row.querySelector('[data-act="up"]').disabled = i === 0;
      row.querySelector('[data-act="down"]').disabled = i === current.length - 1;
      row.querySelector('[data-act="up"]').addEventListener('click', () => {
        const arr = getIntroSlides();
        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        store.set('pm-intro-slides', arr);
        draw();
      });
      row.querySelector('[data-act="down"]').addEventListener('click', () => {
        const arr = getIntroSlides();
        [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        store.set('pm-intro-slides', arr);
        draw();
      });
      row.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const arr = getIntroSlides();
        const [removed] = arr.splice(i, 1);
        store.set('pm-intro-slides', arr);
        if (removed?.key) assetDb.del(removed.key).catch(() => {});
        draw();
      });
      wrap.append(row);
    }
    renderIntroSlides();
  }

  $('#intro-add-files').addEventListener('change', async e => {
    const current = getIntroSlides();
    const room = 10 - current.length;
    if (room <= 0) {
      alert('소개 이미지는 최대 10장까지 등록할 수 있습니다.');
      e.target.value = '';
      return;
    }
    const keys = await saveFiles(e.target.files, 'intro', room);
    store.set('pm-intro-slides', [
      ...current,
      ...keys.map((key, i) => ({ key, alt: `프로모터스 소개 이미지 ${current.length + i + 1}` }))
    ]);
    e.target.value = '';
    draw();
  });
  $('#intro-save').addEventListener('click', closeModal);
  await draw();
}

async function initShopImage() {
  const oldFile = await assetDb.get('shop-image').catch(() => null);
  if (oldFile && !getIntroSlides().length) {
    await assetDb.set('intro-legacy-shop-image', oldFile);
    store.set('pm-intro-slides', [{ key: 'intro-legacy-shop-image', alt: '프로모터스 소개 이미지' }]);
  }
  $('#intro-prev').addEventListener('click', () => moveIntroSlide(-1));
  $('#intro-next').addEventListener('click', () => moveIntroSlide(1));
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
      el.disabled = true;
      el.classList.add('blocked');
      el.title = '예약 불가';
    } else if (taken && taken.car === member.car) {
      el.classList.add('mine');
      el.title = '내 예약 - 누르면 취소';
      el.addEventListener('click', () => {
        if (!confirm(t + ' 예약을 취소할까요?')) return;
        const arr = getBookings();
        const idx = arr.findIndex(b => b.branch === cal.branch && b.date === cal.selDate && b.time === t && b.car === member.car);
        if (idx > -1) { arr.splice(idx, 1); store.set('pm-bookings', arr); }
        renderCalendar('예약이 취소되었습니다.');
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
    <div class="svc-list" id="svc-list"></div>
    <textarea id="svc-memo" rows="3" placeholder="요청사항 메모 (기타 선택 시 내용을 적어주세요)"></textarea>
    <div class="modal-actions">
      <button type="button" class="modal-submit" id="svc-confirm">예약 확정</button>
      <button type="button" class="modal-cancel" id="svc-back">이전</button>
    </div>
  `, true);

  const list = $('#svc-list');
  const options = [...products.map(p => ({ value: p.name, label: p.name + (p.price ? ` (${p.price})` : '') })),
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
    if (!services.length && !memo) { alert('서비스를 선택하거나 기타 메모를 입력해주세요.'); return; }
    const arr = getBookings();
    if (arr.some(b => b.branch === cal.branch && b.date === cal.selDate && b.time === cal.selTime)) {
      renderCalendar('죄송합니다. 방금 다른 고객이 해당 시간을 예약했습니다.'); return;
    }
    arr.push({ branch: cal.branch, date: cal.selDate, time: cal.selTime,
               car: member.car, name: member.name, phone: member.phone, model: member.model || '',
               services, memo });
    store.set('pm-bookings', arr);
    const done = `${cal.selDate} ${cal.selTime} 예약이 확정되었습니다.`;
    cal.selTime = null;
    renderCalendar(done);
  });
}

/* ============================================================
   관리자: 예약관리 — 현황 캘린더 / 예약금지 / 변경 / 취소
   ============================================================ */
let adm = null;

function initAdmBook() {
  const now = new Date();
  if (!adm) adm = { branch: getBranches()[0]?.name, y: now.getFullYear(), m: now.getMonth(), selDate: null };
  renderAdmBook();
}

function renderAdmBook() {
  const body = $('#adm-book-body');
  if (!isAdmin || !adm) { body.innerHTML = ''; return; }
  const branches = getBranches();
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
    t.addEventListener('click', () => { adm.branch = b.name; adm.selDate = null; renderAdmBook(); });
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
      c.textContent = (cnt ? '예약 ' + cnt : '') + (cnt && blk ? ' · ' : '') + (blk ? '금지 ' + blk : '');
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
      info.textContent = `${b.car} ${b.name} (${b.model || '-'}) · ${(b.services && b.services.length) ? b.services.join(', ') : '서비스 미선택'}${b.memo ? ' · ' + b.memo : ''}`;
      row.append(miniBtn('변경', () => openMoveBooking(bIdx)),
                 miniBtn('취소', () => {
                   if (!confirm('이 예약을 취소할까요?')) return;
                   const arr = getBookings(); arr.splice(bIdx, 1); store.set('pm-bookings', arr); renderAdmBook();
                 }, true));
    } else if (blkIdx > -1) {
      info.textContent = '예약금지';
      info.classList.add('blocked-text');
      row.append(miniBtn('금지 해제', () => {
        const arr = getBlocked(); arr.splice(blkIdx, 1); store.set('pm-blocked', arr); renderAdmBook();
      }));
    } else {
      info.textContent = '비어있음';
      row.append(miniBtn('예약금지', () => {
        const arr = getBlocked(); arr.push({ branch: adm.branch, date: adm.selDate, time: t }); store.set('pm-blocked', arr); renderAdmBook();
      }));
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
      $('#mv-error').textContent = '해당 시간은 예약금지 상태입니다.'; return;
    }
    all[idx] = { ...b, date: nd, time: nt };
    store.set('pm-bookings', all);
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

function renderAdmCust() {
  const body = $('#adm-cust-body');
  if (!isAdmin) { body.innerHTML = ''; return; }
  const members = store.get('pm-members', []);
  const customers = getCustomers();
  body.innerHTML = members.length ? '' : '<p class="hint">가입된 고객이 없습니다.</p>';

  members.forEach(m => {
    const c = customers[m.car] || { memo: '', records: [] };
    const bookCnt = getBookings().filter(b => b.car === m.car).length;
    const card = document.createElement('article');
    card.className = 'cust-card';
    card.innerHTML = `
      <div class="cust-head">
        <strong>${esc(m.name)}</strong>
        <span>${esc(m.car)} · ${esc(m.model || '-')} · ${esc(m.phone)}</span>
        <em>예약 ${bookCnt}건</em>
      </div>
      <textarea class="cust-memo" rows="2" placeholder="고객 메모 (성향, 주의사항 등)">${esc(c.memo)}</textarea>
      <button type="button" class="mini-btn memo-save">메모 저장</button>
      <table class="rec-table">
        <thead><tr><th>날짜</th><th>서비스</th><th>금액</th><th>정산</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <form class="rec-form">
        <input type="date" class="rec-date" required>
        <input type="text" class="rec-svc" placeholder="받은 서비스" required>
        <input type="number" class="rec-amt" placeholder="금액(원)" min="0">
        <label class="rec-paid-label"><input type="checkbox" class="rec-paid"> 정산완료</label>
        <button type="submit" class="mini-btn add">추가</button>
      </form>`;

    const tbody = card.querySelector('tbody');
    c.records.forEach((r, ri) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(r.date)}</td><td>${esc(r.service)}</td><td>${r.amount ? Number(r.amount).toLocaleString() + '원' : '-'}</td>`;
      const tdPaid = document.createElement('td');
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pay-pill' + (r.paid ? ' paid' : '');
      pill.textContent = r.paid ? '정산' : '미정산';
      pill.addEventListener('click', () => mutateCust(m.car, cc => { cc.records[ri].paid = !cc.records[ri].paid; }));
      tdPaid.append(pill);
      const tdDel = document.createElement('td');
      tdDel.append(miniBtn('삭제', () => { if (confirm('기록을 삭제할까요?')) mutateCust(m.car, cc => cc.records.splice(ri, 1)); }, true));
      tr.append(tdPaid, tdDel);
      tbody.append(tr);
    });

    card.querySelector('.memo-save').addEventListener('click', () =>
      mutateCust(m.car, cc => { cc.memo = card.querySelector('.cust-memo').value; }));

    const form = card.querySelector('.rec-form');
    form.querySelector('.rec-date').value = new Date().toISOString().slice(0, 10);
    form.addEventListener('submit', e => {
      e.preventDefault();
      mutateCust(m.car, cc => cc.records.unshift({
        date: form.querySelector('.rec-date').value.replaceAll('-', '.'),
        service: form.querySelector('.rec-svc').value.trim(),
        amount: form.querySelector('.rec-amt').value,
        paid: form.querySelector('.rec-paid').checked
      }));
    });

    body.append(card);
  });
}

/* ============================================================
   관리자: 상품관리 — 예약 시 선택 가능한 서비스
   ============================================================ */
function renderAdmProd() {
  const body = $('#adm-prod-body');
  if (!isAdmin) { body.innerHTML = ''; return; }
  const products = getProducts();
  body.innerHTML = products.length ? '' : '<p class="hint">등록된 상품이 없습니다. 상품을 추가하면 고객 예약 화면에 표시됩니다.</p>';

  products.forEach((p, i) => {
    const card = document.createElement('article');
    card.className = 'prod-card';
    const main = document.createElement('div');
    main.className = 'prod-main';
    main.innerHTML = `<strong>${esc(p.name)}</strong>${p.price ? `<span class="prod-price">${esc(p.price)}</span>` : ''}
      ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
      ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">참고 링크 열기</a>` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(miniBtn('수정', () => openProductModal(i)),
                   miniBtn('삭제', () => {
                     if (!confirm(`"${p.name}" 상품을 삭제할까요?`)) return;
                     const arr = getProducts(); arr.splice(i, 1); store.set('pm-products', arr); renderAdmProd();
                   }, true));
    card.append(main, actions);
    body.append(card);
  });
}

function openProductModal(index) {
  const p = index != null ? getProducts()[index] : { name: '', price: '', desc: '', link: '' };
  openModal(`
    <h3>${index != null ? '상품 수정' : '상품 추가'}</h3>
    <form id="prod-form">
      <input type="text" id="p-name" placeholder="상품명 (예: 엔진오일 교환)" required>
      <input type="text" id="p-price" placeholder="가격 표시 (예: 80,000원~ / 선택)">
      <textarea id="p-desc" rows="3" placeholder="설명 (선택)"></textarea>
      <input type="url" id="p-link" placeholder="참고 링크 URL (선택)">
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>`);
  $('#p-name').value = p.name; $('#p-price').value = p.price || '';
  $('#p-desc').value = p.desc || ''; $('#p-link').value = p.link || '';
  $('#prod-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getProducts();
    const data = { name: $('#p-name').value.trim(), price: $('#p-price').value.trim(),
                   desc: $('#p-desc').value.trim(), link: $('#p-link').value.trim() };
    if (index != null) arr[index] = data; else arr.push(data);
    store.set('pm-products', arr);
    closeModal();
    renderAdmProd();
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
  await hydrateSupabaseData();
  wireNav();
  initShopImage();
  $('#btn-add-notice').addEventListener('click', () => openNoticeModal(null));
  $('#btn-add-case').addEventListener('click', () => openCaseModal(null));
  $('#btn-blog-settings').addEventListener('click', openBlogSettings);
  $('#btn-add-branch').addEventListener('click', () => openBranchModal(null));
  $('#btn-add-product').addEventListener('click', () => openProductModal(null));
  $('.btn-reserve').addEventListener('click', e => { e.preventDefault(); openReserveFlow(); });
  $('.logo').addEventListener('dblclick', openAdminModal);
  applyAuthUI();
}

startApp();
