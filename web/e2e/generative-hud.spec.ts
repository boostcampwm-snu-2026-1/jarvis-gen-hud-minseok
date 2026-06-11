import { expect, test, type Page } from '@playwright/test';

const VALID_BUILD_HUD =
  '<Panel title="Build status" state="info"><Steps steps={data.build.steps} /><ProgressBar label="Build progress" value={data.build.progress} state="info" showPct /></Panel>';

const REPAIRED_HUD =
  '<Panel title="Recovered build status" state="stable"><Steps steps={data.build.steps} /><ProgressBar label="Recovered progress" value={data.build.progress} state="stable" showPct /></Panel>';

test('renders build status HUD from envelope data', async ({ page }) => {
  await mockHermes(page, [
    envelope({
      say: 'Build HUD ready.',
      design: {
        data_kind: 'progress/pipeline',
        primitives: ['Steps', 'ProgressBar'],
        layout: 'pipeline steps followed by completion meter',
        why: 'Build status is a pipeline with current completion.',
      },
      data: {
        build: {
          progress: 74,
          steps: [
            { name: 'Install deps', status: 'done' },
            { name: 'Smoke test', status: 'failed' },
          ],
        },
      },
      jsx: VALID_BUILD_HUD,
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '빌드 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Build status')).toBeVisible();
  await expect(page.getByText('Build progress')).toBeVisible();
  await expect(page.getByText('74%')).toBeVisible();
  await expect(page.getByText('Smoke test')).toBeVisible();

  const failedStep = page.locator('.hud-steps .is-failed');
  await expect(failedStep).toContainText('Smoke test');
  await expect(failedStep).toHaveCSS('color', 'rgb(239, 68, 68)');
});

test('renders an invented project HUD from agent-supplied data', async ({ page }) => {
  await mockHermes(page, [
    envelope({
      say: 'Project status ready.',
      design: {
        data_kind: 'status/overview',
        primitives: ['StatusPanel', 'ProgressBar', 'KeyValue', 'Steps'],
        layout: 'branch status, readiness meter, facts, and worktree steps',
        why: 'Repository status mixes one headline state with progress and evidence.',
      },
      data: {
        branch: 'feature/hud-invention',
        progress: 64,
        state: 'caution',
        summaryItems: [
          { k: 'branch', v: 'feature/hud-invention' },
          { k: 'changed', v: '5' },
        ],
        steps: [
          { name: 'Read git status', status: 'done' },
          { name: 'Working tree has changes', status: 'active' },
        ],
      },
      jsx:
        '<Panel title="Invented project HUD" state={data.state}><StatusPanel label="Branch" value={data.branch} state={data.state} /><ProgressBar label="Readiness" value={data.progress} state={data.state} showPct /><KeyValue items={data.summaryItems} /><Steps steps={data.steps} /></Panel>',
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '이 프로젝트 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Invented project HUD')).toBeVisible();
  await expect(page.locator('.hud-status-value')).toContainText(
    'feature/hud-invention',
  );
  await expect(page.getByText('64%')).toBeVisible();
  await expect(page.getByText('Working tree has changes')).toBeVisible();
});

test('renders disk usage as a pie-style HUD, not a flat table', async ({ page }) => {
  await mockHermes(page, [
    envelope({
      say: 'Disk usage ready.',
      design: {
        data_kind: 'breakdown/composition',
        primitives: ['PieChart', 'ProgressBar', 'KeyValue'],
        layout: 'composition graphic with usage meter and supporting facts',
        why: 'Used versus free capacity is a composition, not a plain table.',
      },
      data: {
        usePct: 14,
        slices: [
          { label: 'Used', value: 14, state: 'caution' },
          { label: 'Free', value: 86, state: 'stable' },
        ],
        summaryItems: [
          { k: 'drive', v: 'E:' },
          { k: 'used', v: '257G' },
          { k: 'free', v: '1.6T' },
        ],
      },
      jsx:
        '<Panel title="Disk Usage" state="stable"><PieChart slices={data.slices} label="E: drive" state="stable" /><ProgressBar value={data.usePct} label="Used" state="stable" showPct /><KeyValue items={data.summaryItems} /></Panel>',
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '디스크 사용량 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Disk Usage')).toBeVisible();
  await expect(page.getByText('E: drive')).toBeVisible();
  await expect(page.locator('.hud-pie-legend')).toContainText('Used');
  await expect(page.locator('.hud-pie-legend')).toContainText('Free');
  await expect(page.locator('.hud-pie-legend')).toContainText('14%');
  await expect(page.locator('.hud-pie-segment')).toHaveCount(2);
});

test('does not render HUD when envelope returns jsx null', async ({ page }) => {
  await mockHermes(page, [
    envelope({
      say: 'No visual surface needed.',
      design: null,
      data: { reason: 'small talk' },
      jsx: null,
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '왜 그래?');
  await revealHudPanel(page);

  await expect(page.getByTestId('hud-empty')).toBeVisible();
  await expect(page.getByTestId('hud-live-preview')).toHaveCount(0);
});

test('repairs broken JSX without crashing the app', async ({ page }) => {
  await mockHermes(page, [
    envelope({
      say: 'Broken first draft.',
      design: {
        data_kind: 'progress/pipeline',
        primitives: ['Steps'],
        layout: 'pipeline steps',
        why: 'Build failures are easiest to scan as steps.',
      },
      data: {
        build: {
          progress: 74,
          steps: [{ name: 'Smoke test', status: 'failed' }],
        },
      },
      jsx: '<Panel title="Broken" state="critical"><Steps steps={data.build.steps}></Panel>',
    }),
    envelope({
      say: 'Recovered.',
      design: {
        data_kind: 'progress/pipeline',
        primitives: ['Steps', 'ProgressBar'],
        layout: 'pipeline steps followed by completion meter',
        why: 'The repaired HUD preserves build progress and failing step.',
      },
      data: {
        build: {
          progress: 74,
          steps: [{ name: 'Smoke test', status: 'failed' }],
        },
      },
      jsx: REPAIRED_HUD,
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '빌드 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Recovered build status')).toBeVisible();
  await expect(page.getByText('Recovered progress')).toBeVisible();
  await expect(page.locator('input[type="text"]')).toBeVisible();
  await expect(page.getByTestId('hud-fallback')).toHaveCount(0);
});

test('rejects disallowed raw HTML/style and heals with allowed primitives', async ({
  page,
}) => {
  await mockHermes(page, [
    envelope({
      say: 'Bad draft.',
      design: {
        data_kind: 'status/overview',
        primitives: ['Alert'],
        layout: 'invalid draft',
        why: 'This draft intentionally violates render rules.',
      },
      data: {},
      jsx: '<div style={{ color: "red" }}>bad</div>',
    }),
    envelope({
      say: 'Recovered.',
      design: {
        data_kind: 'progress/pipeline',
        primitives: ['Steps', 'ProgressBar'],
        layout: 'pipeline steps followed by completion meter',
        why: 'The repair uses allowed HUD primitives.',
      },
      data: {
        build: {
          progress: 74,
          steps: [{ name: 'Smoke test', status: 'failed' }],
        },
      },
      jsx: REPAIRED_HUD,
    }),
  ]);
  await page.goto('/');

  await submitCommand(page, '빌드 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Recovered build status')).toBeVisible();
  await expect(page.getByText('Recovered progress')).toBeVisible();
  await expect(page.locator('div[style*="red"]')).toHaveCount(0);
});

async function submitCommand(page: Page, text: string) {
  await page.locator('input[type="text"]').fill(text);
  await page.locator('button[type="submit"]').click();
}

async function revealHudPanel(page: Page) {
  const hudTab = page.getByRole('tab', { name: 'HUD' });
  if (await hudTab.isVisible()) {
    await hudTab.click();
  }
}

async function mockHermes(page: Page, hudResponses: string[]) {
  let hudIndex = 0;
  await page.route('**/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: { role: string; content: string }[];
    };
    const messages = body.messages ?? [];
    const isHudRequest = messages.some(
      (message) =>
        message.role === 'system' &&
        message.content.includes('You run a J.A.R.V.I.S HUD agent turn'),
    );
    const isRepairRequest = messages.some((message) =>
      message.content.includes('Repair this HUD envelope'),
    );

    if (isHudRequest || isRepairRequest) {
      const content =
        hudResponses[Math.min(hudIndex, hudResponses.length - 1)] ??
        envelope({
          say: 'ok',
          design: {
            data_kind: 'progress/pipeline',
            primitives: ['Steps', 'ProgressBar'],
            layout: 'pipeline fallback',
            why: 'Default mock HUD mirrors build progress.',
          },
          data: {},
          jsx: VALID_BUILD_HUD,
        });
      hudIndex += 1;
      await route.fulfill(sse(content));
      return;
    }

    await route.fulfill(sse('대화 응답입니다.'));
  });
}

function envelope(value: {
  say: string;
  design:
    | {
        data_kind: string;
        primitives: string[];
        layout: string;
        why: string;
      }
    | null;
  data: object;
  jsx: string | null;
}): string {
  return JSON.stringify(value);
}

function sse(content: string) {
  const payload = JSON.stringify({
    choices: [{ delta: { content }, finish_reason: null }],
  });
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    body: `data: ${payload}\n\ndata: [DONE]\n\n`,
  };
}
