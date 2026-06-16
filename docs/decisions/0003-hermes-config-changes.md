# ADR 0003 — Hermes config.yaml 변경 사항

> 상태: 초안 · 날짜: 2026-06-04 · 선행: ADR 0002
> 대상: `~/.hermes/profiles/default/config.yaml` (실측 config 기준)

역할 하이브리드(빠른 메인 + 강한 delegation) + 자율 동작을 위해 만질 키.

## A. 지금 바로 (우리 설계 직결)

### A1. 메인 TTFT — `reasoning_effort`
```yaml
agent:
  reasoning_effort: minimal      # 기존 medium → minimal
```
**왜:** 스파이크에서 사소한 질문에도 ttft ~25s. `medium`은 매 턴 "thinking"을 돌려 TTFT를 키운다. 메인(음성·dispatch)은 깊은 추론이 필요 없으니 `minimal`(또는 `low`). 깊은 추론은 delegation이 담당.
> 주의: `model.provider: openai-codex`(ChatGPT Codex 백엔드)가 reasoning_effort를 무시하고 자체 추론을 강제하면 지연이 안 떨어질 수 있다. 그땐 메인을 표준 `provider: openai`(API 키) + `gpt-5.4-mini`로 바꿔 reasoning_effort가 먹히게 한다.

### A2. delegation 모델 — 강한 추론/코딩
```yaml
delegation:
  model: gpt-5.5                 # 기존 '' → 강한 모델. 코딩 위주면 gpt-5.3-codex
  provider: openai               # delegation 모델의 프로바이더
  reasoning_effort: high         # 기존 '' → 강한 추론은 깊게(또는 medium)
  # (나머지 max_concurrent_children:3, child_timeout:600 등은 유지)
```
**왜:** 현재 `delegation.model: ''` → 서브에이전트가 메인과 같은 모델(gpt-5.4-mini)로 돈다. 강한 추론/코딩이 메인 fast 모델로 처리돼 품질 저하. 강한 모델로 분리.
- **단일 프로바이더(간단):** delegation도 OpenAI(`gpt-5.5` / `gpt-5.3-codex`) — 추가 자격증명 불필요.
- **최강 추론:** `model: claude-opus-4-6`, `provider: anthropic` — **단 Anthropic 자격증명**(`hermes login` / setup)이 먼저 있어야 함. `providers: {}`가 비어 있으니 확인.

## B. 자율 동작 위해 검토 (보안 trade-off)

### B1. 승인 정책 — `approvals.mode`
```yaml
approvals:
  mode: manual                   # 현재값
```
헤드리스(/v1)에는 인터랙티브 `clarify`가 없다(api-server 툴셋이 제외). 메인이 자율로 터미널/백그라운드 작업을 돌릴 때 manual 승인이 **stall/deny**를 부를 수 있다. 스파이크의 `sleep/echo`는 안전판정으로 통과했지만, 더 무거운 명령은 막힐 수 있음.
- 옵션: `command_allowlist`에 안전 명령 추가 / 비파괴 명령 자동 허용. **`security.tirith_enabled: true`(명령 안전검사)는 유지**해 가드레일 보존.
- 무작정 `auto`로 열지 말 것 — 격리 백엔드(B3)와 함께 가야 안전.

### B2. 위임 서브 자동승인
```yaml
delegation:
  subagent_auto_approve: false   # 현재값
```
위임된 코딩/추론 서브가 명령 실행 시 막히지 않게 하려면 `true` 고려 — **단 terminal 백엔드를 격리(B3)로 둔 경우에만.**

### B3. terminal 백엔드 / 수명 (R5)
```yaml
terminal:
  backend: local                 # 데모엔 OK. 위험/긴 작업이면 docker|modal 격리 권장
  timeout: 180                   # 명령당. 긴 동기 명령엔 짧을 수 있음
  lifetime_seconds: 300          # 셸 세션 수명 — 긴 백그라운드 시뮬은 잘릴 수 있음 → 필요시 ↑
  persistent_shell: true         # 유지(백그라운드/세션 지속에 유리)
```
"시뮬레이션 돌려놓고 계속" 시나리오에서 긴 작업이 `lifetime_seconds`를 넘으면 끊긴다. 긴 작업 예정이면 늘리거나 격리 백엔드(컨테이너) 사용.

## C. 선택 / 최적화

- `auxiliary.compression`·`vision` 등 `provider: auto`(=메인 모델). 메인이 이미 싸서 우선순위 낮지만, 메인을 사이드작업에서 빼려면 싼 모델로 pin 가능.
- `prompt_caching.cache_ttl: 5m` — 이미 on. SOUL 시스템프롬프트 캐싱으로 반복 턴 지연↓. 유지.
- `streaming.enabled: false`(최상위) — /v1 SSE는 `display.streaming: true`로 이미 동작. 손 안 대도 됨.
- **빌트인 voice 안 씀**(우리 파이프라인 별도) → `tts`/`stt`/`voice` 손 안 대도 됨. 나중에 Hermes 보이스를 쓸 거면 `tts.elevenlabs.model_id: eleven_multilingual_v2 → eleven_flash_v2_5`(저지연).

## D. Probe A(블로킹) 관련

`reasoning_effort` 낮추면 ack는 빨라진다. 하지만 **백그라운드 실행 여부는 config로 강제 못 한다** — 모델이 terminal 도구를 `background=True`로 부르느냐에 달림. 수정한 Probe A로 재검증해, 여전히 `❌ BLOCKING`이면 **SOUL.md/스킬에 "수 초 이상 걸리는 작업은 반드시 terminal background=True, notify_on_complete=True로 실행" 규칙**을 넣어 행동을 고정한다.

## 적용 후

```bash
hermes -p default gateway restart
python hermes_spike.py            # ack↓·ttft<5s·Probe A 진짜 PASS 인지 재확인
```
기대: Probe C ttft 5s 아래(🚩 사라짐), Probe A 빠른 ack + "진행중→완료".
