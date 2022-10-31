import { JSONSchema7 } from 'json-schema';

import {
  IScenario,
  ITimeMeasurement,
  ITimingOutcome,
  IBenchmark,
  benchmark
} from './benchmark';
import { reportTagCounts, shuffled, iterateAffectedNodes } from './utils';
import { layoutReady } from './dramaturg';
import {
  IRuleData,
  IRuleDescription,
  extractSourceMap,
  collectRules
} from './css';
import { renderBlockResult } from './ui';

import benchmarkOptionsSchema from './schema/benchmark-base.json';
import benchmarkRuleOptionsSchema from './schema/benchmark-rule.json';
import benchmarkRuleGroupOptionsSchema from './schema/benchmark-rule-group.json';
import benchmarkRuleUsageOptionsSchema from './schema/benchmark-rule-usage.json';

import type { BenchmarkOptions } from './types/_benchmark-base';
import type { StyleRuleBenchmarkOptions } from './types/_benchmark-rule';
import type { StyleRuleGroupBenchmarkOptions } from './types/_benchmark-rule-group';
import type { StyleRuleUsageOptions } from './types/_benchmark-rule-usage';

interface IStylesheetResult extends ITimeMeasurement {
  content: string | null;
  source: string | null;
  stylesheetIndex: number;
}

interface IRuleResult extends ITimeMeasurement, IRuleDescription {
  // no-op
}

export interface IRuleBlockResult extends ITimeMeasurement {
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

export const styleRuleUsageBenchmark: IBenchmark<ITimingOutcome<IRuleResult>> =
  {
    id: 'rule-usage',
    name: 'Style Rule Usage',
    configSchema: benchmarkRuleUsageOptionsSchema as JSONSchema7,
    run: async (
      scenario: IScenario,
      options: StyleRuleUsageOptions = {},
      progress
    ): Promise<ITimingOutcome<IRuleResult>> => {
      const n = options.repeats || 3;
      const start = Date.now();
      const skipPattern = options.skipPattern
        ? new RegExp(options.skipPattern, 'g')
        : undefined;
      const excludePattern = options.excludeMatchPattern
        ? new RegExp(options.excludeMatchPattern, 'g')
        : undefined;

      const styles = [...document.querySelectorAll('style')];

      if (scenario.setupSuite) {
        await scenario.setupSuite();
      }
      const reference = await benchmark(scenario, n, true);
      console.log('Reference for', scenario.name, 'is:', reference);

      const observeEverythingConfig = {
        subtree: true,
        childList: true,
        attributes: true
      };
      const relevantNodes = new Set<Node>();
      const collect: MutationCallback = mutations => {
        for (const node of iterateAffectedNodes(mutations)) {
          relevantNodes.add(node);
        }
      };
      const collectingObserver = new MutationObserver(collect);

      await layoutReady();

      // Execute action to determine relevant nodes.
      collectingObserver.observe(document.body, observeEverythingConfig);
      await benchmark(scenario, n, true);
      await layoutReady();
      collect(collectingObserver.takeRecords(), collectingObserver);
      collectingObserver.disconnect();

      console.log('Relevant nodes:', relevantNodes);
      const relevantElements = [...relevantNodes].filter(
        node => node instanceof Element
      ) as Element[];
      const filteredElements = relevantElements.filter(
        element => element.tagName.toLocaleLowerCase() !== 'body'
      );
      const relevantClassNames = new Set([
        ...filteredElements
          .map(element => [...element.classList.values()])
          .flat()
          .filter(rule => !excludePattern || !rule.match(excludePattern))
      ]);
      const relevantIds = filteredElements
        .filter(element => element.id)
        .map(element => element.id);
      console.log('Relevant class names:', relevantClassNames);
      console.log('Relevant IDs:', relevantIds);

      const results: IRuleResult[] = [];
      const allRules = await collectRules(styles, { skipPattern });
      const relevantRules = new Set<IRuleData>();
      for (const rule of allRules) {
        for (const className of relevantClassNames) {
          if (rule.selector.includes('.' + className)) {
            relevantRules.add(rule);
            break;
          }
        }
        for (const id of relevantIds) {
          if (rule.selector.includes('#' + id)) {
            relevantRules.add(rule);
            break;
          }
        }
      }

      const rules = [...relevantRules];
      progress?.emit({ percentage: (100 * 0.5) / rules.length });

      const matches = new Map<string, number>();

      const recordMatches: MutationCallback = mutations => {
        const touchedNodes = new Set<Node>();
        for (const node of iterateAffectedNodes(mutations)) {
          touchedNodes.add(node);
        }
        for (const node of touchedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          for (const rule of relevantRules) {
            if (node.matches(rule.selector)) {
              matches.set(rule.selector, (matches.get(rule.selector) || 0) + 1);
            }
          }
        }
      };
      const recordingObserver = new MutationObserver(recordMatches);

      // Count number of nodes matching the relevant rules.
      recordingObserver.observe(document.body, observeEverythingConfig);
      await benchmark(scenario, n, true);
      await layoutReady();
      recordMatches(recordingObserver.takeRecords(), recordingObserver);
      recordingObserver.disconnect();

      for (let i = 0; i < rules.length; i++) {
        progress?.emit({ percentage: (100 * (i + 0.5)) / rules.length });
        const rule = rules[i];
        // benchmark without the rule
        rule.sheet.deleteRule(rule.ruleIndex);
        await layoutReady();
        const measurements = await benchmark(scenario, n, true);
        results.push({
          ...measurements,
          selector: rule.selector,
          source: rule.source,
          ruleIndex: rule.ruleIndex,
          stylesheetIndex: rule.stylesheetIndex,
          matches: matches.get(rule.selector) || 0
        });
        // restore the rule
        rule.sheet.insertRule(rule.rule.cssText, rule.ruleIndex);
        await layoutReady();
      }
      if (scenario.cleanupSuite) {
        await scenario.cleanupSuite();
      }
      progress?.emit({ percentage: 100 });
      return {
        results: results,
        reference: reference.times,
        tags: reportTagCounts(),
        totalTime: Date.now() - start,
        type: 'time'
      };
    },
    sortColumn: 'matches'
  };

export const styleSheetsBenchmark: IBenchmark<
  ITimingOutcome<IStylesheetResult>
> = {
  id: 'style-sheet',
  name: 'Style Sheets',
  configSchema: benchmarkOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: BenchmarkOptions = {},
    progress
  ): Promise<ITimingOutcome<IStylesheetResult>> => {
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
      const measurements = await benchmark(scenario, n, true);
      await layoutReady();
      sheet.disabled = false;
      const cssMap = await extractSourceMap(style.textContent);
      results.push({
        ...measurements,
        content: style.textContent,
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
      reference: reference.times,
      tags: reportTagCounts(),
      totalTime: Date.now() - start,
      type: 'time'
    };
  }
};

export const styleRuleBenchmark: IBenchmark<ITimingOutcome<IRuleResult>> = {
  id: 'style-rule',
  name: 'Style Rules',
  configSchema: benchmarkRuleOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: StyleRuleBenchmarkOptions = {},
    progress
  ): Promise<ITimingOutcome<IRuleResult>> => {
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
    const rules = await collectRules(styles, { skipPattern });
    for (let i = 0; i < rules.length; i++) {
      progress?.emit({ percentage: (100 * i) / rules.length });
      const rule = rules[i];
      // benchmark without the rule
      rule.sheet.deleteRule(rule.ruleIndex);
      await layoutReady();
      const measurements = await benchmark(scenario, n, true);
      results.push({
        ...measurements,
        selector: rule.selector,
        source: rule.source,
        ruleIndex: rule.ruleIndex,
        stylesheetIndex: rule.stylesheetIndex
      });
      // restore the rule
      rule.sheet.insertRule(rule.rule.cssText, rule.ruleIndex);
      await layoutReady();
    }
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    progress?.emit({ percentage: 100 });
    return {
      results: results,
      reference: reference.times,
      tags: reportTagCounts(),
      totalTime: Date.now() - start,
      type: 'time'
    };
  }
};

export const styleRuleGroupBenchmark: IBenchmark<
  ITimingOutcome<IRuleBlockResult>
> = {
  id: 'style-rule-group',
  name: 'Style Rule Groups',
  configSchema: benchmarkRuleGroupOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: StyleRuleGroupBenchmarkOptions = {},
    progress
  ): Promise<ITimingOutcome<IRuleBlockResult>> => {
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
    const results: IRuleBlockResult[] = [];
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
          const measurements = await benchmark(scenario, n, true);
          results.push({
            ...measurements,
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
      reference: reference.times,
      tags: reportTagCounts(),
      totalTime: Date.now() - start,
      type: 'time'
    };
  },
  render: renderBlockResult
};
