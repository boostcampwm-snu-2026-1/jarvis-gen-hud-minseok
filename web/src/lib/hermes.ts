/**
 * Hermes(OpenAI-compatible) /v1/responses SSE streaming client.
 *
 * The browser only calls same-origin `/v1/...`; dev Vite and production Caddy
 * inject Authorization server-side. No API key belongs in this bundle.
 */

const HERMES_ENDPOINT = '/v1/responses';
const HERMES_MODEL = import.meta.env.VITE_HERMES_MODEL ?? 'hermes';
const DEFAULT_SESSION_KEY = 'jarvis:main';
const SESSION_KEY =
  sanitizeSessionKey(import.meta.env.VITE_JARVIS_SESSION_KEY) ??
  DEFAULT_SESSION_KEY;

// 즉답(usher) 전용 모델. 빠른 메인(예: Haiku4.5)을 가리키게 두면 TTFT가 짧다.
// 비우면 일반 모델로 폴백(여전히 tool 금지·한 문장 제약으로 가볍게 돈다).
const USHER_MODEL = import.meta.env.VITE_HERMES_USHER_MODEL ?? HERMES_MODEL;

/**
 * 즉답(usher) 프롬프트. 무거운 envelope 턴(도구 수집 + HUD 생성)이 끝나기 전에
 * 자비스 보이스 "한 문장" 선응답을 먼저 흘려 TTFT를 줄인다. 의도적으로
 * 도구 금지 + 무상태(대화 미저장) — 핵심은 지연이고, 클라우드 임계경로에
 * 즉답을 묶지 않는다는 원칙(AGENTS.md)을 프롬프트 차원에서도 강제한다.
 */
export const USHER_SYSTEM_PROMPT = [
  'You are J.A.R.V.I.S, the single assistant voice serving 민석님 (the user).',
  'This is an instant "usher" line shown the moment the user sends, BEFORE the full answer and any HUD are ready. Its only job is to immediately acknowledge, in one short sentence, what you are about to do.',
  'Reply with EXACTLY ONE short sentence in the user\'s language (Korean by default), in a calm, capable JARVIS tone, addressing the user as "민석님" when it reads naturally.',
  'Frame the action you are about to take (look into / check / pull up / analyze / render) — do not actually perform it yet.',
  'Hard rules: do NOT answer the request; do NOT provide data, numbers, lists, code, or explanations; do NOT call any tools; do NOT invent facts.',
  'For a greeting or small talk, a brief courteous one-line reply is fine.',
  'Output plain text only: no JSON, no markdown, no surrounding quotes. Keep it under ~15 words.',
].join('\n');

export interface HermesToolEvent {
  phase: 'call' | 'output';
  name: string;
  item?: Record<string, unknown>;
}

export interface StreamResponseOptions {
  signal?: AbortSignal;
  model?: string;
  instructions?: string;
  store?: boolean;
  onToolEvent?: (event: HermesToolEvent) => void;
}

export interface ResponseSseEvent {
  event?: string;
  data: string;
}

export async function* streamResponse(
  input: string,
  conversation: string | null,
  options: StreamResponseOptions = {},
): AsyncGenerator<string, void, unknown> {
  const body: Record<string, unknown> = {
    model: options.model ?? HERMES_MODEL,
    input,
    store: options.store ?? true,
    stream: true,
  };
  if (conversation) body.conversation = conversation;
  if (options.instructions) body.instructions = options.instructions;

  const response = await fetch(HERMES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hermes-Session-Key': SESSION_KEY,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new Error(
      `Hermes 응답 오류 ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
    );
  }
  if (!response.body) {
    throw new Error('Hermes 응답에 스트림 본문이 없습니다.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parsed = drainSseEvents(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        if (event.data === '[DONE]') return;

        const delta = readResponseDelta(event);
        if (delta) yield delta;

        const toolEvent = readToolEvent(event);
        if (toolEvent) options.onToolEvent?.(toolEvent);
      }
    }

    const tail = parseSseEvent(buffer.trim());
    if (tail && tail.data !== '[DONE]') {
      const delta = readResponseDelta(tail);
      if (delta) yield delta;
      const toolEvent = readToolEvent(tail);
      if (toolEvent) options.onToolEvent?.(toolEvent);
    }
  } finally {
    reader.releaseLock();
  }
}

export interface StreamUsherOptions {
  signal?: AbortSignal;
  model?: string;
}

/**
 * 즉답(usher) 스트림. 본 답변(envelope)과 병렬로 띄워, 자비스의 한 문장
 * 선응답 토큰을 곧바로 흘린다. 무상태(conversation 없음 + store:false)라
 * 장기 메모리를 오염시키지 않고, 본 답변 경로와 독립적으로 동작한다.
 */
export async function* streamUsher(
  input: string,
  options: StreamUsherOptions = {},
): AsyncGenerator<string, void, unknown> {
  yield* streamResponse(input, null, {
    signal: options.signal,
    model: options.model ?? USHER_MODEL,
    instructions: USHER_SYSTEM_PROMPT,
    store: false,
  });
}

export function getUsherModelForTest(): string {
  return USHER_MODEL;
}

export function createConversationName(date = new Date()): string {
  return `jarvis-${date.toISOString().replace(/[:.]/g, '-')}`;
}

export function getHermesSessionKeyForTest(): string {
  return SESSION_KEY;
}

export function extractResponseTextDeltaForTest(
  event: ResponseSseEvent,
): string | undefined {
  return readResponseDelta(event);
}

export function extractToolEventForTest(
  event: ResponseSseEvent,
): HermesToolEvent | undefined {
  return readToolEvent(event);
}

function drainSseEvents(buffer: string): {
  events: ResponseSseEvent[];
  remainder: string;
} {
  const events: ResponseSseEvent[] = [];
  let remainder = buffer;
  let boundary = findEventBoundary(remainder);

  while (boundary !== -1) {
    const rawEvent = remainder.slice(0, boundary);
    remainder = remainder.slice(
      boundary + (remainder[boundary] === '\r' ? 4 : 2),
    );
    const event = parseSseEvent(rawEvent);
    if (event) events.push(event);
    boundary = findEventBoundary(remainder);
  }

  return { events, remainder };
}

function findEventBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function parseSseEvent(raw: string): ResponseSseEvent | undefined {
  const lines = raw.split(/\r?\n/);
  const data: string[] = [];
  let event: string | undefined;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart());
    }
  }

  if (data.length === 0) return undefined;
  return { event, data: data.join('\n') };
}

function readResponseDelta(event: ResponseSseEvent): string | undefined {
  const payload = parsePayload(event.data);
  if (!payload) return undefined;
  const type = getString(payload.type) ?? event.event;
  if (type !== 'response.output_text.delta') return undefined;
  return getString(payload.delta) ?? getString(payload.text);
}

function readToolEvent(event: ResponseSseEvent): HermesToolEvent | undefined {
  const payload = parsePayload(event.data);
  if (!payload) return undefined;
  const type = getString(payload.type) ?? event.event;
  const item = getRecord(payload.item) ?? payload;
  const itemType = getString(item.type);

  if (
    type === 'response.output_item.added' &&
    (itemType === 'function_call' || itemType === 'tool_call')
  ) {
    return {
      phase: 'call',
      name: getToolName(item),
      item,
    };
  }
  if (
    type === 'response.output_item.done' &&
    (itemType === 'function_call_output' || itemType === 'tool_call_output')
  ) {
    return {
      phase: 'output',
      name: getToolName(item),
      item,
    };
  }
  if (type === 'function_call') {
    return { phase: 'call', name: getToolName(item), item };
  }
  if (type === 'function_call_output') {
    return { phase: 'output', name: getToolName(item), item };
  }

  return undefined;
}

function getToolName(item: Record<string, unknown>): string {
  return (
    getString(item.name) ??
    getString(item.tool_name) ??
    getString(item.call_id) ??
    'tool'
  );
}

function parsePayload(data: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(data) as unknown;
    if (isRecord(value)) return value;
  } catch {
    return undefined;
  }
  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeSessionKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || hasControlCharacter(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}
