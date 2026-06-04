# ADR 0002 — Hermes 실현가능성 · 세팅 감사

> 상태: 초안 · 날짜: 2026-06-04 · 선행: ADR 0001(Hermes 채택)
> 질문: **Hermes로 우리가 설계한 JARVIS를 진짜 해낼 수 있나? 해내려면 뭘 세팅해야 하나?**

## 종합 판정

**예 — 모든 핵심 능력이 문서로 검증된다.** 단, **5개 항목은 코드 짜기 전에 짧은 de-risk 스파이크로 확정**해야 한다(블로커는 아님, 전부 우회/설계 가능). 가장 주의할 한 가지: **백그라운드 완료 auto-notify가 게이트웨이에서 알려진 버그(#6718)** — 우리 오케스트레이터가 **polling으로 우회**한다.

## 요구사항별 — 가능여부 + 필요 설정

| # | 요구 | Hermes 가능? | 필요 설정 / 메커니즘 |
|---|---|---|---|
| 1 | JARVIS 페르소나 | ✅ 완료 | `~/.hermes/profiles/default/SOUL.md` (이미 적용) |
| 2 | 영속 메모리 | ✅ | 기본 내장. 게이트웨이가 다중 세션 메모리 처리 |
| 3 | 스킬·툴 사용 | ✅ | `hermes-api-server` 플랫폼 툴셋에 terminal·code_execution·file·web 포함 (clarify·send_message 등 인터랙티브 툴만 제외) |
| 4 | 역할 하이브리드(빠른 메인+강한 추론) | ✅ | `model.default`=fast, `delegation.model`=strong. 메인은 `reasoning_effort: minimal` |
| 5 | 낮은 TTFT | ✅ (설정으로) | 메인=비추론 fast 모델. 추론 모드는 TTFT 4~9s라 메인엔 금지 |
| 6 | 백그라운드 실행 | ✅ (알림은 ⚠️) | `terminal(background=True, notify_on_complete=True)` / `cronjob`. **완료 notify 버그(#6718) → 오케스트레이터가 `process poll`로 우회** |
| 7 | 오케스트레이션/dispatch | ✅ | `delegate_task`(동기·병렬, `max_concurrent_children` 최대 30), Persistent Goals, Kanban |
| 8 | OpenAI 호환 `/v1` | ✅ 완료 | `API_SERVER_ENABLED=true` + 키. M1 앱 이미 연결됨 |
| 9 | HUD 콘텐츠/JSX 스트리밍 | ✅ (계약 정의 필요) | Hermes는 모델 출력을 `/v1` SSE로 흘림. **JSX를 음성 텍스트와 분리해 뽑는 "출력 계약"은 우리가 정해야 함**(아래 설계결정) |
| 10 | 음성+HUD 동시성 | ✅ (방식 선택) | API 서버가 다중 세션 동시 처리(요청마다 독립 AIAgent, credential pool thread-safe). 우리 오케스트레이터가 병렬 `/v1` 호출 멀티플렉싱 |
| 11 | deterministic 계산 | ✅ | `code_execution`(mode/timeout) + terminal. 수치는 툴이, LLM은 지휘 |
| 12 | 보안(키 서버측) | ✅ 완료 | Caddy가 `/v1`에 `Authorization` 주입, basic-auth/TLS |

## 리스크 / 스파이크로 확정할 것 (5)

- **R1 — 백그라운드 완료 알림 신뢰성(#6718).** auto-notify가 게이트웨이에서 user=None으로 깨질 수 있음 → **우리 오케스트레이터가 background 프로세스를 polling**(또는 watch pattern + 직접 상태조회)해 진행·완료를 HUD/음성에 surface. **스파이크:** terminal background로 60초 sleep 띄우고 완료를 폴링으로 잡는지.
- **R2 — 음성·HUD 병렬 호출의 일관성.** 둘을 별도 `/v1` 호출로 던지면 **서로 다른 AIAgent 인스턴스**라 in-flight 추론이 분리됨(메모리 store만 공유) → 음성과 HUD가 미세하게 어긋날 수 있음. **대안:** 한 턴이 음성+HUD를 **구조화 출력**으로 같이 내고 오케스트레이터가 분리. **스파이크:** 어느 쪽이 일관적인지 비교.
- **R3 — HUD JSX 생성 계약.** 모델이 디자인토큰·허용 컴포넌트만으로 **유효한 제약 JSX**를 안정적으로 내는가(M3 핵심). 메커니즘 후보: ① 구조화 출력(음성/HUD 태그 분리) ② 전용 HUD 스킬 ③ HUD용 시스템프롬프트로 2차 호출. **스파이크:** 한 작업에 대해 제약 JSX가 깨지지 않고 나오는지(자기치유 전 단계).
- **R4 — 빠른 메인의 dispatch·tool-call 신뢰성.** Haiku/5.4mini가 "언제 위임/툴 호출할지" 판단과 context 전달을 잘 하는가. **스파이크:** 대표 턴 3종(잡담 / 메모리참조 / 툴 데이터질의)으로 확인.
- **R5 — terminal 백엔드 선택.** 시뮬레이션 등을 어디서 실행할지(로컬 워크스테이션 vs Docker/Modal/Daytona 샌드박스) — 보안·격리 vs 단순성. **결정 필요.**

## 아직 정할 설계 결정

1. **HUD 출력 계약** (R2·R3) — 단일 턴 구조화 출력 vs 음성/HUD 2-호출. → 스파이크 후 결정. (음성=메인 fast, HUD=메인 또는 delegation strong 중 누가 생성할지도 같이.)
2. **백그라운드 진행 surface 방식** (R1) — 오케스트레이터 polling 주기 + watch pattern 병행.
3. **terminal 백엔드** (R5) — 데모는 로컬, 위험 작업은 샌드박스 권장.

## config.yaml 스케치 (검증된 키 기준, 정확한 철자는 `cli-config.yaml.example`로 대조)

```yaml
# ~/.hermes/profiles/default/config.yaml
model:
  provider: anthropic
  default: claude-haiku-4-5-20251001     # 빠른 메인(음성·dispatch·persona)
agent:
  reasoning_effort: minimal              # 메인 TTFT 보호 (추론은 delegation이)
delegation:
  model: claude-opus-4-6                 # 강한 추론·코딩 서브에이전트
  provider: anthropic                    # 또는 openai / gpt-5.5
  max_concurrent_children: 3
  child_timeout_seconds: 600
code_execution:
  mode: project
  timeout: 120
auxiliary:                               # (선택) 사이드 작업은 싼 모델로
  compression: { provider: anthropic, model: claude-haiku-4-5-20251001 }
# terminal 백엔드 = 로컬(기본) 또는 docker/modal/daytona — R5에서 결정
# API_SERVER_* 는 .env (이미 구성)
```

## 세팅 체크리스트

- [x] SOUL.md 프로필 경로 적용
- [x] API 서버 활성 + 키 + Caddy `/v1` 프록시 (M1)
- [ ] `model.default` = fast 메인, `delegation.model` = strong 으로 config 설정
- [ ] `agent.reasoning_effort: minimal` (메인)
- [ ] `hermes tools`로 api-server 툴셋에 terminal·code_execution·file·web 활성 확인
- [ ] terminal 백엔드 결정(R5)
- [ ] **스파이크 R1~R4** 통과 후 코드 착수
- [ ] (M5) 오케스트레이터: 병렬 `/v1` 멀티플렉싱 + background polling

## 출처

- [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) · [Delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation) · [Toolsets](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference) · [Code Execution](https://hermes-agent.nousresearch.com/docs/user-guide/features/code-execution)
- 리스크: [#6718 백그라운드 알림 버그](https://github.com/NousResearch/hermes-agent/issues/6718) · [#1468 동시 요청](https://github.com/NousResearch/hermes-agent/issues/1468)
