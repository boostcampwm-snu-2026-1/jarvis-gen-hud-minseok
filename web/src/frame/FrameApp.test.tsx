import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// post()는 window.parent.postMessage로 내보낸다 — 테스트에선 호출만 캡처.
vi.mock('./post', () => ({ post: vi.fn() }));
import { post } from './post';
import { FrameApp } from './FrameApp';

const mockedPost = vi.mocked(post);

function deliver(jsx: string, data: Record<string, unknown>) {
  render(<FrameApp />);
  // jsdom에선 window.parent === window이므로 source=window가 FrameApp의
  // event.source !== window.parent 가드를 통과한다(HudCanvas.test와 동일 패턴).
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'hud:render', jsx, data },
      source: window,
    }),
  );
}

function postedTypes(): string[] {
  return mockedPost.mock.calls.map((call) => (call[0] as { type?: string })?.type ?? '');
}

describe('FrameApp 샌드박스 스코프', () => {
  beforeEach(() => {
    // jsdom엔 ResizeObserver가 없다 — FrameApp이 mount 시 생성한다.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mockedPost.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockedPost.mockClear();
  });

  // 신규 프리미티브가 react-live 스코프에 없으면 "X is not defined"로 렌더 에러가
  // 나고 생성 HUD가 절대 자기치유되지 않는다. 스코프 계약을 못박는다.
  const cases: Array<{ name: string; jsx: string; data: Record<string, unknown> }> = [
    {
      name: 'RadialMeter',
      jsx: '<Panel title="K" state="info"><RadialMeter value={data.v} max={data.m} unit="x" label="K" /></Panel>',
      data: { v: 47, m: 60 },
    },
    {
      name: 'RadialBreakdown',
      jsx: '<Panel title="T" state="info"><RadialBreakdown items={data.items} label="T" /></Panel>',
      data: { items: [{ label: 'a', value: 8 }, { label: 'b', value: 14 }] },
    },
    {
      name: 'Sparkline',
      jsx: '<Panel title="S" state="info"><Sparkline samples={data.s} label="S" /></Panel>',
      data: { s: [1, 3, 2, 5, 4] },
    },
  ];

  for (const c of cases) {
    it(`${c.name}를 스코프 에러 없이 렌더한다(hud:rendered)`, async () => {
      deliver(c.jsx, c.data);
      await waitFor(() => {
        const types = postedTypes();
        expect(types).toContain('hud:rendered');
        expect(types).not.toContain('hud:error');
      });
    });
  }

  it('스코프에 없는 컴포넌트는 hud:error를 낸다(계약 확인)', async () => {
    deliver(
      '<Panel title="X" state="info"><NotARealPrimitive value={data.v} /></Panel>',
      { v: 1 },
    );
    await waitFor(() => {
      expect(postedTypes()).toContain('hud:error');
    });
  });
});
