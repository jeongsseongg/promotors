/* canvas.json -> 디자인 토큰 산출물 (CSS 변수 + 마크다운 레퍼런스) */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const outDir = process.argv[3];
const root = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8'));
const nodes = root.nodeChanges || [];

const gkey = g => g ? `${g.sessionID}:${g.localID}` : '';
const hex = c => {
  if (!c) return null;
  const to = v => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255).toString(16).padStart(2, '0');
  const a = c.a ?? 1;
  return ('#' + to(c.r) + to(c.g) + to(c.b) + (a < 0.999 ? to(a) : '')).toUpperCase();
};
const slug = s => String(s).trim().toLowerCase()
  .replace(/[^\w\s/-]/g, '').replace(/[\s/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/* ---- 변수 세트 / 모드 ----
   주의: key 가 세트 간 중복된다(같은 key 를 쓰는 "Semantic Color"/"Color" 등).
   따라서 ref 하나에 후보 여러 개를 담고, 변수의 모드 ID 로 실제 세트를 골라낸다. */
const setCandidates = new Map();
const addCandidate = (ref, entry) => {
  if (!ref) return;
  if (!setCandidates.has(ref)) setCandidates.set(ref, []);
  setCandidates.get(ref).push(entry);
};
const allSets = [];
for (const n of nodes.filter(x => x.type === 'VARIABLE_SET')) {
  const entry = {
    name: n.name,
    key: n.key,
    guid: gkey(n.guid),
    modes: (n.variableSetModes || []).map(m => ({ id: gkey(m.id), name: m.name }))
  };
  allSets.push(entry);
  addCandidate(n.key, entry);
  addCandidate(entry.guid, entry);
}
const pickSet = (ref, modeIds) => {
  const candidates = setCandidates.get(ref) || [];
  if (candidates.length <= 1) return candidates[0] || null;
  const hit = candidates.find(c => modeIds.every(id => c.modes.some(m => m.id === id)));
  return hit || candidates[0];
};

/* ---- 변수 ---- */
const varsByGuid = new Map();
const variables = [];
for (const n of nodes.filter(x => x.type === 'VARIABLE')) {
  const setRef = n.variableSetID?.assetRef?.key || gkey(n.variableSetID?.guid);
  const modeIds = (n.variableDataValues?.entries || []).map(e => gkey(e.modeID));
  const set = pickSet(setRef, modeIds);
  const entry = {
    guid: gkey(n.guid),
    key: n.key,
    name: n.name,
    type: n.variableResolvedType,
    set: set ? set.name : '(unknown)',
    setRef,
    setModes: set ? set.modes : [],
    modes: {}
  };
  for (const e of (n.variableDataValues?.entries || [])) {
    const v = e.variableData?.value || {};
    let out = null;
    if (v.colorValue) out = hex(v.colorValue);
    else if (v.floatValue !== undefined) out = v.floatValue;
    else if (v.textValue !== undefined) out = v.textValue;
    else if (v.boolValue !== undefined) out = v.boolValue;
    else if (v.alias) out = { aliasGuid: gkey(v.alias.guid) };
    entry.modes[gkey(e.modeID)] = out;
  }
  varsByGuid.set(entry.guid, entry);
  variables.push(entry);
}
/* alias 해석 — 같은 모드 이름(Light/Dark)을 따라가며 체인을 푼다.
   다른 세트를 가리키는 별칭이 많아서, 모드 이름이 안 맞으면 첫 모드로 폴백한다. */
const pickModeValue = (target, which) => {
  const re = which === 'light' ? /light/i : which === 'dark' ? /dark/i : null;
  const id = re ? target.setModes.find(m => re.test(m.name))?.id : null;
  return (id && target.modes[id] !== undefined) ? target.modes[id] : Object.values(target.modes)[0];
};
const resolve = (val, which = 'first', depth = 0, seen = new Set()) => {
  if (val && typeof val === 'object' && val.aliasGuid) {
    if (depth > 12 || seen.has(val.aliasGuid)) return null;
    seen.add(val.aliasGuid);
    const target = varsByGuid.get(val.aliasGuid);
    if (!target) return null;
    return resolve(pickModeValue(target, which), which, depth + 1, seen);
  }
  return (val === undefined || (val && typeof val === 'object')) ? null : val;
};

/* ---- 스타일 ---- */
const styles = nodes.filter(x => x.styleType);
const textStyles = styles.filter(s => s.styleType === 'TEXT').map(s => ({
  name: s.name,
  family: s.fontName?.family || '',
  style: s.fontName?.style || '',
  size: s.fontSize,
  lineHeight: s.lineHeight?.value !== undefined
    ? `${Number(s.lineHeight.value).toFixed(3).replace(/\.?0+$/, '')}${s.lineHeight.units === 'PERCENT' ? '%' : s.lineHeight.units === 'RAW' ? '' : 'px'}`
    : '',
  letterSpacing: s.letterSpacing?.value !== undefined ? `${Number(s.letterSpacing.value).toFixed(2)}${s.letterSpacing.units === 'PERCENT' ? '%' : 'px'}` : ''
}));
const fillStyles = styles.filter(s => s.styleType === 'FILL').map(s => ({
  name: s.name,
  color: (s.fillPaints || []).filter(p => p.type === 'SOLID').map(p => hex(p.color)).join(', ')
}));
const gridStyles = styles.filter(s => s.styleType === 'GRID').map(s => ({
  name: s.name,
  layout: (s.layoutGrids || []).map(g => `${g.pattern || g.type || ''} ${g.numSections ? g.numSections + 'col' : ''} gutter ${g.gutterSize ?? '-'} margin ${g.offset ?? '-'}`.trim()).join(' | ')
}));
const effectStyles = styles.filter(s => s.styleType === 'EFFECT').map(s => ({
  name: s.name,
  effects: (s.effects || []).map(e => `${e.type} x${e.offset?.x ?? 0} y${e.offset?.y ?? 0} blur${e.radius ?? 0} ${hex(e.color) || ''}`).join(' | ')
}));

/* ---- 컴포넌트 ---- */
const components = nodes.filter(x => x.type === 'SYMBOL' && x.name).map(x => x.name);
const componentGroups = new Map();
for (const c of components) {
  const head = c.split('/')[0].trim();
  componentGroups.set(head, (componentGroups.get(head) || 0) + 1);
}

/* ---- CSS 산출 ---- */
const modeOf = (v, re) => v.setModes.find(m => re.test(m.name))?.id;
const isThemed = v => !!modeOf(v, /light/i) && !!modeOf(v, /dark/i);

const semantic = variables.filter(v => v.type === 'COLOR' && isThemed(v));
const paletteVars = variables.filter(v => v.type === 'COLOR' && !isThemed(v));
const numberVars = variables.filter(v => v.type === 'FLOAT');
const lightMode = { name: 'Light' };
const darkMode = { name: 'Dark' };

const valueFor = (v, which) => {
  const id = which === 'light' ? modeOf(v, /light/i) : which === 'dark' ? modeOf(v, /dark/i) : null;
  return resolve(v.modes[id] ?? Object.values(v.modes)[0], which);
};
/* 같은 토큰 이름이 여러 세트에 존재한다. 해석되는 값만 채택하고 이름당 1줄만 남긴다. */
const cssBlock = (vars, which, indent = '  ') => {
  const map = new Map();
  for (const v of vars) {
    const raw = valueFor(v, which);
    if (raw === null || raw === undefined || typeof raw === 'object') continue;
    map.set(slug(v.name), raw);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, val]) => `${indent}--wds-${k}: ${val};`).join('\n');
};

const css = `/* Wanted Design System (Community) — 추출 토큰
   출처: Wanted Design System (Community).fig (Figma 커뮤니티 파일)
   추출일: ${new Date().toISOString().slice(0, 10)} · 노드 ${nodes.length.toLocaleString()}개 파싱
   ※ 앞으로 새 UI에 사용하는 기본 토큰. 기존 운영 화면에는 요청 범위에서만 import한다. */

:root,
:root[data-theme="light"] {
  /* ---------- Semantic Color · Light ---------- */
${cssBlock(semantic, 'light')}
}

/* 다크 모드는 페이지가 data-theme="dark"를 명시할 때 활성화한다. */
:root[data-theme="dark"] {
  /* ---------- Semantic Color · Dark ---------- */
${cssBlock(semantic, 'dark', '    ')}
}

:root {
  /* ---------- Atomic / Palette ---------- */
${cssBlock(paletteVars, 'first')}
}

:root {
  /* ---------- Number tokens (spacing / radius 등) ---------- */
${(() => {
  const map = new Map();
  for (const v of numberVars) {
    const raw = resolve(Object.values(v.modes)[0], 'first');
    if (typeof raw !== 'number') continue;
    /* opacity 계열은 길이 단위가 아니다 */
    const unitless = /opacity|weight|ratio|scale|count|z-?index/i.test(v.name);
    map.set(slug(v.name), `${raw}${unitless ? '' : 'px'}`);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, val]) => `  --wds-${k}: ${val};`).join('\n');
})()}
}

:root {
  /* ---------- Canonical typography · 5 levels ---------- */
  --wds-font-family: var(--font-pretendard, 'Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif);
  --wds-font-display-size: 56px;
  --wds-font-display-line-height: 1.286;
  --wds-font-display-letter-spacing: -0.0319em;
  --wds-font-title-size: 36px;
  --wds-font-title-line-height: 1.334;
  --wds-font-title-letter-spacing: -0.027em;
  --wds-font-heading-size: 22px;
  --wds-font-heading-line-height: 1.364;
  --wds-font-heading-letter-spacing: -0.0194em;
  --wds-font-body-size: 16px;
  --wds-font-body-line-height: 1.5;
  --wds-font-body-letter-spacing: 0.0057em;
  --wds-font-label-size: 14px;
  --wds-font-label-line-height: 1.429;
  --wds-font-label-letter-spacing: 0.0145em;
}
`;

fs.writeFileSync(path.join(outDir, 'wanted-tokens.css'), css, 'utf8');

/* ---- 마크다운 레퍼런스 ---- */
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

const md = `# Wanted Design System — 추출 레퍼런스

Figma 커뮤니티 파일 \`Wanted Design System (Community).fig\`를 디코딩해 정리한 참고 자료.
**앞으로 새 화면·새 컴포넌트·요청받은 리디자인에 적용하는 기본 시각 언어다.**
기존 운영 화면은 요청 범위 밖에서 자동 전환하지 않는다.

- 원본: \`C:\\Users\\LS\\Downloads\\Wanted Design System (Community).fig\` (46MB, ZIP + fig-kiwi + zstd)
- 추출: 노드 ${nodes.length.toLocaleString()}개 · 컴포넌트 ${components.length.toLocaleString()}개 · 변수 ${variables.length}개 · 스타일 ${styles.length}개
- 추출일: ${new Date().toISOString().slice(0, 10)}

## 적용 원칙

- 기본 글꼴: 저장소의 \`fonts/pretendard/\` Pretendard. 원본 Figma의 Pretendard JP와 동일한 계열로 사용한다.
- 기본 모드: Light. 사용자가 다크 모드나 시스템 연동을 요청한 경우에만 Dark 토큰을 활성화한다.
- 주요 액션: \`Primary/Normal\`을 사용하고 한 화면의 주 CTA는 하나만 강조한다.
- 텍스트·배경·선: 고정 색상 대신 \`Label/*\`, \`Background/*\`, \`Line/*\` 시맨틱 토큰을 사용한다.
- 상태: 성공은 \`Status/Positive\`, 주의는 \`Status/Cautionary\`, 오류는 \`Status/Negative\`를 사용한다.
- 간격과 모서리: 추출된 값(\`16px\` 기본 gap, \`20px\` 플랫폼 margin, \`14px\` radius)을 우선하되, 기존 화면 수정은 주변 컴포넌트와의 일관성을 먼저 지킨다.
- 구현 토큰: \`design-guidelines/wanted-tokens.css\`. 폰트: \`fonts/pretendard/pretendard.css\`.

## 1. 색 (Semantic)

라이트/다크 두 모드 값이 모두 정의돼 있다.

${table(['토큰', 'Light', 'Dark'], [...new Map(
  /* 같은 이름이 여러 세트에 있다. Map은 뒤 항목이 이기므로,
     실제 색으로 해석되는 정의를 뒤에 오도록 정렬해 그것이 채택되게 한다. */
  [...semantic].sort((a, b) => (valueFor(a, 'light') ? 1 : 0) - (valueFor(b, 'light') ? 1 : 0))
    .map(v => [slug(v.name), v])
).values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 90).map(v => [
  `\`--wds-${slug(v.name)}\``,
  String(valueFor(v, 'light') ?? '-'),
  String(valueFor(v, 'dark') ?? '-')
]))}

## 2. 타이포그래피

본문 폰트는 **Pretendard JP**. 로컬에 \`C:\\Users\\LS\\Downloads\\프리텐다드\\\` 배포본(otf/woff/woff2/variable) 보유.

${table(['스타일', '폰트', '크기', '행간', '자간'], textStyles.slice(0, 80).map(s => [s.name, `${s.family} ${s.style}`, `${s.size}px`, s.lineHeight, s.letterSpacing]))}

## 3. 그리드

${gridStyles.length ? table(['이름', '설정'], gridStyles.map(g => [g.name, g.layout || '-'])) : '(그리드 스타일 없음)'}

## 4. 그림자 / 이펙트

${effectStyles.length ? table(['이름', '값'], effectStyles.slice(0, 40).map(e => [e.name, e.effects || '-'])) : '(이펙트 스타일 없음)'}

## 5. 컴포넌트 그룹

${table(['그룹', '개수'], [...componentGroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => [k, String(v)]))}
`;

fs.writeFileSync(path.join(outDir, '05-wanted-design-system.md'), md, 'utf8');

console.log(JSON.stringify({
  semantic: semantic.length,
  palette: paletteVars.length,
  numbers: numberVars.length,
  textStyles: textStyles.length,
  fillStyles: fillStyles.length,
  gridStyles: gridStyles.length,
  effectStyles: effectStyles.length,
  components: components.length,
  lightMode: lightMode?.name,
  darkMode: darkMode?.name,
  cssBytes: css.length,
  mdBytes: md.length
}, null, 2));
