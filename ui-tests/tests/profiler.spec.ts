import { expect, test } from '@jupyterlab/galata';

const PROFILER_CARD_SELECTOR =
  '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]';

test.describe('Profiler UI', () => {
  test('adds launcher card', async ({ page }) => {
    const section = page.locator('.jp-Launcher-section', {
      has: page.locator(PROFILER_CARD_SELECTOR)
    });
    const handle = await page.waitForSelector(
      '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]'
    );
    await handle.focus();
    expect(await section.screenshot()).toMatchSnapshot('launcher.png');
  });

  test('opens in main area', async ({ page }) => {
    const handle = await page.waitForSelector(PROFILER_CARD_SELECTOR);
    await handle.click();
    const panels = page.locator('.lm-DockPanel', {
      has: page.locator('.up-UIProfiler')
    });
    expect(await panels.screenshot()).toMatchSnapshot('ui-profiler.png');
  });
});
