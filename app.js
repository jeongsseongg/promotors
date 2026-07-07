/* ============================================================
   프로모터스 - 화면 전환 / 로그인 / 관리자 CMS
   데이터는 브라우저 localStorage에 저장됩니다 (서버 없음).
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
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
  }
};

/* 관리자 비밀번호 */
const ADMIN_PW = 'goodpro1!';

/* ---------- 상태 ---------- */
let isAdmin = sessionStorage.getItem('pm-admin') === '1';
let member = store.get('pm-member', null);

/* ---------- 기본 데이터 ---------- */
const DEFAULT_BRANCHES = [
  { name: '프로모터스 안산점', tel: '031.831.9738', addr: '[주소를 입력해주세요]', map: '' },
  { name: '프로모터스 새솔점', tel: '[전화번호를 입력해주세요]', addr: '[주소를 입력해주세요]', map: '' }
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
const today = () => new Date().toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');

/* ============================================================
   화면(뷰) 전환 — 오른쪽만 변경, 왼쪽 고정
   ============================================================ */
function showView(name) {
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
    bar.append(span('auth-user', '🔧 관리자 모드'), authBtn('로그아웃', logout));
  } else if (member) {
    bar.append(span('auth-user', member.name + '님 (' + member.car + ')'), authBtn('로그아웃', logout));
  } else {
    const btn = authBtn('로그인', null);
    /* 클릭=회원 로그인, 더블클릭=관리자 로그인 */
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
function renderBranches() {
  const branches = getBranches();
  const wrap = $('#branches');
  wrap.innerHTML = '';

  branches.forEach((b, i) => {
    const card = document.createElement('article');
    card.className = 'branch';
    card.id = 'branch-' + i;

    const h3 = document.createElement('h3'); h3.textContent = b.name;
    const tel = document.createElement('p'); tel.className = 'branch-tel';
    if (/^[\d.\-\s]+$/.test(b.tel)) {
      const a = document.createElement('a');
      a.href = 'tel:' + b.tel.replace(/[^\d]/g, '');
      a.textContent = b.tel;
      tel.append(a);
    } else tel.textContent = b.tel;

    const addr = document.createElement('p'); addr.className = 'branch-addr'; addr.textContent = b.addr;
    card.append(h3, tel, addr);

    if (b.map) {
      const map = document.createElement('a');
      map.className = 'branch-map'; map.href = b.map; map.target = '_blank'; map.rel = 'noopener';
      map.textContent = '네이버 지도에서 보기';
      card.append(map);
    }

    if (isAdmin) card.append(cardActions(
      () => openBranchModal(i),
      () => { if (confirm('"' + b.name + '" 지점을 삭제할까요?')) { const arr = getBranches(); arr.splice(i, 1); store.set('pm-branches', arr); applyAuthUI(); } }
    ));
    wrap.append(card);
  });

  /* 드롭다운도 지점 목록과 동기화 */
  const dd = $('#dropdown-branches');
  dd.innerHTML = '';
  branches.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.dataset.view = 'location'; btn.dataset.branch = i;
    btn.textContent = b.name;
    btn.addEventListener('click', () => {
      showView('location');
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
  const b = index != null ? getBranches()[index] : { name: '', tel: '', addr: '', map: '' };
  openModal(`
    <h3>${index != null ? '지점 수정' : '지점 추가'}</h3>
    <form id="branch-form">
      <input type="text" id="b-name" placeholder="지점명 (예: 프로모터스 안산점)" required>
      <input type="text" id="b-tel" placeholder="전화번호 (예: 031.831.9738)" required>
      <input type="text" id="b-addr" placeholder="주소" required>
      <input type="url" id="b-map" placeholder="네이버 지도 링크 (선택)">
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#b-name').value = b.name; $('#b-tel').value = b.tel;
  $('#b-addr').value = b.addr; $('#b-map').value = b.map;

  $('#branch-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getBranches();
    const data = {
      name: $('#b-name').value.trim(), tel: $('#b-tel').value.trim(),
      addr: $('#b-addr').value.trim(), map: $('#b-map').value.trim()
    };
    if (index != null) arr[index] = data; else arr.push(data);
    store.set('pm-branches', arr);
    closeModal();
    applyAuthUI();
  });
}

/* ============================================================
   공지사항 — 관리자: 작성/수정/삭제 (앨범형)
   ============================================================ */
function renderNotices() {
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

  notices.forEach((n, i) => {
    const card = document.createElement('article');
    card.className = 'notice-card';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (n.img) {
      const img = document.createElement('img');
      img.src = n.img; img.alt = '';
      thumb.append(img);
    } else {
      thumb.append(span('', '사진 준비중'));
    }

    const body = document.createElement('div');
    body.className = 'notice-body';
    const time = document.createElement('time'); time.textContent = n.date;
    const h3 = document.createElement('h3'); h3.textContent = n.title;
    const p = document.createElement('p'); p.textContent = n.body;
    body.append(time, h3, p);

    card.append(thumb, body);
    if (isAdmin) card.append(cardActions(
      () => openNoticeModal(i),
      () => { if (confirm('이 공지를 삭제할까요?')) { const arr = getNotices(); arr.splice(i, 1); store.set('pm-notices', arr); renderNotices(); } }
    ));
    album.append(card);
  });
}

function openNoticeModal(index) {
  const n = index != null ? getNotices()[index] : { date: today(), title: '', body: '', img: '' };
  openModal(`
    <h3>${index != null ? '공지 수정' : '새 공지 작성'}</h3>
    <form id="notice-form">
      <input type="text" id="n-title" placeholder="제목" required>
      <input type="text" id="n-date" placeholder="날짜 (예: 2026.07.07)" required>
      <textarea id="n-body" rows="4" placeholder="내용" required></textarea>
      <label class="file-label">사진 (선택)
        <input type="file" id="n-img" accept="image/*">
      </label>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#n-title').value = n.title; $('#n-date').value = n.date; $('#n-body').value = n.body;
  let imgData = n.img;

  $('#n-img').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { imgData = reader.result; };
    reader.readAsDataURL(f);
  });

  $('#notice-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getNotices();
    const data = { date: $('#n-date').value.trim(), title: $('#n-title').value.trim(), body: $('#n-body').value.trim(), img: imgData };
    if (index != null) arr[index] = data; else arr.unshift(data);
    try { store.set('pm-notices', arr); } catch { alert('이미지 용량이 너무 큽니다. 더 작은 사진을 사용해주세요.'); return; }
    closeModal();
    renderNotices();
  });
}

/* ============================================================
   정비사례 (웹 게시글) — 관리자: 작성/수정/삭제
   ============================================================ */
function renderCases() {
  const cases = getCases();
  const list = $('#case-list');
  list.innerHTML = '';
  $('#case-empty').style.display = cases.length ? 'none' : '';

  cases.forEach((c, i) => {
    const li = document.createElement('li');
    const h = document.createElement('h4'); h.textContent = c.title;
    const d = document.createElement('time'); d.textContent = c.date;
    const p = document.createElement('p'); p.textContent = c.body;
    li.append(h, d, p);
    if (isAdmin) li.append(cardActions(
      () => openCaseModal(i),
      () => { if (confirm('이 게시글을 삭제할까요?')) { const arr = getCases(); arr.splice(i, 1); store.set('promotors-cases', arr); renderCases(); } }
    ));
    list.append(li);
  });
}

function openCaseModal(index) {
  const c = getCases()[index];
  openModal(`
    <h3>게시글 수정</h3>
    <form id="case-edit-form">
      <input type="text" id="ce-title" required>
      <textarea id="ce-body" rows="4" required></textarea>
      <div class="modal-actions">
        <button type="submit" class="modal-submit">저장</button>
        <button type="button" class="modal-cancel" onclick="document.getElementById('modal').hidden=true">취소</button>
      </div>
    </form>
  `);
  $('#ce-title').value = c.title; $('#ce-body').value = c.body;
  $('#case-edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const arr = getCases();
    arr[index] = { ...arr[index], title: $('#ce-title').value.trim(), body: $('#ce-body').value.trim() };
    store.set('promotors-cases', arr);
    closeModal();
    renderCases();
  });
}

$('#case-form').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#case-title').value.trim();
  const body = $('#case-body').value.trim();
  if (!title || !body) return;
  const arr = getCases();
  arr.unshift({ title, body, date: today() });
  store.set('promotors-cases', arr);
  e.target.reset();
  renderCases();
});

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
   소개 이미지 변경 (관리자)
   ============================================================ */
async function initShopImage() {
  const img = $('#shop-img');
  let objectUrl = null;

  const showFallback = () => {
    img.hidden = true;
    $('#shop-photo').classList.add('no-img');
  };
  const showImage = src => {
    img.src = src;
    img.hidden = false;
    $('#shop-photo').classList.remove('no-img');
  };
  img.addEventListener('error', showFallback);

  try {
    const savedFile = await assetDb.get('shop-image');
    if (savedFile) {
      objectUrl = URL.createObjectURL(savedFile);
      showImage(objectUrl);
    } else {
      const legacySaved = store.get('pm-shop-img', null);
      if (legacySaved) showImage(legacySaved);
      else showFallback();
    }
  } catch {
    const legacySaved = store.get('pm-shop-img', null);
    if (legacySaved) showImage(legacySaved);
    else showFallback();
  }

  $('#btn-shop-img').addEventListener('click', () => $('#shop-img-input').click());
  $('#shop-img-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await assetDb.set('shop-image', f);
      store.del('pm-shop-img');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(f);
      showImage(objectUrl);
    } catch {
      alert('이 브라우저 저장공간에 이미지를 저장하지 못했습니다. 더 작은 파일을 사용하거나 브라우저 저장공간을 비워주세요.');
    } finally {
      e.target.value = '';
    }
  });
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

wireNav();
initShopImage();
$('#btn-add-notice').addEventListener('click', () => openNoticeModal(null));
$('#btn-add-branch').addEventListener('click', () => openBranchModal(null));
$('#btn-add-product').addEventListener('click', () => openProductModal(null));
$('.btn-reserve').addEventListener('click', e => { e.preventDefault(); openReserveFlow(); });
applyAuthUI();
