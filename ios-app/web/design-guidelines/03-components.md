# 03. 컴포넌트 카탈로그

새 UI를 만들 때 여기 있는 패턴을 먼저 찾아 재사용하세요.
새 컴포넌트가 필요하면 아래 레시피의 색·라운딩·그림자 규칙을 그대로 따르세요.

## 버튼

### 주 버튼 (입체 CTA) — `.btn-reserve`
네이비 배경 + 옐로 텍스트 + **아래 노란 두께 그림자**로 눌리는 입체 연출.
```css
background: var(--navy); color: var(--yellow); border-radius: 12px;
box-shadow: 0 6px 0 var(--yellow), 0 12px 24px rgba(30,36,100,.3);
/* hover: translateY(2px) + 그림자 0 4px 0 으로 → 눌림 */
```

### 외곽선 버튼 — `.auth-btn`, `.branch-map`, `.branch-select button`
```css
border: 1.5px solid var(--navy); background: none; color: var(--navy);
border-radius: 8px;
/* hover: 배경 네이비, 텍스트 옐로로 반전 */
```

### 미니 버튼 (관리용) — `.mini-btn`
```css
border: 1px solid #c9d1d9; background: #fff; color: #555f6b;
font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 6px;
/* hover: 테두리·텍스트 네이비. .danger는 hover 시 빨강 */
/* .add 변형: 네이비 배경 + 옐로 텍스트 */
```

### 필터 칩 — `.brand-filter button`
알약형(999px), 흰 배경 + 회색 테두리. 활성 시 네이비 배경 + 옐로 텍스트.

## 카드

### 콘텐츠 카드 (정비사례) — `.post-card`
```css
background: #fff; border: 1px solid #e2e6ea; border-radius: 12px; overflow: hidden;
/* hover: 그림자 0 10px 26px rgba(30,36,100,.12) + translateY(-2px) */
```
- 상단 이미지 영역 `.post-images`: `aspect-ratio: 16/9`, 이미지 없으면
  네이비 그라데이션 placeholder. 여러 장이면 가로 scroll-snap.
- 본문 `.post-body`: padding 18~20px, 제목 18px 네이비, 요약 2줄 말줄임
  (`-webkit-line-clamp: 2`).

### 공지 카드 (가로형) — `.notice-card`
`grid-template-columns: minmax(220px, 32%) 1fr` — 왼쪽 이미지 / 오른쪽 텍스트.
텍스트만 있으면 `.text-only`로 1열. 관리 버튼은 카드 우상단에 반투명 흰 패널로 부유.

### 지점 카드 — `.branch`
흰 카드, 중앙 정렬, 포커스 시 `border-color: var(--yellow)` + 금색 그림자.

### 접이식 카드 (작업현황) — `.work-card.collapsible`
헤더 클릭으로 상세(`.work-card-detail`)를 열고 닫음.
`[hidden] { display: none; }`을 grid보다 뒤에 선언해야 접힘이 동작 (핵심 규칙).

## 상태 표시

### 스텝 알약 — `.service-steps span`
```css
border: 1px solid #d6dbe1; border-radius: 999px; font-size: 12px; font-weight: 800;
/* .active: 노란 테두리 + #fff9d9 배경 + 네이비 텍스트 */
/* .done:   그린 테두리 + #e6f7ee 배경 + #038550 텍스트 */
```

### 결제 상태 필 — `.pay-pill`
미결제: `#fdecea`/`#c0392b`, 결제됨(.paid): `#e6f7ee`/`#038550`.

### 카운트 뱃지 — `.work-head span`
`#fff9d9` 배경 + `#8a6a00` 텍스트의 알약.

### 알림 뱃지
`#ef4444` 원형(999px), 흰 굵은 숫자, 최소 18~22px.

## 예약 캘린더 — `.cal-*`

- 7열 그리드, 날짜 셀은 흰 카드(8px 라운딩, `#e8ecf0` 테두리, min-height 52px).
- 선택: 네이비 배경 + 흰 텍스트. 비활성: `#f5f6f8` 배경 + `#c3cad3` 텍스트.
- 내 예약 표시: 우상단 7px 그린 점(`::after`).
- 시간 슬롯: 5열 그리드. 선택 시 네이비+옐로, 마감 시 취소선,
  내 예약은 그린 톤(`#e6f7ee`).

## 마이페이지 (앱 스타일 — 블루 계열)

홈페이지 영역과 다른 **토스풍 화이트+블루** 언어를 사용합니다.

### 파란 계정 카드 — `.mypage-account-card`
```css
border-radius: 18px;
background: linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%);
box-shadow: 0 14px 30px rgba(27,79,192,.28);
/* 내부: 흰 텍스트, 반투명 흰(rgba(255,255,255,.16)) 아이콘 원, 
   rgba(255,255,255,.22) 1px 구분선 */
```

### 퀵메뉴 그리드 — `.mypage-quick`
4열 그리드. 각 버튼: 흰 카드(16px 라운딩) + 34px 파란 아이콘 타일
(`--blue-soft` 배경, 12px 라운딩) + 13px/900 라벨.

### 작업 단계 표시 — `.work-steps`
원형 아이콘(36px) + 연결선(3px) 수평 진행 표시.
대기: `#f1f4f8`/`#9aa7b6`, 완료: `--blue-soft`/`--blue`,
현재: `--blue` 배경 + 흰 아이콘 + 파란 글로 그림자.

### 목록 행 — `.mypage-list button`
`grid-template-columns: 34px 1fr auto`, 행 사이 `#eef1f5` 1px 구분선,
오른쪽에 `›` 셰브론(`#b7c0ca`).

## 채팅 — `.chat-stream`

- 스트림 배경 `#f4f6f9`, 14px 라운딩.
- 말풍선: 16px 라운딩, **내 메시지는 파란 배경 + 오른쪽 아래 모서리만 6px**,
  상대 메시지는 흰 배경 + 테두리 + 왼쪽 아래 모서리만 6px (꼬리 연출).
- 최대 폭 82%, 시간은 11px `#9aa7b6`.

## 폼 요소

```css
input, textarea, select {
  font-family: inherit; font-size: 15px; padding: 12px 14px;
  border: 1px solid #d6dbe1; border-radius: 8px;
}
:focus { outline: 2px solid var(--yellow); border-color: transparent; }
```
- 비밀번호 표시 토글: 입력창 안 오른쪽에 작은 회색 버튼 내장.
- 라벨 `.field-title`: 14px/800 `#555f6b`.

## 리치 에디터 / 앨범 관리

- 에디터: 회색 툴바(`#f4f6f8`) + 흰 본문. full 모달에서는 본문을
  `min(760px, 100%)` 중앙 칼럼으로(문서 편집기 느낌).
- 앨범 슬롯: 5열(모바일 2열) 정사각형, 2px 점선 테두리, 빈 슬롯은 노란 `+`,
  좌상단 번호 뱃지(네이비 원), 드래그 중 opacity .55, 드롭 대상은 노란 테두리.

## 이미지 처리 원칙

- 콘텐츠 사진은 `object-fit: contain` + 흰 배경 (잘리지 않게).
- 배경/썸네일 사진만 `cover`.
- 슬라이더는 scroll-snap 또는 opacity 페이드, 화살표는 배경 없는
  큰 흰 글리프(‹ ›) + 진한 텍스트 그림자, `arrowNudge` 애니메이션으로 흔들림.
