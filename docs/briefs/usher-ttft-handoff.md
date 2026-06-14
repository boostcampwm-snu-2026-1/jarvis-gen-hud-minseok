# 즉답(usher) TTFT — Claude Code 핸드오프 브리프

> Cowork에서 1차 구현 완료 → Claude Code가 **검증·수정·마감**. **AGENTS.md 준수.**
> 브랜치 제안: `feature/usher-ttft` → `dev` PR.

## 한 줄

전송 즉시 자비스가 **한 문장 선응답(usher)** 을 흘리고, 무거운 envelope 턴(도구 수집 + HUD 생성)은 **병렬**로 돌다가 준비되면 선응답을 **교체**한다. TTFT를 envelope 완성 시점에서 분리한다.

## 배경 (왜)

- 기존: 프론트가 `/v1/responses`를 **단일 호출**한다. 모델이 도구 수집 → `data` → HUD `design` → `jsx` → `say`를 **다 만든 뒤에야** 첫 `say` 토큰이 나온다. "한꺼번에" 처리라 첫 출력까지 오래 걸린다.
- AGENTS 불변 원칙: **음성 즉답을 클라우드 임계경로에 두지 않는다.** → 즉답은 별도·병렬·무상태여야 한다.

## 결정 (사용자 확정)

1. 즉답 = **빠른 모델 usher 별도 호출**(문맥 반영), 본 답변과 병렬.
2. 본 답변이 오면 **교체**(잠정 라인 → 실제 say).
3. 문구는 **하드코딩하지 않고** 프롬프트로 한 문장 생성.

## 이미 들어간 변경 (확인 후 검증할 것)

- **`web/src/lib/hermes.ts`**
  - `USHER_SYSTEM_PROMPT` — 자비스 보이스 한 문장, 도구 금지, JSON/마크다운 금지, ~15단어.
  - `USHER_MODEL` — `import.meta.env.VITE_HERMES_USHER_MODEL ?? HERMES_MODEL`.
  - `streamUsher(input, {signal, model})` — `streamResponse`를 `conversation:null, store:false, instructions:USHER_SYSTEM_PROMPT`로 재사용(무상태).
  - `getUsherModelForTest()`.
- **`web/src/App.tsx`** — `handleSend`를 usher+main **병렬**로 재작성.
  - `usherTask`(best-effort, 에러 무시)가 `streamUsher`를 스트리밍해 `setLastAssistant(prev, usherText, /*pending*/true)`로 잠정 표시.
  - 메인의 **첫 `say` 델타**에서 `takeOverFromUsher()` → usher abort + 라인 비우고 실제 say를 처음부터 append.
  - 메인이 say를 안 내면(HUD 전용/빈 응답) usher 문장을 **확정 라인**으로 유지(`finishEnvelopeTurn`의 `ackText` 분기).
  - `handleStop`·`handleNewConversation`·`catch`에서 usher abort. `finally`에서 usher 정리.
  - `replaceLastAssistant` → **`setLastAssistant(prev, content, pending)`** (치환 + pending 플래그). `finishEnvelopeTurn`에 `ackText` 인자 추가.
- **`web/src/components/ConversationPanel.tsx`** — `DisplayMessage.pending?: boolean`; `cls`에 `pending` 클래스.
- **`web/src/styles/app.css`** — `.msg.assistant.pending`(잠정 표시: 이탤릭·dim).
- **`web/.env.example`** — `VITE_HERMES_USHER_MODEL=`(빠른 메인 가리키게).
- **`web/src/lib/usher.test.ts`** — `streamUsher` 요청 형태(model/store/instructions, conversation 미전송) + 프롬프트 제약 테스트.

## 네(Claude Code)가 할 일

1. 위 변경이 실제 파일에 **빠짐없이** 들어갔는지 확인(특히 `App.tsx` — Cowork 샌드박스 동기화 지연으로 in-sandbox 타입체크를 못 끝냈음. `hermes.ts`/`usher.test.ts`는 파싱 클린 확인됨).
2. **자가 검증 풀세트**를 돌리고 **에러 0**까지 수정:
   ```
   cd web
   npm run typecheck   # tsc -b
   npm run lint        # eslint . — 미사용 심볼(예: 제거된 replaceLastAssistant 잔재) 확인
   npm run test        # vitest — usher.test.ts 통과 + 기존 테스트 그린
   npm run build       # tsc -b && vite build
   ```
3. **동작 확인:** 데이터성 질문 시 (a) 즉답이 빠르게 뜨고 (b) 본 답변+HUD가 오면 교체되는지. HUD-only(say 빈) 응답에서 즉답이 확정 라인으로 남는지.
4. **회귀:** 즉답이 Hermes 대화 메모리를 오염시키지 않는지(`store:false` + `conversation` 미전송). `stop`/새 대화에서 즉답이 취소되는지. 키 프론트 미노출 유지.

## 주의 / 엣지

- **경합:** 메인이 usher보다 먼저 `say`를 내면 usher는 화면에 안 뜬다(정상). usher가 먼저면 떴다가 교체.
- **best-effort:** usher가 실패·지연해도 본 답변엔 영향 없어야 한다.
- **효과 조건:** `VITE_HERMES_USHER_MODEL`을 **빠른 메인(Haiku4.5 등)** 으로 지정해야 TTFT가 짧아진다. 비우면 일반 모델로 폴백(여전히 도구 금지·한 문장 제약으로 가볍게 돈다). Hermes `/v1`이 별도 fast 모델명을 노출하지 않으면, 이 분리가 의미 있도록 라우팅을 확인할 것.
- `appendToLastAssistant`는 `current===''`일 때 선행 공백을 제거한다 — takeover 직후 첫 say 델타에 그대로 적용됨(기존 동작 유지).

---

## 붙여넣기용 프롬프트 (패턴 A)

```
[맥락] AGENTS.md, docs/기획서.md, docs/briefs/usher-ttft-handoff.md를 먼저 읽어.
       generative HUD 자비스에서 "즉답(usher) TTFT" 기능이 Cowork에서 1차 구현됐다.
       전송 즉시 한 문장 선응답을 띄우고, 본 답변(envelope: 도구+HUD)은 병렬로 돌다가
       준비되면 선응답을 교체한다. 변경 파일 목록은 위 브리프의 "이미 들어간 변경"을 보라.
[목표] (1) 변경이 실제 파일에 빠짐없이 들어갔는지 확인하고, (2) 자가 검증 풀세트
       (typecheck/lint/test/build)를 에러 0까지 통과시키고, (3) 동작/회귀를 확인해라.
[제약] 음성 즉답을 클라우드 임계경로에 두지 마라. 즉답은 무상태(store:false, conversation 미전송)
       라 장기 메모리를 오염시키면 안 된다. 키는 서버측에만. 외부 라이브러리 추가 금지.
[검증] 브리프의 "네가 할 일" 1~4를 네가 먼저 통과시키고 결과(명령 출력·동작 확인)를 보고해.
       실패하는 검증이 있으면 최소 패치로 고치고 무엇을 왜 고쳤는지 한 줄로 적어라.
[출력] feature/usher-ttft 브랜치, 작은 커밋. 변경 요약과 검증 로그를 보고.
```
