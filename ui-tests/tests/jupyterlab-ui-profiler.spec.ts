import { expect, test } from '@jupyterlab/galata';

test('should display UI Profiler in Launcher', async ({ page }) => {
  const section = page.locator('.jp-Launcher-section', {
    has: page.locator('.jp-LauncherCard[title="Open JupyterLab UI Profiler"]')
  });
  const handle = await page.waitForSelector(
    '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]'
  );
  await handle.focus();
  expect(await section.screenshot()).toMatchSnapshot('launcher.png');
});

test('should open UI Profiler', async ({ page }) => {
  const handle = await page.waitForSelector(
    '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]'
  );
  await handle.click();
  const panels = page.locator('.lm-DockPanel', {
    has: page.locator('.up-UIProfiler')
  });
  expect(await panels.screenshot()).toMatchSnapshot('ui-profiler.png');
});
