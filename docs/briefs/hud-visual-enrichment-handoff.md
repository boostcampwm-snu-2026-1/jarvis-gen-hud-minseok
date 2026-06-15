# HUD 시각 언어 풍부화 (Tier 2) — Claude Code 핸드오프 브리프

> 스펙 = Cowork. **구현·검증 = Claude Code.** **AGENTS.md 준수.**
> 브랜치 제안: `feature/hud-visual-enrichment` → `dev` PR.
> **선행/연계:** `docs/briefs/hud-primitives-refinement-handoff.md`(Chart 마커·축·`formatNumber`). 그 정제 패스를 **먼저** 끝내고(또는 같은 PR 앞부분) 이 위에 얹어라 — 중복 구현 금지.

## 한 줄

generative HUD의 시각 언어를 레퍼런스("FUTURISTIC HUD in jarvis style" — LMNTRIX SOC 대시보드) 수준으로 **다채롭게**. 단 우리 **토큰·스코프·절제된 생성** 원칙 안에서. = 비의미 색 팔레트 추가(Tier 1) + 신규 프리미티브 3종(Tier 2).

## 목표 미감 (레퍼런스에서 가져올 것)

- **동심원 레이더 KPI** — 중앙 큰 숫자("47 INCIDENTS") + 동심 틱/세그먼트 링.
- **허브 둘레 카테고리 스포크** — ATT&CK 식(Initial Access…Lateral Movement) 각 항목 값+상태, 중앙 합계.
- **heat-gradient 바**(값→쿨·웜), **멀티휴 스파크라인** 행, 아이콘 스탯 타일.
- 청록 베이스 + 앰버/레드/그린 악센트의 "다채로움".

> ⚠️ **LMNTRIX를 그대로 복제하지 마라.** 우리 토큰·프리미티브로 재해석한다. 정보밀도 > 장식.

## 핵심 원칙 — 색 의미축 보호 (가장 중요)

현재 `--series-0~4`는 사실상 청록-파랑 단색계. 레퍼런스의 빨강 막대는 "값이 큼"(heat)이지만, **우리 시스템에서 빨강 = `critical`(경고)**. 그냥 다색을 넣으면 의미축이 깨진다.

- 상태색(stable/info/caution/critical)은 **의미 전용 — 풍부함을 위해 절대 재사용 금지.**
- `tokens.css`에 **비의미 팔레트 2종** 신설:
  - `--seq-0..N` — **sequential/heat ramp**(크기·강도; 쿨→웜). heat 바·밀도 색에만.
  - `--cat-0..7` — **categorical**(다중 시리즈/카테고리 구분; 청록 외 인디고·민트·바이올렛·앰버 등 ≥6).
- 규칙: 빨강 막대 = '값 큼'은 **`--seq-*`로**, `--state-critical` 아님. 다중 시리즈는 **`--cat-*`**. 상태는 여전히 `state` prop으로만.
- `design-system.md` §0/§1/§2에 이 **분리**를 명문화.

## Tier 1 — 기존 프리미티브 강화 (검증기/프롬프트 최소 변경)

- `tokens.css`: `--seq-*`, `--cat-*` 추가(+ design-system.md 반영).
- **Chart:** 다중 시리즈(선택) + `kind="bar"` **heat 모드**(값→`--seq-*` 램프). 마커/축/area 정제는 선행 브리프 따름.
- **Gauge:** 동심 틱 링 + 세그먼트 아크(레이더 질감). 토큰만.
- **PieChart:** 이미 `hud-pie-radar` 백드롭 있음 — 중앙에 **KPI 값** 표시(슬라이스 개수 아님), 톤 정리.
- **Waveform:** 멀티휴/그라디언트 스트로크 옵션(`--seq-*`).

## Tier 2 — 신규 프리미티브 3종 (전체 체인 동기화)

> **prop 이름은 기존 검증기 허용군(`value`/`items`/`samples`/`label`/`state`/`unit`)을 재사용**해 `assertValidHudJsx` 정규식 변경을 최소화할 것. (검증기는 `items|steps|samples|data|slices`가 `data.*`를 참조하는지, 숫자 하드코딩이 없는지를 prop명으로 검사한다.)

### RadialMeter — 동심 레이더 KPI
- 용도: 단일 핵심 수치 + 맥락("47 INCIDENTS").
- props: `value:number; max?:number; label?:string; unit?:string; state?:State;` (중앙 readout = value, 링 채움 = value/max). 손 SVG: 동심 틱 링 + 진행 아크 + 중앙 값.

### Sparkline — 인라인 미니 트렌드
- 용도: 스탯 행/타일 옆 작은 추세(축·마커 없음).
- props: `samples:number[]; state?:State; label?:string;` (samples = `data.*`). Waveform에서 chrome 제거판.

### RadialBreakdown — 허브 둘레 카테고리 스포크 (ATT&CK 룩)
- 용도: 카테고리별 값 분해 + 중앙 합계.
- props: `items:{label,value,state?}[]; label?:string; unit?:string;` (items = `data.*`). 손 SVG: 균등 각도 배치, 스포크별 라벨+값. 색은 **상태일 때만 state 색, 아니면 `--cat-*`**, 중앙 total.

## 신규 프리미티브 동기화 체크리스트 (3종 각각)

1. `web/src/hud/primitives.tsx` — 컴포넌트 + props 인터페이스 + export.
2. `web/src/hud/index.ts` — 컴포넌트·타입 export.
3. `web/src/lib/hudGenerator.ts`:
   - `ALLOWED_COMPONENTS`에 추가.
   - `hasVisualPrimitive` 집합에 추가(이것만으로 구성된 HUD가 "시각 프리미티브 필수" 검사 통과).
   - `assertValidHudJsx`/`assertValidHudDesign`가 새 prop과 충돌 안 하는지 확인(기존 prop명 재사용 시 통과). 새 배열 prop을 쓰면 `items|steps|samples|data|slices` 허용군에 추가.
4. **`HUD_SYSTEM_PROMPT`**(hudGenerator.ts): 허용 컴포넌트 목록·컴포넌트별 props 한 줄·**archetype map** 갱신(single-KPI→RadialMeter; category-around-hub→RadialBreakdown; inline-trend→Sparkline) + 색 가이드(비의미 다색=seq/cat, 상태=state).
5. `web/src/hud/styles.css` — 토큰 기반 스타일(+신규 팔레트).
6. `web/src/Gallery.tsx` — 신규 3종 픽스처 + 레퍼런스풍 합성 1장.
7. `web/src/hud/primitives.test.tsx` — 렌더·prop 폴백·검증기 통과 테스트.
8. `docs/design-system.md` — §1 토큰(신규 팔레트), §4 카탈로그(신규 3종), §0/§2 색 분리 원칙.

## 제약 (AGENTS)

- 토큰만, raw 색·inline style·외부 라이브러리 금지(손 SVG). 데이터는 props(deterministic, **값 불변**).
- iframe 샌드박스·자기치유 계약 불변(신규 컴포넌트는 **스코프만 확장**).
- 한 HUD = 최상위 `Panel` 1개/그리드. **절제:** HUD당 2–4 프리미티브, 그래픽 우선, 색은 팔레트로(난수 state 금지).
- **평가 핵심(절제된 생성) 유지** — 풍부함이 잡탕이 되지 않게.

## 검증 (완료 선언 전, 네가 먼저 통과)

```
cd web
npm run typecheck && npm run lint && npm run test && npm run build
```
- `/gallery`에 신규 3종 + 레퍼런스풍 합성 + 다중시리즈/heat Chart 픽스처 추가 → before/after 시각 확인.
- **자기치유:** 신규 컴포넌트/prop로도 검증기·재생성·폴백 정상.
- **색 의미 회귀:** heat/다색이 `--seq-*`/`--cat-*`만 쓰고 상태색(`--state-*`)을 침범 안 하는지 코드/스냅샷 점검.
- **환각 없음:** 신규 프리미티브도 값/배열 `data.*` 참조, 원본 불변.
- **실제 생성:** "인시던트 카테고리 분해", "센서 KPI 한 개", "주간 추세 스파크라인" 류 프롬프트로 새 프리미티브가 자연 선택되는지(archetype map 동작) 확인.

## 파일

`web/src/styles/tokens.css` · `web/src/hud/primitives.tsx` · `web/src/hud/index.ts` · `web/src/hud/styles.css` · `web/src/lib/hudGenerator.ts`(+`HUD_SYSTEM_PROMPT`) · `web/src/Gallery.tsx` · `web/src/hud/primitives.test.tsx` · `docs/design-system.md`.

---

## Tier 0 — Anti-plain 생성 가이드 (실측 케이스: "신호처리 파이프라인" HUD)

새 프리미티브·팔레트를 줘도 **생성기가 리스트+표+무의미 차트로 조합하면 여전히 밋밋하다.** 진짜 레버는 `HUD_SYSTEM_PROMPT`의 **조합 규칙**. 아래는 실제로 plain하게 나온 케이스의 진단·수정이며, **Tier 1/2보다 먼저(또는 같이) 적용**하면 효과가 가장 크다.

**왜 plain한가 (관측):**
- **동일 리스트 3중복** — Steps(9단계) + Chart("Pipeline Order") + KeyValue(같은 9단계→설명). 정보 한 줌이 세 번.
- **무의미 Chart** — 단계 순서(1…9)를 선으로 그려 평평한 라인 + 깨진 축(1/1·5·9). 정량 아닌 **ordinal을 Chart로 오용** → "그래픽처럼 생겼는데 정보 0".
- **단색** — 9 Step이 전부 같은 cyan 점. 파이프라인은 상태(done/active/Partial/commented)가 있는데 Steps `state` 미할당.
- 결과: 그래픽 밀도↓ + 색·의미↓ + 텍스트 표 위주 = 확장된 label-table.

**수정 (HUD_SYSTEM_PROMPT + Steps):**
1. **상태가 있는 항목엔 반드시 `state` 부여** — Steps 각 단계에 done/active/caution(=Partial)/pending(미구현) → 단계별 색·의미가 한 번에(단색 방지). Steps는 `description`도 렌더(선행 refinement 브리프) → **KeyValue 중복 제거**.
2. **ordinal/순서를 Chart·Waveform으로 만들지 말 것.** "단계 인덱스 1..N", "목록 순번"은 정량 시리즈가 아니다. 진행 요약이 필요하면 **RadialMeter/Stat("7/9 stages active")** 또는 **RadialBreakdown(단계 상태 분포)**.
3. **같은 데이터 중복 표시 금지** — 한 리스트를 Steps+Chart+KeyValue로 반복하지 말고, **상태·설명 포함 Steps 1개 + 요약 그래픽 1개**.
4. **anti-label-table 강화** — 기존 규칙은 "KeyValue-only 금지"뿐이라 **Steps+KeyValue 조합이 우회**한다. 규칙을 "텍스트 리스트(Steps/KeyValue) 합이 HUD의 주内容이면 안 됨 — 최소 1개 graphic/지표 프리미티브를 lead로" 로 확장.
5. **프로세스/파이프라인 아키타입 추가**(archetype map): `process/pipeline status → 상태색 Steps(설명 포함) + 요약 RadialMeter/Stat`. ordinal-Chart·중복-list 금지 명시.

**검증 추가:** "신호처리 파이프라인 시각화" 프롬프트를 재생성해 (a) 무의미 ordinal Chart 사라짐, (b) 단계가 **상태색**으로, (c) KeyValue 중복 제거, (d) 요약 지표 1개가 나오는지 확인.

---

## 붙여넣기용 프롬프트 (패턴 A)

```
[맥락] AGENTS.md, docs/design-system.md, docs/briefs/hud-visual-enrichment-handoff.md,
       그리고 선행 docs/briefs/hud-primitives-refinement-handoff.md를 먼저 읽어.
       generative HUD의 시각 언어를 레퍼런스(LMNTRIX 'jarvis style' SOC 대시보드) 수준으로
       다채롭게 하되, 우리 토큰·스코프·절제된 생성 원칙 안에서 한다.
[목표] Tier0(anti-plain 생성 가이드: 상태색 Steps+설명, ordinal-Chart 금지, 중복-list 금지,
       process/pipeline 아키타입, label-table 강화 — HUD_SYSTEM_PROMPT 중심, 효과 가장 큼) 먼저,
       이어 Tier1(비의미 팔레트 --seq-*/--cat- + Chart heat/다중시리즈, Gauge 동심 틱링,
       PieChart 중앙 KPI, Waveform 멀티휴) + Tier2 신규 프리미티브 3종(RadialMeter,
       Sparkline, RadialBreakdown)을 구현. 신규 prop명은 기존 검증기 허용군(value/items/
       samples/label/state/unit)을 재사용해 검증기 변경 최소화.
[제약] 가장 중요: 상태색(stable/info/caution/critical)은 의미 전용 — 풍부함은 반드시 별도
       비의미 팔레트(--seq-*/--cat-*)로. 빨강 막대='값 큼'은 --seq-*, --state-critical 아님.
       토큰만·손 SVG·외부 라이브러리 금지·데이터 값 불변·iframe 샌드박스 불변. LMNTRIX 복제 금지(재해석).
       신규 프리미티브는 동기화 체크리스트(primitives/index/hudGenerator+프롬프트/styles/Gallery/test/design-system) 전부.
[검증] typecheck/lint/test/build + /gallery 신규 픽스처 시각 확인 + 색 의미 회귀(상태색 미침범) +
       자기치유 정상 + 실제 생성 프롬프트로 archetype 선택 확인. 결과/스크린샷 보고.
[출력] feature/hud-visual-enrichment 브랜치, 작은 커밋(Tier1 → Tier2 순). 변경 요약 + 검증 로그.
```
