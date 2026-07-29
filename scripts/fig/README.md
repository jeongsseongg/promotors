# .fig 읽기 도구

Figma `.fig` 파일을 외부 라이브러리 없이 디코딩한다. Node 22.15+ / 24 필요 (내장 zstd 사용).

## 파일 구조

`.fig` = ZIP 컨테이너
- `canvas.fig` — 본문. `fig-kiwi` 매직 + uint32 버전 + `[uint32 길이 + 압축 청크]` 반복
  - 청크 1 = kiwi 스키마 (raw deflate) — 파일이 스키마를 자체 포함하므로 Figma 스키마를 몰라도 읽힌다
  - 청크 2 = 노드 데이터 (**zstd**, 구형 파일은 deflate)
- `thumbnail.png`, `meta.json`, `images/` — 미리보기·메타·이미지 에셋

## 사용법

```bash
node scripts/fig/decode-fig.js <파일.fig에서 뽑은 canvas.fig> <출력폴더>
node scripts/fig/build-tokens.js <출력폴더> <토큰출력폴더>
```

1단계가 `canvas.json`(전체 노드 덤프)과 `schema-defs.json`을 만들고,
2단계가 거기서 `wanted-tokens.css` + `05-wanted-design-system.md` 형태의 토큰 문서를 만든다.

`canvas.json`은 크다(예: 6.5MB .fig → 170MB JSON). 저장소에 커밋하지 말 것 —
필요하면 원본 `.fig`에서 다시 생성한다.

## 주의

- 벡터 좌표·레이아웃 값까지 전부 읽히지만 **렌더링은 못 한다**. 시안 모양은 `thumbnail.png`로만 확인.
- 변수 세트(`VARIABLE_SET`)는 `key`가 세트 간 중복된다. 변수의 모드 ID로 실제 소속 세트를 판별해야 한다
  (`build-tokens.js`의 `pickSet`).
