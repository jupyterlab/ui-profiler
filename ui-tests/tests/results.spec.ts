import { expect, galata, test } from '@jupyterlab/galata';
import * as path from 'path';

const PROFILER_CARD_SELECTOR =
  '.jp-LauncherCard[title="Open JupyterLab UI Profiler"]';

const fileNames = [
  'execution-time_menuOpen.profile.json',
  'style-sheet_menuOpen.profile.json',
  'style-rule-group_menuOpen.profile.json',
  'self-profile_completer-micro.profile.json',
  'self-profile_completer-macro.profile.json',
  'rule-usage_menuOpen.profile.json',
  'style-rule_menuOpen.profile.json'
];

test.use({ tmpPath: 'ui-profiler-results' });
test.describe.configure({ mode: 'parallel' });

test.describe('Results', () => {
  test.beforeAll(async ({ baseURL, request, tmpPath }) => {
    const contents = galata.newContentsHelper(baseURL, undefined, request);
    for (const fileName of fileNames) {
      await contents.uploadFile(
        path.resolve(__dirname, `./ui-profiler-results/${fileName}`),
        `${tmpPath}/${fileName}`
      );
    }
  });

  test.beforeEach(async ({ page }) => {
    const handle = await page.waitForSelector(PROFILER_CARD_SELECTOR);
    await handle.click();
    await page
      .locator('.up-BenchmarkHistory')
      .evaluate(element => (element.style.width = '50px'));
    await page
      .locator('.up-BenchmarkLauncher')
      .evaluate(element => (element.style.height = '0px'));

    await page.sidebar.open('left');
    await page.menu.clickMenuItem('View>Appearance>Show Left Sidebar');
    expect(await page.sidebar.isOpen('left')).toEqual(false);
    await page.menu.clickMenuItem('View>Appearance>Show Status Bar');
  });

  test('has neat layout', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory')
      .evaluate(element => (element.style.width = 'unset'));
    // unset does not work here
    await page
      .locator('.up-BenchmarkLauncher')
      .evaluate(element => (element.style.height = '300px'));
    await page
      .locator('.up-BenchmarkHistory-file >> text=execution-time_menuOpen')
      .click();
    const profiler = await page.waitForSelector('.up-UIProfiler');
    expect(await profiler.screenshot()).toMatchSnapshot(
      'ui-profiler-with-boxplot.png'
    );
  });

  test('shows summary', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=execution-time_menuOpen')
      .click();
    await page.locator('summary >> text=Options').click();
    const summary = await page.waitForSelector('.up-BenchmarkResult-summary');
    expect(await summary.screenshot()).toMatchSnapshot('result-summary.png');
  });

  test('shows options', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=execution-time_menuOpen')
      .click();
    await page.locator('summary >> text=Options').click();
    const summary = await page.waitForSelector('.up-BenchmarkResult-options');
    expect(await summary.screenshot()).toMatchSnapshot('result-options.png');
  });

  test('generates boxplot', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=execution-time_menuOpen')
      .click();
    const boxplot = await page.waitForSelector('.up-BoxPlot');
    expect(await boxplot.screenshot()).toMatchSnapshot('boxplot.png');
  });

  test('generates table for style sheets', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=style-sheet_menuOpen')
      .click();
    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    expect(await details.screenshot()).toMatchSnapshot('style-sheets.png');
  });

  test('generates blocks tables for rule groups', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=style-rule-group_menuOpen')
      .click();
    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    await page
      .locator('.up-BenchmarkResult-details input[value="rule"]')
      .click();
    expect(await details.screenshot()).toMatchSnapshot(
      'style-rule-groups-rules.png'
    );
  });

  test('generates rules tables for rule groups', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=style-rule-group_menuOpen')
      .click();
    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    await page
      .locator('.up-BenchmarkResult-details input[value="block"]')
      .click();
    expect(await details.screenshot()).toMatchSnapshot(
      'style-rule-groups-blocks.png'
    );
  });

  test('generates self-profiling timeline and table in micro mode', async ({
    page
  }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=self-profile_completer-micro')
      .click();

    await page
      .locator('.up-ProfileTrace')
      .evaluate(element => (element.style.height = '400px'));
    await page
      .locator('.up-BenchmarkResult-summary')
      .evaluate(element => (element.style.display = 'none'));
    await page
      .locator('.up-BenchmarkResult-options')
      .evaluate(element => (element.style.display = 'none'));

    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    expect(await details.screenshot()).toMatchSnapshot(
      'self-profiling-micro-details.png'
    );
  });

  test('generates self-profiling timeline and table in macro mode', async ({
    page
  }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=self-profile_completer-macro')
      .click();

    const details = await page.waitForSelector(
      '.up-BenchmarkResult-details .up-ProfileTrace'
    );
    expect(await details.screenshot()).toMatchSnapshot(
      'self-profiling-macro-trace.png'
    );
  });

  test('generates table for rule usage', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=rule-usage_menuOpen')
      .click();
    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    expect(await details.screenshot()).toMatchSnapshot('rule-usage.png');
  });

  test('generates table for rules', async ({ page }) => {
    await page
      .locator('.up-BenchmarkHistory-file >> text=style-rule_menuOpen')
      .click();
    const details = await page.waitForSelector('.up-BenchmarkResult-details');
    expect(await details.screenshot()).toMatchSnapshot('rules.png');
  });
});
