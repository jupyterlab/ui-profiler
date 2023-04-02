import { expect, galata, test } from '@jupyterlab/galata';

const PROFILER_CARD_SELECTOR =
  '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]';

const START_BUTTON_SELECTOR =
  '.up-BenchmarkLauncher-launchbar-buttons .jp-mod-accept';

const REPEATS_INPUT_SELECTOR = '#up-profiler-benchmark_repeats';

const REFRESH_BUTTON_SELECTOR = '[data-command="filebrowser:refresh"]';

const HOME_SELECTOR = '.jp-BreadCrumbs-home';

test.describe('Profiler UI', () => {
  test.beforeEach(async ({ baseURL, request }) => {
    const contents = galata.newContentsHelper(baseURL, undefined, request);
    // delete directory to ensure there are no stale results
    await contents.deleteDirectory('ui-profiler-results');
  });

  test.afterAll(async ({ baseURL, request }) => {
    const contents = galata.newContentsHelper(baseURL, undefined, request);
    // clean up results
    await contents.deleteDirectory('ui-profiler-results');
  });

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

  test('creates result even after removing results directory', async ({
    page,
    request,
    baseURL
  }) => {
    const contents = galata.newContentsHelper(baseURL, undefined, request);
    const handle = await page.waitForSelector(PROFILER_CARD_SELECTOR);
    await handle.click();
    const resultLocator = page.locator(
      '.up-BenchmarkHistory-file >> text=execution-time_menuOpen'
    );
    const directoryLocator = page.locator(
      '.jp-DirListing-item >> text="ui-profiler-results"'
    );
    await page.locator(HOME_SELECTOR).click();
    await expect(directoryLocator).toHaveCount(1);
    await expect(resultLocator).toHaveCount(0);
    const startButton = await page.waitForSelector(START_BUTTON_SELECTOR);
    // delete it second time after it was created
    await contents.deleteDirectory('ui-profiler-results');
    const refreshButton = page.locator(REFRESH_BUTTON_SELECTOR);
    await refreshButton.click();
    await expect(directoryLocator).toHaveCount(0);
    const repeatsInput = await page.waitForSelector(REPEATS_INPUT_SELECTOR);
    await repeatsInput.fill('5');
    await startButton.click();
    await page.waitForSelector('.up-mod-completed');
    await expect(resultLocator).toHaveCount(1);
    await refreshButton.click();
    await expect(directoryLocator).toHaveCount(1);
  });
});
