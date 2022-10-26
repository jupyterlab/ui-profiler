import { JSONSchema7 } from 'json-schema';

import {
  IScenario,
  IResult,
  IOutcome,
  IBenchmark,
  benchmark
} from './benchmark';
import { layoutReady, reportTagCounts, shuffled } from './utils';

import benchmarkOptionsSchema from './schema/benchmark-base.json';
import benchmarkRuleOptionsSchema from './schema/benchmark-rule.json';
import benchmarkRuleGroupOptionsSchema from './schema/benchmark-rule-group.json';

import type { BenchmarkOptions } from './types/_benchmark-base';
import type { StyleRuleBenchmarkOptions } from './types/_benchmark-rule';
import type { StyleRuleGroupBenchmarkOptions } from './types/_benchmark-rule-group';

interface IStylesheetResult extends IResult {
  content: string | null;
  source: string | null;
  stylesheetIndex: number;
}

interface IRuleDescription {
  selector: string;
  source: string | null;
  ruleIndex: number;
  stylesheetIndex: number;
}

interface IRuleData extends IRuleDescription {
  /**
   * The CSS style rule itself.
   */
  rule: CSSStyleRule;
  /**
   * Parent sheet of the rule.
   */
  sheet: CSSStyleSheet;
}

interface IRuleResult extends IResult, IRuleDescription {
  // no-op
}

interface IRuleBlock extends IResult {
  /**
   * What rules landed in this block?
   */
  rulesInBlock: IRuleDescription[];
  /**
   * Fow which block is this results?
   */
  block: number;
  /**
   * Into how many blocks were the styles split?
   */
  divisions: number;
  /**
   * For which randomization is this result?
   *
   * Note: zero indicates no randomization (original order).
   */
  randomization: number;
}

export const styleSheetsBenchmark: IBenchmark = {
  id: 'style-sheet',
  name: 'Style Sheet Benchmark',
  configSchema: benchmarkOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: BenchmarkOptions = {},
    progress
  ): Promise<IOutcome<IStylesheetResult>> => {
    const n = options.repeats || 3;
    const start = Date.now();
    const styles = [...document.querySelectorAll('style')];
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    const reference = await benchmark(scenario, n, true);
    console.log('Reference for', scenario.name, 'is:', reference);
    const results: IStylesheetResult[] = [];
    let j = 0;
    for (const style of styles) {
      const sheet = style.sheet;
      progress?.emit({ percentage: (100 * j) / styles.length });
      if (!sheet) {
        console.log(
          'Skipping style tag without stylesheet',
          j,
          'out of',
          styles.length
        );
        continue;
      }
      console.log('Benchmarking stylesheet', j, 'out of', styles.length);
      j++;
      sheet.disabled = true;
      await layoutReady();
      const times = await benchmark(scenario, n, true);
      times;
      await layoutReady();
      sheet.disabled = false;
      const cssMap = await extractSourceMap(style.textContent);
      results.push({
        content: style.textContent,
        times: times,
        source: cssMap != null ? cssMap.sources[0] : null,
        stylesheetIndex: j
      });
    }
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    progress?.emit({ percentage: 100 });
    return {
      results: results,
      reference: reference,
      tags: reportTagCounts(),
      totalTime: Date.now() - start
    };
  }
};

export const styleRuleBenchmark: IBenchmark = {
  id: 'style-rule',
  name: 'Style Rule Benchmark',
  configSchema: benchmarkRuleOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: StyleRuleBenchmarkOptions = {},
    progress
  ): Promise<IOutcome<IRuleResult>> => {
    const n = options.repeats || 3;
    const skipPattern = options.skipPattern
      ? new RegExp(options.skipPattern, 'g')
      : undefined;
    const start = Date.now();
    const styles = [...document.querySelectorAll('style')];
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    const reference = await benchmark(scenario, n, true);
    console.log('Reference for', scenario.name, 'is:', reference);
    const results: IRuleResult[] = [];
    let j = 0;
    for (const style of styles) {
      // TODO: more granular progress? (collect rules once for all styles?)
      progress?.emit({ percentage: (100 * j) / styles.length });
      console.log('Benchmarking stylesheet', j, 'out of', styles.length);
      j++;
      const rules = await collectRules([style], { skipPattern });
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        // benchmark without the rule
        rule.sheet.deleteRule(rule.ruleIndex);
        await layoutReady();
        const times = await benchmark(scenario, n, true);
        results.push({
          selector: rule.selector,
          times: times,
          source: rule.source,
          ruleIndex: rule.ruleIndex,
          stylesheetIndex: j
        });
        // restore the rule
        rule.sheet.insertRule(rule.rule.cssText, i);
        await layoutReady();
      }
    }
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    progress?.emit({ percentage: 100 });
    return {
      results: results,
      reference: reference,
      tags: reportTagCounts(),
      totalTime: Date.now() - start
    };
  }
};

export const styleRuleGroupBenchmark: IBenchmark = {
  id: 'style-rule-group',
  name: 'Style Rule Group Benchmark',
  configSchema: benchmarkRuleGroupOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: StyleRuleGroupBenchmarkOptions = {},
    progress
  ): Promise<IOutcome<IRuleBlock>> => {
    const n = options.repeats || 3;
    const skipPattern = options.skipPattern
      ? new RegExp(options.skipPattern, 'g')
      : undefined;
    const maxBlocks = options.maxBlocks || 5;
    const minBlocks = options.minBlocks || 2;
    const start = Date.now();
    let styles = [...document.querySelectorAll('style')];
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    const reference = await benchmark(scenario, n, true);
    console.log('Reference for', scenario.name, 'is:', reference);
    const results: IRuleBlock[] = [];
    const randomizations = options.sheetRandomizations || 0;
    let step = 0;
    const total = (maxBlocks - minBlocks + 1) * (randomizations + 1);
    for (
      let randomization = 0;
      randomization < randomizations + 1;
      randomization++
    ) {
      if (randomization !== 0) {
        styles = shuffled(styles);
      }
      const allRules = await collectRules(styles, { skipPattern });
      console.log(
        `Collected ${allRules.length} rules, randomization: ${randomization}`
      );

      for (let blocks = minBlocks; blocks <= maxBlocks; blocks++) {
        step += 1;
        progress?.emit({ percentage: (100 * step) / total });
        const rulesPerBlock = Math.round(allRules.length / blocks);
        console.log(
          `Benchmarking ${blocks} blocks, each having ${rulesPerBlock} rules`
        );
        for (let i = 0; i < blocks; i++) {
          const rulesInBlock = [];
          // remove rules from this block
          for (let j = rulesPerBlock; j >= 0; j--) {
            const ruleData = allRules[i * rulesPerBlock + j];
            if (typeof ruleData === 'undefined') {
              continue;
            }
            rulesInBlock.push(ruleData);
            ruleData.sheet.deleteRule(ruleData.ruleIndex);
          }
          await layoutReady();
          const times = await benchmark(scenario, n, true);
          results.push({
            times: times,
            rulesInBlock: rulesInBlock,
            block: i,
            divisions: blocks,
            randomization: randomization
          });
          // restore the rule
          for (let j = rulesInBlock.length - 1; j >= 0; j--) {
            const ruleData = rulesInBlock[j];
            ruleData.sheet.insertRule(
              ruleData.rule.cssText,
              ruleData.ruleIndex
            );
          }
          await layoutReady();
        }
      }
    }
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    progress?.emit({ percentage: 100 });
    return {
      results: results,
      reference: reference,
      tags: reportTagCounts(),
      totalTime: Date.now() - start
    };
  }
};

/**
 * Parsed source map, see https://sourcemaps.info/spec.html
 */
interface ISourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string[];
}

/**
 * Extract CSS source map from CSS text content.
 *
 * Note: if URL is embedded, fetch method will be used to retrive the JSON contents.
 */
async function extractSourceMap(
  cssContent: string | null
): Promise<ISourceMap | null> {
  if (!cssContent) {
    return null;
  }
  const matches = cssContent.matchAll(
    new RegExp('# sourceMappingURL=(.*)\\s*\\*/', 'g')
  );
  if (!matches) {
    return null;
  }
  let url = '';
  for (const match of matches) {
    const parts = match[1].split('data:application/json;base64,');
    if (parts.length > 1) {
      return JSON.parse(atob(parts[1]));
    } else {
      url = match[1];
    }
  }
  if (url === '') {
    return null;
  }
  const response = await fetch(url);
  return response.json();
}

async function collectRules(
  styles: HTMLStyleElement[],
  options: { skipPattern?: RegExp }
): Promise<IRuleData[]> {
  let j = 0;
  const allRules: IRuleData[] = [];
  for (const style of styles) {
    const sheet = style.sheet;
    if (!sheet) {
      continue;
    }
    const cssMap = await extractSourceMap(style.textContent);
    const sourceName = cssMap ? cssMap.sources[0] : null;
    j++;
    const rules = sheet.rules;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      if (
        options.skipPattern &&
        rule.selectorText.match(options.skipPattern) != null
      ) {
        continue;
      }
      allRules.push({
        rule: rule,
        selector: rule.selectorText,
        sheet: sheet,
        source: sourceName,
        ruleIndex: i,
        stylesheetIndex: j
      });
    }
  }
  return allRules;
}
