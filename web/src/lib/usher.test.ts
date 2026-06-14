import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  USHER_SYSTEM_PROMPT,
  getUsherModelForTest,
  streamUsher,
} from './hermes';

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const delta of gen) out += delta;
  return out;
}

describe('streamUsher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams a plain-text ack and sends a stateless, tool-free request', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        body: sseStream([
          'data: {"type":"response.output_text.delta","delta":"민석님, "}\n\n',
          'data: {"type":"response.output_text.delta","delta":"살펴보겠습니다."}\n\n',
          'data: [DONE]\n\n',
        ]),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await collect(streamUsher('디스크 상태 보여줘'));

    expect(text).toBe('민석님, 살펴보겠습니다.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedBody.input).toBe('디스크 상태 보여줘');
    expect(capturedBody.model).toBe(getUsherModelForTest());
    expect(capturedBody.instructions).toBe(USHER_SYSTEM_PROMPT);
    // 즉답은 무상태여야 한다: store=false + 대화 키 미전송(장기 메모리 미오염).
    expect(capturedBody.store).toBe(false);
    expect('conversation' in capturedBody).toBe(false);
  });

  it('keeps the usher prompt single-sentence and tool-free', () => {
    expect(USHER_SYSTEM_PROMPT).toMatch(/ONE short sentence/i);
    expect(USHER_SYSTEM_PROMPT).toMatch(/do NOT call any tools/i);
    expect(USHER_SYSTEM_PROMPT).toMatch(/plain text only/i);
  });
});
