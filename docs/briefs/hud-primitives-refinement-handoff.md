# HUD 디자인 프리미티브 정제 (전반 패스) — Claude Code 핸드오프 브리프

> 스펙 = Cowork. **구현·검증 = Claude Code.** **AGENTS.md 준수.**
> 브랜치 제안: `feature/hud-primitive-polish` → `dev` PR. (한 PR = 한 기능)

## 한 줄

HUD 프리미티브를 **표현 레벨에서** 한 바퀴 정제한다. 발단: 촘촘한 도플러 스펙트럼(.mat, ~64–128 bin)이 Chart에서 **점 마커에 묻혀 "구슬 목걸이"** 가 되고 라인이 안 보임. 마커 밀도·축 라벨·숫자 포맷·프리미티브 일관성을 손본다. **데이터 값은 절대 바꾸지 않는다(렌더만).**

## 근본 원인 (관측됨)

- **Chart 마커가 무조건 전부 그려짐.** `primitives.tsx` L399–408가 모든 포인트에 `<circle r="2.4">`. CSS는 도넛형(`.hud-chart-points circle { fill: var(--bg); stroke: currentColor; stroke-width: 1.5 }`, `styles.css` L558–562). viewBox 폭 160, `chartPoints` step=144/(n−1)이라 n=64면 포인트 간격 ≈2.3 < 마커 지름 4.8 → 겹쳐서 라인(`.hud-chart-line`, 글로우)을 덮음.
- **축 라벨이 raw float.** `Chart`가 `String(entries[0].x)`/마지막을 그대로 출력(L411–419) → "0.49219". y축은 그리드선(고정 y=18/36/54, L376)만 있고 **스케일 라벨 없음** → 그리드가 장식에 그침.

## 정제 항목 (프리미티브별)

### Chart — 최우선
1. **마커 밀도 처리.** 포인트가 많으면(예: n > ~16–24) 마커를 **숨기고** 라인만(촘촘한 스펙트럼은 깔끔한 라인/area로). 적은 포인트는 마커 유지(소수 추세 가독성). 또는 반경을 `min(2.4, step*0.4)`로 스케일. 도넛 대신 밀도 높을 땐 작은 솔리드 점/무마커.
2. **축 라벨 포맷.** 공유 `formatTick()`(≤3 유효숫자, 끝 0 제거, 비유한값 처리). x는 시작·중간·끝, **y는 min/max**(가능하면 mid)를 실제 데이터 값으로 라벨링해 그리드에 의미 부여.
3. **밀도 높아 마커를 끈 경우** area 옵션(이미 `.hud-chart-area` opacity 0.18 존재)을 살짝 깔면 라인 가독성↑ — 단 `kind`는 존중(자동 area는 line일 때만 보조적으로).

### Waveform
- polyline만이라 마커 문제 없음(OK). Chart와 **축/라벨 처리 일관성**만 맞추면 됨(필요 시 진폭·구간 컨텍스트). 우선순위 낮음.

### Gauge
- readout가 `{displayValue}` raw(L206) → 긴 소수 가능. 공유 `formatNumber()` 적용. 틱/포인터는 유지.

### Stat
- value(L315)·delta(L319–322) raw. 숫자값/델타에 `formatNumber()` 적용(문자열은 그대로). (스크린샷의 Stat "PEAK"가 KeyValue "Peak" 행과 **중복**되는 건 생성 선택 문제 — 프리미티브가 아님. design-system 가이드에 "동일 수치를 Stat+KeyValue로 중복하지 말 것" 한 줄 추가 검토.)

### PieChart
- 중앙 텍스트가 **슬라이스 개수**(`safeSlices.length`, L282–284)라 "total"로 오해 소지. 총합 값/최대 점유율/명시 라벨 중 하나로 명확화. 레전드는 OK.

### Steps
- `description`를 **버림**(L337–346은 name만 렌더). 선택적 2차 라인으로 `description` 표시(도구 진행 HUD에서도 쓰임). 점(dot) 상태는 유지.

### KeyValue
- 숫자 `v`는 선택적으로 `formatNumber()`. 그 외 OK.

### 공통(cross-cutting)
- **공유 숫자 포맷 헬퍼** `formatNumber(value,{maxSig?})` (또는 작은 util) — Chart 라벨·Gauge·Stat·KeyValue가 공용. 끝 0 제거, 유효숫자 캡, 비유한값 안전.
- **빈 상태** 문구/스타일 통일("No data/No slices/No steps/No samples/No items").
- 상태 색(stable/info/caution/critical) 의미 유지, **토큰만**(raw 색 금지).

## 제약 (AGENTS)

- **표현 전용 — 데이터 값 변경 금지**(deterministic). 포맷/반올림은 라벨 표시에만, 원본 `data.*`는 불변.
- 디자인 토큰·허용 컴포넌트만. **외부 라이브러리 금지**(차트도 손 SVG 유지). iframe 격리·자기치유 계약 불변.
- **생성기/검증기 동기화:** 가능하면 **자동/휴리스틱(밀도 기반)** 으로 처리해 **새 JSX prop 없이** 끝내라 → `HUD_SYSTEM_PROMPT`·검증기 손 안 댐. 부득이 prop을 추가하면(예: Chart `showPoints`) `lib/hudGenerator.ts`(허용 props·`assertValidHudJsx`)·`HUD_SYSTEM_PROMPT`·`docs/design-system.md`를 **함께** 갱신하고 `assertValidHudJsx` 그린 유지.

## 검증 (완료 선언 전, 네가 먼저 통과)

```
cd web
npm run typecheck && npm run lint && npm run test && npm run build
```
- **시각 확인:** `/gallery` 라우트(`web/src/Gallery.tsx`)가 모든 프리미티브를 렌더 → before/after 눈으로 확인. **촘촘한(64–128pt) 스펙트럼 Chart 픽스처를 갤러리에 추가**해 구슬 목걸이가 사라지고 라인/area가 깔끔히 읽히는지 증명.
- 원 사례 재현: "드론 탐지 레이더 .mat 도플러 스펙트럼" 다시 띄워 정상 확인.
- `web/src/hud/primitives.test.tsx` 갱신/추가: 촘촘한 Chart는 마커 비표시, `formatTick`/`formatNumber` 출력, Steps가 description 렌더, 축 라벨 포맷.
- **환각 없음:** 라벨은 데이터에서 파생된 표시값일 뿐, 원본 값/배열 불변.

## 파일 (예상)

- `web/src/hud/primitives.tsx` — Chart 마커·축 라벨·`formatNumber`/`formatTick`, Gauge/Stat/Steps/PieChart 정제.
- `web/src/hud/styles.css` — `.hud-chart-points`, `.hud-chart-xlabels`, 새 y-라벨 클래스.
- `web/src/Gallery.tsx` — 촘촘 스펙트럼 픽스처.
- `web/src/hud/primitives.test.tsx` — 테스트.
- (prop 추가 시에만) `web/src/lib/hudGenerator.ts` + `HUD_SYSTEM_PROMPT` + `docs/design-system.md`.

---

## 붙여넣기용 프롬프트 (패턴 A)

```
[맥락] AGENTS.md, docs/design-system.md, docs/briefs/hud-primitives-refinement-handoff.md를 먼저 읽어.
       generative HUD 자비스의 디자인 프리미티브를 표현 레벨에서 한 바퀴 정제한다. 발단:
       촘촘한 도플러 스펙트럼(~64–128pt)이 Chart에서 점 마커에 묻혀 "구슬 목걸이"가 되고
       라인이 안 보인다. 마커 밀도·축 라벨·숫자 포맷·프리미티브 일관성을 손본다.
[목표] 브리프의 "정제 항목"을 구현. Chart 마커 밀도 처리 + 축 라벨/숫자 포맷(formatNumber/
       formatTick 공용 헬퍼)을 최우선으로, 이어 Gauge/Stat/Steps/PieChart/빈상태 일관성.
       데이터 값은 절대 바꾸지 말고(렌더만), 가능하면 자동/휴리스틱으로 새 JSX prop 없이.
[제약] 디자인 토큰·허용 컴포넌트만. 외부 라이브러리 금지(손 SVG 유지). iframe 샌드박스/자기치유
       불변. prop을 추가해야 하면 hudGenerator.ts(검증기)+HUD_SYSTEM_PROMPT+design-system.md 동시 갱신.
[검증] typecheck/lint/test/build 통과 + /gallery에 촘촘 스펙트럼 픽스처 추가해 시각 확인,
       원 사례(.mat 도플러) 재현, primitives.test.tsx 갱신. 결과/스크린샷 근거를 보고.
[출력] feature/hud-primitive-polish 브랜치, 작은 커밋. 변경 요약 + 검증 로그.
```
