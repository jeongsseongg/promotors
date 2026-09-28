# 04. 모바일 · 반응형 규칙

브레이크포인트는 **900px** 하나가 기준입니다.
(`@media (max-width: 900px)` = 모바일, `(min-width: 901px)` = 데스크톱)
보조로 `520px`에서 극소형 조정을 합니다.

## 1. 구조 전환: 좌우 분할 → 세로 스택

- `.hero`가 `flex-direction: column`으로 전환, `height: auto`.
- **사선 시트(.bg-angled)는 통째로 숨기고**, 왼쪽 패널 자체에
  실버 그라데이션 배경 + 하단 5px 금색 보더로 시그니처를 유지:
  ```css
  .left-panel {
    background: linear-gradient(115deg, #ffffff 0%, #f3f4f6 30%, #ffffff 55%, #e9ebef 80%, #ffffff 100%);
    border-bottom: 5px solid var(--gold);
    min-height: 100svh;   /* 첫 화면은 히어로만 꽉 차게 */
  }
  ```
- 첫 화면은 히어로만 보이고, 아래 콘텐츠는 스크롤해야 나타납니다.
  하단에 바운스하는 셰브론 스크롤 큐(`.scroll-cue`)를 표시.
- 내부 스크롤을 모두 해제하고 문서 스크롤로 통일:
  `.view.active { overflow: visible !important; }`

## 2. 모바일 크기 조정 값

| 요소 | 데스크톱 → 모바일 |
|------|------|
| 로고 | 505px → `min(350px, 100%)` |
| 타이틀 | 125px → 71px (line-height .95) |
| 설명 | 28px → 14px (max-width 350px) |
| 예약 버튼 | 36px → 24px (min-height 64px, 전체 폭) |
| 화면 제목 h2 | 72px → 34px |
| 섹션 키커 | 28px → 17px (라인은 flex로 축소) |
| 탭 | 18px → 15px |

## 3. 상단 내비게이션

- 탭이 전체 폭 균등 그리드로: `grid-template-columns: repeat(4, 1fr)`
  (관리자 로그인 시 5열).
- hover 드롭다운은 전부 비활성 (`display: none !important`) —
  터치에서는 hover가 없으므로. 관리자 메뉴만 클릭 토글(`.admin-menu-open`)로 열림.
- `.auth-bar`는 숨김 (로그인은 하단 탭바 '마이'로 이동).

## 4. 하단 탭바 — `.mobile-tabbar` (모바일 전용)

앱처럼 보이게 하는 핵심 요소. 데스크톱에서는 `display: none`.

```css
position: fixed; left/right/bottom: 0; z-index: 120;
display: grid; grid-template-columns: repeat(5, 1fr);
background: #fff; border-top: 1px solid #e5e8ec;
padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
box-shadow: 0 -6px 18px rgba(15,23,42,.08);
```

- 버튼: 스트로크 SVG 아이콘(22px, stroke-width 1.8) + 11px/700 라벨.
  기본 `#8a94a0`, 활성 `var(--blue)`.
- 탭 구성: 소개 · 매장안내 · 정비사례 · 게시판 · 마이
- 탭바에 가리지 않도록 본문 하단 여백 확보:
  `.right-panel { padding-bottom: calc(96px + env(safe-area-inset-bottom)); }`

## 5. 모달 → 전체화면 페이지

모바일에서 마이페이지·로그인·회원가입은 팝업이 아니라 **앱 페이지처럼 전체화면**:

```css
.modal-card.mypage-card, .modal-card.mobile-full {
  position: fixed; inset: 0; width: 100%; height: 100%;
  max-height: none; border-radius: 0;
  padding: 20px 16px calc(80px + env(safe-area-inset-bottom));
}
```

관리자 화면 상단에는 뒤로가기 바(`.adm-mobile-bar`: `‹` 버튼 + 제목)를 표시해
네이티브 앱의 내비게이션처럼 동작시킵니다.

## 6. 그리드 축소 규칙

| 그리드 | 데스크톱 → 모바일 |
|------|------|
| 지점 카드 | 3열 → 1열 |
| 정비사례 | 2열 → 1열 |
| 블로그 피드 | 3열 → 2열 |
| 공지 카드 | 가로형(이미지+텍스트) → 세로 스택 (이미지 높이 180px) |
| 앨범 슬롯 | 5열 → 2열 |
| 고객 요약 행 | 5열 → 1열 스택 |
| 퀵메뉴 | 4열 유지 (520px 이하 관리자용만 3열) |

## 7. 필수 디테일

- iOS 안전 영역: 하단 고정 요소에 항상 `env(safe-area-inset-bottom)` 합산.
- 첫 화면 높이는 `100vh`와 `100svh` 병기 (모바일 주소창 대응).
- 가로 스크롤 금지: `body { overflow-x: hidden; }`
- 터치 대상 최소 42px (nav-btn min-height 42px, 목록 행 58px).
- 데스크톱(901px+)의 왼쪽 패널은 별도 블록에서 `clamp(px, vw/vh, px)`로
  모든 값을 화면 크기에 비례시켜 어떤 해상도에서도 같은 구도를 유지합니다
  (style.css 3349행 블록이 최종 우선).
