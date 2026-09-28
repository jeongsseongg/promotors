# 02. 레이아웃 구조 — 히어로 분할 · 사선 시트 · 뷰 전환

## 전체 구조 한눈에

```
<main class="hero">                      ← 100vh 고정, overflow: hidden
  <div class="bg-angled">                ← 사선 시트 배경 (장식, 클릭 불가)
  <section class="left-panel">           ← 왼쪽 41.67%, 절대 고정 (스크롤 없음)
    로고 → 노란바 → 타이틀(정비예약) → 설명 → 예약 버튼 → 브랜드 로고(하단 고정)
  <section class="right-panel">          ← 오른쪽 58.33%, 내부에서 뷰 전환
    nav-row (카테고리 탭 + 로그인 바)
    .view#view-intro / #view-location / #view-cases / #view-notice / #view-adm-*
</main>
<nav class="mobile-tabbar">              ← 모바일 전용 하단 탭바 (fixed)
<div class="modal-backdrop">             ← 공용 모달 (로그인/예약/마이페이지 등)
```

## 1. 히어로 분할 (데스크톱)

- `.hero`는 `display: flex; height: 100vh; min-height: 620px; overflow: hidden`.
  **왼쪽 레이아웃은 절대 변하지 않고**, 오른쪽만 내부 스크롤합니다.
- 분할 비율: 왼쪽 `flex: 0 0 41.67%`, 오른쪽 `flex: 1`.
- 오른쪽 배경은 왼쪽 시트보다 한 톤 어두운 쿨그레이:
  ```css
  background:
    radial-gradient(120% 90% at 85% 10%, rgba(255,255,255,.7) 0%, transparent 45%),
    linear-gradient(165deg, #dde1e7 0%, #cdd3db 45%, #c3cad3 100%);
  ```
- `.hero::before`로 은은한 사선 광택을 오른쪽 영역 위에 덧입힙니다.

## 2. 사선 시트 (`.bg-angled`) — 이 사이트의 시그니처

왼쪽 흰 시트가 **사선으로 잘려** 오른쪽 영역 위에 얹힌 구조.
`clip-path: polygon()` 두 장을 겹쳐 만듭니다.

```css
.bg-angled {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  filter: drop-shadow(10px 0 24px rgba(30, 36, 100, .22)); /* 시트가 뜬 그림자 */
}
/* 뒤: 금색 띠 — 시트보다 7px 넓게 잘라 가장자리로 노출 */
.bg-angled::before {
  background: linear-gradient(180deg, #ecd98f 0%, var(--gold) 45%, #a8862e 100%);
  clip-path: polygon(0 0, 46% 0, 37% 100%, 0 100%);
}
/* 앞: 흰색 실버(새틴) 시트 */
.bg-angled::after {
  background: /* 01번 문서의 실버 시트 그라데이션 */;
  clip-path: polygon(0 0, calc(46% - 7px) 0, calc(37% - 7px) 100%, 0 100%);
}
```

핵심 수치: **위쪽 46% → 아래쪽 37%** (9%p 기울기), 금색 띠 노출 폭 **7px**.
왼쪽 패널(z-index: 2)은 시트 위, 오른쪽 패널(z-index: 0)은 시트 아래에 깔려
사선이 오른쪽 사진 왼쪽을 살짝 덮는 연출이 의도된 것입니다.

## 3. 왼쪽 패널 구도 (모든 해상도 공통 순서)

로고 → 노란바 → "정비예약" 타이틀 → 설명 → 예약하기 버튼 → (남는 공간) → 브랜드 로고

- 브랜드 로고는 `margin-top: auto`로 항상 하단 고정.
- 데스크톱(901px+)에서는 모든 크기·여백을 `clamp( , vw/vh, )`로 화면에 비례시킵니다.
  음수 마진을 쓰지 않고 화면 높이에 비례한 여백으로만 구성합니다.
- 노란바: `width 68px × height 8px, border-radius 3px, background var(--yellow)`
- 브랜드 로고는 컬러 이미지가 기본, hover 시 흑백 이미지가 opacity로 크로스페이드.

## 4. 뷰 전환 (SPA without router)

- 오른쪽 패널의 각 화면은 `.view`이며 기본 `display: none`.
- JS가 `data-view` 버튼 클릭 시 해당 `.view`에 `.active`를 부여:
  ```css
  .view.active {
    display: flex; flex-direction: column; flex: 1; min-height: 0;
    overflow-y: auto;   /* 스크롤은 활성 뷰 내부에서만 */
  }
  ```
- `body[data-view="..."]` 속성으로 화면별 예외 스타일 제어
  (예: intro 화면은 `overflow: hidden`).
- 스크롤바도 브랜딩: 트랙 반투명 흰색, 썸은 네이비 그라데이션 + 흰 테두리, 999px 라운딩.

## 5. 상단 내비게이션 (`.nav-row`)

- 카테고리 탭(`.top-nav`)과 로그인 바(`.auth-bar`)가 같은 줄, `space-between`.
- 탭 버튼: 배경 없음, 굵은 네이비 텍스트, **활성/호버 시 노란 3px 밑줄**
  (`border-bottom: 3px solid var(--yellow)`).
- 각 탭 아래 hover 드롭다운: 흰 배경, 10px 라운딩, 네이비 톤 그림자,
  `opacity+visibility+translateY` 전환.

## 6. 섹션 헤더 패턴

모든 화면 상단에 공통으로 쓰이는 "라인—텍스트—라인" 키커:

```html
<p class="section-kicker"><span class="line"></span>프로모터스 지점 안내<span class="line"></span></p>
```

- 가운데 정렬 flex, 좌우에 90px(모바일에선 flex로 축소) 회색 라인.
- 화면 제목이 있는 경우: `<h2>` (72px/900) 아래에 intro-sub(28px/500) 배치.

## 7. 관리자 영역

- `body.admin` / `body.main-admin` 클래스로 노출 제어:
  ```css
  body:not(.admin) .admin-only { display: none !important; }
  body:not(.main-admin) .main-admin-only { display: none !important; }
  ```
- 관리자 화면 본문은 `.adm-body { max-width: 880px; margin: 0 auto; }`로 중앙 정렬.

## 8. 모달

- 전면 오버레이: `rgba(16,20,50,.5)` (네이비 틴트) + 중앙 정렬 flex.
- 기본 카드 `min(420px, 100%)`, wide `600px`, full `1180×900px` (에디터용).
- 닫기 버튼(.modal-x)은 `position: sticky; top: 0`으로 스크롤해도 상단 유지.
- 입력창 포커스는 `outline: 2px solid var(--yellow)`.
