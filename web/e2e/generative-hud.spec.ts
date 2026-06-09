import { expect, test, type Page } from '@playwright/test';

const VALID_BUILD_HUD =
  '<Panel title="Build status" state="info"><Steps steps={data.build.steps} /><ProgressBar label="Build progress" value={data.build.progress} state="info" showPct /></Panel>';

const REPAIRED_HUD =
  '<Panel title="Recovered build status" state="stable"><Steps steps={data.build.steps} /><ProgressBar label="Recovered progress" value={data.build.progress} state="stable" showPct /></Panel>';

test('renders build status HUD from deterministic data', async ({ page }) => {
  await mockHermes(page, [jsonHud(VALID_BUILD_HUD)]);
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

test('repairs broken JSX without crashing the app', async ({ page }) => {
  await mockHermes(page, [
    jsonHud(
      '<Panel title="Broken" state="critical"><Steps steps={data.build.steps}></Panel>',
    ),
    jsonHud(REPAIRED_HUD),
  ]);
  await page.goto('/');

  await submitCommand(page, '빌드 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Recovered build status')).toBeVisible();
  await expect(page.getByText('Recovered progress')).toBeVisible();
  await expect(page.getByLabel('명령 입력')).toBeVisible();
  await expect(page.getByTestId('hud-fallback')).toHaveCount(0);
});

test('rejects disallowed raw HTML/style and heals with allowed primitives', async ({
  page,
}) => {
  await mockHermes(page, [
    jsonHud('<div style={{ color: "red" }}>bad</div>'),
    jsonHud(REPAIRED_HUD),
  ]);
  await page.goto('/');

  await submitCommand(page, '빌드 상태 보여줘');
  await revealHudPanel(page);

  await expect(page.getByText('Recovered build status')).toBeVisible();
  await expect(page.getByText('Recovered progress')).toBeVisible();
  await expect(page.locator('div[style*="red"]')).toHaveCount(0);
});

async function submitCommand(page: Page, text: string) {
  await page.getByLabel('명령 입력').fill(text);
  await page.getByRole('button', { name: '전송' }).click();
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
        message.content.includes('You generate a J.A.R.V.I.S HUD'),
    );
    const isRepairRequest = messages.some((message) =>
      message.content.includes('Repair this HUD JSX'),
    );

    if (isHudRequest || isRepairRequest) {
      const content =
        hudResponses[Math.min(hudIndex, hudResponses.length - 1)] ??
        jsonHud(VALID_BUILD_HUD);
      hudIndex += 1;
      await route.fulfill(sse(content));
      return;
    }

    await route.fulfill(sse('대화 응답입니다.'));
  });
}

function jsonHud(jsx: string): string {
  return JSON.stringify({ jsx });
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
