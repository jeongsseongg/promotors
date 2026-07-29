# Wanted Design System — 추출 레퍼런스

Figma 커뮤니티 파일 `Wanted Design System (Community).fig`를 디코딩해 정리한 참고 자료.
**앞으로 새 화면·새 컴포넌트·요청받은 리디자인에 적용하는 기본 시각 언어다.**
기존 운영 화면은 요청 범위 밖에서 자동 전환하지 않는다.

- 원본: `C:\Users\LS\Downloads\Wanted Design System (Community).fig` (46MB, ZIP + fig-kiwi + zstd)
- 추출: 노드 101,533개 · 컴포넌트 3,017개 · 변수 494개 · 스타일 544개
- 추출일: 2026-07-29

## 적용 원칙

- 기본 글꼴: 저장소의 `fonts/pretendard/` Pretendard. 원본 Figma의 Pretendard JP와 동일한 계열로 사용한다.
- 기본 모드: Light. 사용자가 다크 모드나 시스템 연동을 요청한 경우에만 Dark 토큰을 활성화한다.
- 주요 액션: `Primary/Normal`을 사용하고 한 화면의 주 CTA는 하나만 강조한다.
- 텍스트·배경·선: 고정 색상 대신 `Label/*`, `Background/*`, `Line/*` 시맨틱 토큰을 사용한다.
- 상태: 성공은 `Status/Positive`, 주의는 `Status/Cautionary`, 오류는 `Status/Negative`를 사용한다.
- 간격과 모서리: 추출된 값(`16px` 기본 gap, `20px` 플랫폼 margin, `14px` radius)을 우선하되, 기존 화면 수정은 주변 컴포넌트와의 일관성을 먼저 지킨다.
- 구현 토큰: `design-guidelines/wanted-tokens.css`. 폰트: `fonts/pretendard/pretendard.css`.

## 1. 색 (Semantic)

라이트/다크 두 모드 값이 모두 정의돼 있다.

| 토큰 | Light | Dark |
|---|---|---|
| `--wds-_deprecated-platform-ios-navigation1_3` | #FFFFFFB2 | #FFFFFF12 |
| `--wds-_deprecated-platform-ios-navigation2_3` | #FFFFFF | #FFFFFF59 |
| `--wds-_deprecated-platform-ios-navigation3_3` | #00000000 | #000000B2 |
| `--wds-accent-background-cyan` | #00BDDE | #28D0ED |
| `--wds-accent-background-light-blue` | #00AEFF | #3DC2FF |
| `--wds-accent-background-lime` | #58CF04 | #6BE016 |
| `--wds-accent-background-pink` | #F553DA | #FA73E3 |
| `--wds-accent-background-purple` | #CB59FF | #D478FF |
| `--wds-accent-background-red-orange` | #FF5E00 | #FF7B2E |
| `--wds-accent-background-violet` | #6541F2 | #7D5EF7 |
| `--wds-accent-cyan` | - | - |
| `--wds-accent-foreground-blue` | #005EEB | #4F95FF |
| `--wds-accent-foreground-cyan` | #0098B2 | #00BDDE |
| `--wds-accent-foreground-green` | #009632 | #1ED45A |
| `--wds-accent-foreground-light-blue` | #008DCF | #00AEFF |
| `--wds-accent-foreground-lime` | #429E00 | #58CF04 |
| `--wds-accent-foreground-orange` | #D17600 | #FF9200 |
| `--wds-accent-foreground-pink` | #E846CD | #FA73E3 |
| `--wds-accent-foreground-purple` | #AD36E3 | #D478FF |
| `--wds-accent-foreground-red` | #E52222 | #FF6363 |
| `--wds-accent-foreground-red-orange` | #F55A00 | #FF7B2E |
| `--wds-accent-foreground-violet` | #5B37ED | #9E86FC |
| `--wds-accent-violet` | - | - |
| `--wds-background-elevated-alternative` | #F7F7F8 | #141415 |
| `--wds-background-elevated-normal` | #FFFFFF | #212225 |
| `--wds-background-normal-alternative` | #F7F7F8 | #0F0F10 |
| `--wds-background-normal-normal` | #FFFFFF | #1B1C1E |
| `--wds-background-transparent-alternative` | #FFFFFF47 | #2122259C |
| `--wds-background-transparent-normal` | #FFFFFF14 | #2122259C |
| `--wds-fill-alternative` | #70737C0D | #70737C1F |
| `--wds-fill-normal` | #70737C14 | #70737C38 |
| `--wds-fill-strong` | #70737C29 | #70737C47 |
| `--wds-initial-black` | #000000 | #000000 |
| `--wds-initial-white` | #FFFFFF | #FFFFFF |
| `--wds-interaction-disable` | #F4F4F5 | #2E2F33 |
| `--wds-interaction-inactive` | #989BA2 | #5A5C63 |
| `--wds-inverse-background` | #1B1C1E | #FFFFFF |
| `--wds-inverse-label` | #F7F7F8 | #171719 |
| `--wds-inverse-primary` | #3385FF | #0066FF |
| `--wds-ios-accent-primary` | #0088FF | #0091FF |
| `--wds-ios-backgrounds-primary` | #FFFFFF | #000000 |
| `--wds-ios-colors-blue` | #007AFF | #0A84FF |
| `--wds-ios-colors-green` | #34C759 | #30D158 |
| `--wds-ios-colors-red` | #FF3B30 | #FF453A |
| `--wds-ios-fills-quaternary` | #74748014 | #7474802E |
| `--wds-ios-fills-secondary` | #78788029 | #78788052 |
| `--wds-ios-grays-white` | #FFFFFF | #FFFFFF |
| `--wds-ios-labels-primary` | #000000 | #FFFFFF |
| `--wds-ios-labelsvibrant-primary1_2` | #000000 | #00000000 |
| `--wds-ios-labelsvibrant-primary2_2` | #00000000 | #FFFFFF |
| `--wds-ios-labelsvibrant-tertiary1_2` | #00000040 | #00000000 |
| `--wds-ios-labelsvibrant-tertiary2_2` | #00000000 | #FFFFFF40 |
| `--wds-ios-materials-regular1_4-overlay` | #00000000 | #5F5F5F |
| `--wds-ios-materials-regular2_4-darken` | #00000008 | #00000000 |
| `--wds-ios-materials-regular3_4-colordodge` | #4D4D4D | #00000000 |
| `--wds-ios-materials-regular4_4` | #A9A9A9CC | #3B3B3BB2 |
| `--wds-ios-other-navigation-label1_3-softlight` | #B1B1B1 | #00000000 |
| `--wds-ios-other-navigation-label2_3` | #00000080 | #7F7F7FD9 |
| `--wds-ios-other-navigation-label3_3-screen` | #00000000 | #7F7F7F |
| `--wds-ios-separators-nonopaque` | #3C3C435C | #545458A6 |
| `--wds-label-alternative` | #37383C9C | #AEB0B69C |
| `--wds-label-assistive` | #37383C47 | #AEB0B647 |
| `--wds-label-disable` | #37383C29 | #989BA229 |
| `--wds-label-neutral` | #2E2F33E0 | #C2C4C8E0 |
| `--wds-label-normal` | #171719 | #F7F7F8 |
| `--wds-label-strong` | #000000 | #FFFFFF |
| `--wds-labels-vibrant-controls-primary` | #404040 | #BFBFBF |
| `--wds-line-normal-_strong` | #70737C85 | #C2C4C885 |
| `--wds-line-normal-alternative` | #70737C14 | #70737C38 |
| `--wds-line-normal-neutral` | #70737C29 | #70737C47 |
| `--wds-line-normal-normal` | #70737C38 | #70737C52 |
| `--wds-line-solid-_strong` | #AEB0B6 | #70737C |
| `--wds-line-solid-alternative` | #F4F4F5 | #2E2F33 |
| `--wds-line-solid-neutral` | #EAEBEC | #333438 |
| `--wds-line-solid-normal` | #E1E2E4 | #37383C |
| `--wds-macos-backgrounds-primary` | #FFFFFF | #000000 |
| `--wds-macos-control-bar-title` | #FAFAFACC | #3C3C3CCC |
| `--wds-macos-fills-virant-primary1_2` | #D9D9D9 | #00000000 |
| `--wds-macos-fills-virant-primary2_2` | #00000000 | #242424 |
| `--wds-macos-separators-vibrant1_2` | #0000001A | #00000000 |
| `--wds-macos-separators-vibrant2_2` | #00000000 | #FFFFFF1A |
| `--wds-macos-text-secondary` | #00000080 | #FFFFFF8C |
| `--wds-macos-text-tertiary` | #00000040 | #FFFFFF40 |
| `--wds-macos-textvibrant-secondary1_2` | #808080 | #00000000 |
| `--wds-macos-textvibrant-secondary2_2` | #00000000 | #7C7C7C |
| `--wds-macos-textvibrant-tertiary1_2` | #BFBFBF | #00000000 |
| `--wds-macos-textvibrant-tertiary2_2` | #00000000 | #414141 |
| `--wds-material-background-onbackground` | #1B1B1F | #E4E2E6 |
| `--wds-material-dimmer` | #17171985 | #171719BD |
| `--wds-material-outline-outline` | #74757F | #8F909A |

## 2. 타이포그래피

본문 폰트는 **Pretendard JP**. 로컬에 `C:\Users\LS\Downloads\프리텐다드\` 배포본(otf/woff/woff2/variable) 보유.

| 스타일 | 폰트 | 크기 | 행간 | 자간 |
|---|---|---|---|---|
| Body 1/Normal - Bold | Pretendard JP SemiBold | 16px | 1.5 | 0.56% |
| Label 1/Medium | Pretendard JP Medium | 14px | 1.429 | 1.45% |
| Body 2/Normal - Medium | Pretendard JP Medium | 15px | 1.467 | 0.96% |
| Label 1/Bold | Pretendard JP SemiBold | 14px | 1.429 | 1.45% |
| Body 2/Normal - Bold | Pretendard JP SemiBold | 15px | 1.467 | 0.96% |
| Label 2/Medium | Pretendard JP Medium | 13px | 1.385 | 1.92% |
| Body 1/Normal - Medium | Pretendard JP Medium | 16px | 1.5 | 0.56% |
| Caption 1/Medium | Pretendard JP Medium | 12px | 1.334 | 2.50% |
| Label 2/Bold | Pretendard JP SemiBold | 13px | 1.385 | 1.92% |
| Body 1/Normal - Bold | Pretendard JP SemiBold | 16px | 1.5 | 0.56% |
| Label 2/Medium | Pretendard JP Medium | 13px | 1.385 | 1.94% |
| Label 2/Regular | Pretendard JP Regular | 13px | 1.385 | 1.94% |
| Display 1/Bold | Pretendard JP Bold | 56px | 1.286 | -3.19% |
| Display 1/Medium | Pretendard JP Medium | 56px | 1.286 | -3.19% |
| Display 1/Regular | Pretendard JP Regular | 56px | 1.286 | -3.19% |
| Display 2/Regular | Pretendard JP Regular | 40px | 1.3 | -2.82% |
| Display 2/Bold | Pretendard JP Bold | 40px | 1.3 | -2.82% |
| Display 2/Medium | Pretendard JP Medium | 40px | 1.3 | -2.82% |
| Display 3/Bold | Pretendard JP Bold | 36px | 1.334 | -2.70% |
| Display 3/Medium | Pretendard JP Medium | 36px | 1.334 | -2.70% |
| Display 3/Regular | Pretendard JP Regular | 36px | 1.334 | -2.70% |
| Title 2/Bold | Pretendard JP Bold | 28px | 1.358 | -2.36% |
| Title 2/Medium | Pretendard JP Medium | 28px | 1.358 | -2.36% |
| Title 2/Regular | Pretendard JP Regular | 28px | 1.358 | -2.36% |
| Title 3/Bold | Pretendard JP Bold | 24px | 1.334 | -2.30% |
| Title 3/Medium | Pretendard JP Medium | 24px | 1.334 | -2.30% |
| Title 3/Regular | Pretendard JP Regular | 24px | 1.334 | -2.30% |
| Heading 1/Bold | Pretendard JP SemiBold | 22px | 1.364 | -1.94% |
| Heading 1/Medium | Pretendard JP Medium | 22px | 1.364 | -1.94% |
| Heading 1/Regular | Pretendard JP Regular | 22px | 1.364 | -1.94% |
| Heading 2/Bold | Pretendard JP SemiBold | 20px | 1.4 | -1.20% |
| Heading 2/Medium | Pretendard JP Medium | 20px | 1.4 | -1.20% |
| Heading 2/Regular | Pretendard JP Regular | 20px | 1.4 | -1.20% |
| Headline 1/Bold | Pretendard JP SemiBold | 18px | 1.445 | -0.02% |
| Headline 1/Medium | Pretendard JP Medium | 18px | 1.445 | -0.02% |
| Headline 1/Regular | Pretendard JP Regular | 18px | 1.445 | -0.02% |
| Headline 2/Bold | Pretendard JP SemiBold | 17px | 1.412 | 0.00% |
| Headline 2/Medium | Pretendard JP Medium | 17px | 1.412 | 0.00% |
| Headline 2/Regular | Pretendard JP Regular | 17px | 1.412 | 0.00% |
| Body 1/Normal - Regular | Pretendard JP Regular | 16px | 1.5 | 0.57% |
| Body 1/Normal - Medium | Pretendard JP Medium | 16px | 1.5 | 0.57% |
| Body 1/Normal - Bold | Pretendard JP SemiBold | 16px | 1.5 | 0.57% |
| Body 1/Reading - Regular | Pretendard JP Regular | 16px | 1.625 | 0.57% |
| Body 1/Reading - Medium | Pretendard JP Medium | 16px | 1.625 | 0.57% |
| Body 1/Reading - Bold | Pretendard JP SemiBold | 16px | 1.625 | 0.57% |
| Body 2/Normal - Regular | Pretendard JP Regular | 15px | 1.467 | 0.96% |
| Body 2/Normal - Medium | Pretendard JP Medium | 15px | 1.467 | 0.96% |
| Body 2/Reading - Regular | Pretendard JP Regular | 15px | 1.6 | 0.96% |
| Body 2/Reading - Medium | Pretendard JP Medium | 15px | 1.6 | 0.96% |
| Body 2/Reading - Bold | Pretendard JP SemiBold | 15px | 1.6 | 0.96% |
| Body 2/Normal - Bold | Pretendard JP SemiBold | 15px | 1.467 | 0.96% |
| Label 1/Normal - Bold | Pretendard JP SemiBold | 14px | 1.429 | 1.45% |
| Label 1/Normal - Medium | Pretendard JP Medium | 14px | 1.429 | 1.45% |
| Label 1/Normal - Regular | Pretendard JP Regular | 14px | 1.429 | 1.45% |
| Label 1/Reading - Bold | Pretendard JP SemiBold | 14px | 1.571 | 1.45% |
| Label 1/Reading - Medium | Pretendard JP Medium | 14px | 1.571 | 1.45% |
| Label 1/Reading - Regular | Pretendard JP Regular | 14px | 1.571 | 1.45% |
| Label 2/Regular | Pretendard JP Regular | 13px | 1.385 | 1.94% |
| Label 2/Medium | Pretendard JP Medium | 13px | 1.385 | 1.94% |
| Label 2/Bold | Pretendard JP SemiBold | 13px | 1.385 | 1.94% |
| Caption 1/Regular | Pretendard JP Regular | 12px | 1.334 | 2.52% |
| Caption 1/Medium | Pretendard JP Medium | 12px | 1.334 | 2.52% |
| Caption 1/Bold | Pretendard JP SemiBold | 12px | 1.334 | 2.52% |
| Caption 2/Regular | Pretendard JP Regular | 11px | 1.273 | 3.11% |
| Caption 2/Medium | Pretendard JP Medium | 11px | 1.273 | 3.11% |
| Caption 2/Bold | Pretendard JP SemiBold | 11px | 1.273 | 3.11% |
| Body 2/Normal - Bold | Pretendard JP SemiBold | 15px | 1.467 | 0.96% |
| Caption 1/Bold | Pretendard JP SemiBold | 12px | 1.334 | 2.52% |
| Caption 2/Bold | Pretendard JP SemiBold | 11px | 1.273 | 3.11% |
| Headline 2/Bold | Pretendard JP SemiBold | 17px | 1.412 | 0.00% |
| Body 1/Normal - Bold | Pretendard JP SemiBold | 16px | 1.5 | 0.57% |
| Label 1/Normal - Bold | Pretendard JP SemiBold | 14px | 1.429 | 1.45% |
| Label 1/Normal - Medium | Pretendard JP Medium | 14px | 1.429 | 1.45% |
| Body 1/Normal - Regular | Pretendard JP Regular | 16px | 1.5 | 0.57% |
| Body 1/Normal - Medium | Pretendard JP Medium | 16px | 1.5 | 0.57% |
| Caption 1/Medium | Pretendard JP Medium | 12px | 1.334 | 2.52% |
| Caption 2/Medium | Pretendard JP Medium | 11px | 1.273 | 3.11% |
| Caption 1/Regular | Pretendard JP Regular | 12px | 1.334 | 2.52% |
| Heading 2/Bold | Pretendard JP SemiBold | 20px | 1.4 | -1.20% |
| Title 1/Bold | Pretendard JP Bold | 36px | 1.334 | -2.70% |

## 3. 그리드

| 이름 | 설정 |
|---|---|
| Area/Icon Area | STRIPES 1col gutter 2 margin 0 | STRIPES 1col gutter 2 margin 0 | STRIPES 1col gutter 2 margin 0 | STRIPES 1col gutter 2 margin 0 | GRID 5col gutter 20 margin 0 |
| Margin(legacy)/Margin_4px | STRIPES 1col gutter 20 margin 0 | STRIPES 1col gutter 20 margin 0 | STRIPES 1col gutter 20 margin 0 | STRIPES 1col gutter 20 margin 0 |
| Area/Placeholder | STRIPES 1col gutter 20 margin 0 |
| Area/Fixed | STRIPES 1col gutter 20 margin 0 |
| Hello/Grid/Mobile | STRIPES 2col gutter 20 margin 20 |
| Hello/Grid/_Tablet | STRIPES 3col gutter 20 margin 20 |
| Hello/Grid/Desktop | STRIPES 12col gutter 20 margin 20 |
| Hello/Area/Placeholder | STRIPES 1col gutter 20 margin 0 |
| Hello/Area/Fixed | STRIPES 1col gutter 20 margin 0 |
| Grid/Mobile | STRIPES 2col gutter 20 margin 20 |
| Grid/Tablet | STRIPES 3col gutter 20 margin 20 |
| Grid/Desktop | STRIPES 12col gutter 20 margin 20 |
| Area/Placeholder | STRIPES 1col gutter 20 margin 0 |
| Area/Fixed | STRIPES 1col gutter 20 margin 0 |

## 4. 그림자 / 이펙트

| 이름 | 값 |
|---|---|
| Shadow/Strong | DROP_SHADOW x0 y0 blur4 #00000014 | DROP_SHADOW x0 y4 blur8 #00000014 | DROP_SHADOW x0 y6 blur12 #0000001F |
| iOS/Materials/Chrome | BACKGROUND_BLUR x0 y0.5 blur64 #0000004D |
| Semantic/Shadow/Normal | DROP_SHADOW x0 y0 blur1 #00000014 | DROP_SHADOW x0 y0 blur1 #00000014 | DROP_SHADOW x0 y1 blur2 #0000001F |
| Semantic/Shadow/Emphasize | DROP_SHADOW x0 y0 blur1 #00000014 | DROP_SHADOW x0 y1 blur4 #00000014 | DROP_SHADOW x0 y2 blur8 #0000001F |
| Semantic/Shadow/Strong | DROP_SHADOW x0 y0 blur4 #00000014 | DROP_SHADOW x0 y4 blur8 #00000014 | DROP_SHADOW x0 y6 blur12 #0000001F |
| Test/Shadow/_Bold | DROP_SHADOW x0 y0 blur4 #00000014 | DROP_SHADOW x0 y4 blur8 #00000014 | DROP_SHADOW x0 y8 blur16 #0000001F |
| Semantic/Shadow/Heavy | DROP_SHADOW x0 y0 blur8 #00000014 | DROP_SHADOW x0 y8 blur16 #00000014 | DROP_SHADOW x0 y16 blur20 #0000001F |
| macOS/Materials/Chrome | BACKGROUND_BLUR x0 y4 blur32 #00000040 |
| Background Blur | BACKGROUND_BLUR x0 y0.5 blur64 #0000004D |
| Shadow/Normal/Xsmall | DROP_SHADOW x0 y1 blur2 #1717171A |
| Shadow/Normal/Small | DROP_SHADOW x0 y4 blur6 #1717170F | DROP_SHADOW x0 y2 blur4 #1717170F |
| Shadow/Normal/Medium | DROP_SHADOW x0 y10 blur15 #17171712 | DROP_SHADOW x0 y4 blur6 #17171712 |
| Shadow/Normal/Large | DROP_SHADOW x0 y16 blur24 #17171714 | DROP_SHADOW x0 y6 blur10 #17171714 |
| Shadow/Normal/Xlarge | DROP_SHADOW x0 y24 blur38 #1717171F | DROP_SHADOW x0 y10 blur15 #1717171A |
| Shadow/Spread/Small | DROP_SHADOW x0 y0 blur60 #1717171A |
| Shadow/Spread/Medium | DROP_SHADOW x0 y15 blur75 #17171729 |
| Shadow styles/Normal/XSmall | DROP_SHADOW x0 y1 blur2 #1717171A |

## 5. 컴포넌트 그룹

| 그룹 | 개수 |
|---|---|
| Logo | 156 |
| Variant=Opacity | 60 |
| -=Null | 44 |
| Fill=False | 38 |
| Fill=True | 38 |
| Icon | 29 |
| Active=False | 20 |
| Active=True | 20 |
| Size=Small, Disable=False | 18 |
| Size=Small, Disable=True | 18 |
| Size=Medium, Disable=False | 17 |
| Size=Medium, Disable=True | 17 |
| Avatar | 16 |
| State=Hovered | 12 |
| State=Focused | 12 |
| State=Normal | 12 |
| Platform=Android | 12 |
| State=Pressed | 11 |
| Color=White | 11 |
| Menu | 10 |
| Color=Normal | 10 |
| Platform=Web | 10 |
| Type=Notch | 9 |
| Variant=Normal | 9 |
| Color=Black | 9 |
| Platform=iOS | 9 |
| Name=blank | 8 |
| Type=None | 8 |
| Slider | 8 |
| Ratio=1:1 | 7 |
| Type=Normal | 7 |
| Size=Large, Disable=False | 7 |
| Size=Large, Disable=True | 7 |
| Disable=False | 7 |
| Disable=True | 7 |
| Type=Compact | 7 |
| Modal | 7 |
| Variant=Icon | 7 |
| Cell | 7 |
| Variant=Custom | 7 |
| Ratio=1:2 | 6 |
| Variant=Default | 6 |
| -=Null | 6 |
| List Cell | 6 |
| Card | 6 |
| Status Bar | 6 |
| ᠎=᠎ | 5 |
| Tight=True | 5 |
| Type=Pill | 5 |
| Type=Gesture | 5 |
| Type=Button | 5 |
| Align=Center | 5 |
| Variant=Badge | 5 |
| Size=Small, State=Unchecked, Tight=False, Disable=False | 5 |
| Size=Small, State=Unchecked, Tight=False, Disable=True | 5 |
| Size=Small, State=Checked, Tight=False, Disable=False | 5 |
| Size=Small, State=Checked, Tight=False, Disable=True | 5 |
| Size=Small, State=Unchecked, Tight=True, Disable=False | 5 |
| Size=Small, State=Unchecked, Tight=True, Disable=True | 5 |
| Size=Small, State=Checked, Tight=True, Disable=False | 5 |
