import { JSONSchema7 } from 'json-schema';
import React from 'react';

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

class RuleSetMap<T = HTMLElement, S = string> extends Map<T, Set<S>> {
  add(element: T, rule: S): void {
    let ruleSet = this.get(element);
    if (!ruleSet) {
      ruleSet = new Set<S>();
      this.set(element, ruleSet);
    }
    ruleSet.add(rule);
  }
  countRulesUsage(): Map<S, number> {
    const usage = new Map();
    for (const ruleSet of this.values()) {
      for (const selector of ruleSet.values()) {
        usage.set(selector, (usage.get(selector) || 0) + 1);
      }
    }
    return usage;
  }
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

      if (scenario.setupSuite) {
        await scenario.setupSuite();
      }
      const reference = await benchmark(scenario, n * 2, true);
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
      const relevantElements = [...relevantNodes].filter(
        node => node instanceof Element
      ) as Element[];
      const filteredElements = relevantElements.filter(
        element => element.tagName.toLocaleLowerCase() !== 'body'
      );
      console.log('Relevant nodes:', relevantNodes);

      // Find relevant class names and ids for rule style discovery.
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

      // Find relevant style rules.
      const results: IRuleResult[] = [];
      const styles = [...document.querySelectorAll('style')];
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

      // Prepare observer recording elements matching relevant rules.
      const touches = new Map<string, number>();
      const seenMatchingRule = new RuleSetMap<Element, string>();
      const touchedMatchingRule = new RuleSetMap<Element, string>();
      const recordMatches: MutationCallback = mutations => {
        const touchedNodes = new Set<Node>();
        for (const node of iterateAffectedNodes(mutations)) {
          touchedNodes.add(node);
        }
        for (const node of touchedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          for (const rule of relevantRules) {
            if (node.matches(rule.selector)) {
              touches.set(rule.selector, (touches.get(rule.selector) || 0) + 1);
              touchedMatchingRule.add(node, rule.selector);
            }
          }
        }
        for (const rule of relevantRules) {
          for (const element of document.querySelectorAll(rule.selector)) {
            seenMatchingRule.add(element, rule.selector);
          }
        }
      };

      // Start counting the nodes matching the relevant rules.
      const recordingObserver = new MutationObserver(recordMatches);
      recordingObserver.observe(document.body, observeEverythingConfig);
      await benchmark(scenario, n, true);
      await layoutReady();
      recordMatches(recordingObserver.takeRecords(), recordingObserver);
      recordingObserver.disconnect();
      const uniqueTouches = touchedMatchingRule.countRulesUsage();
      const uniqueApparences = seenMatchingRule.countRulesUsage();

      // Estimate impact of relevant rules on the scenario performance.
      for (let i = 0; i < rules.length; i++) {
        progress?.emit({ percentage: (100 * (i + 0.5)) / rules.length });
        const rule = rules[i];
        // Benchmark without the rule.
        rule.sheet.deleteRule(rule.ruleIndex);
        await layoutReady();
        const measurements = await benchmark(scenario, n, true);
        results.push({
          ...measurements,
          selector: rule.selector,
          source: rule.source,
          ruleIndex: rule.ruleIndex,
          stylesheetIndex: rule.stylesheetIndex,
          touchCount: touches.get(rule.selector) || 0,
          elementsTouched: uniqueTouches.get(rule.selector) || 0,
          elementsSeen: uniqueApparences.get(rule.selector) || 0
        });
        // Restore the rule.
        rule.sheet.insertRule(rule.rule.cssText, rule.ruleIndex);
        await layoutReady();
      }

      // Clean up.
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
    sortColumn: 'elementsSeen',
    interpretation: (
      <>
        <ul>
          <li>
            <code>elementsSeen</code>: how many elements were seen on the entire
            page when executing the scenario.
          </li>
          <li>
            <code>elementsTouched</code>: how many elements were modified or in
            the subtree of a modified element when executing the scenario.
          </li>
          <li>
            <code>touchCount</code>: upper bound on how many times the rule
            matched an element (will be high for rules matching many elements,
            and for rules matching a single element that is repeatedly modified
            in the chosen scenario).
          </li>
        </ul>
        <div>
          Low number of <code>elementsSeen</code> suggest potentially unused
          rule. Negative <code>Δ</code> highlights rules which may be
          deteriorating performance.
        </div>
      </>
    )
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
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    const styles = [...document.querySelectorAll('style')];
    const reference = await benchmark(scenario, n * 2, true);
    console.log('Reference for', scenario.name, 'is:', reference);
    const results: IStylesheetResult[] = [];
    let j = 0;
    let sheetIndex = 0;
    const stylesWithSheets = styles.filter(style => style.sheet);
    if (stylesWithSheets.length !== styles.length) {
      console.log(
        'Skipped',
        styles.length - stylesWithSheets.length,
        'style tags without stylesheets (out of',
        styles.length,
        'total)'
      );
    }
    for (const style of styles) {
      const sheet = style.sheet;
      // Always increment the sheet index.
      sheetIndex++;
      if (!sheet) {
        continue;
      }

      // Only increment the loop control variable if style included in denominator.
      progress?.emit({ percentage: (100 * j) / stylesWithSheets.length });
      j++;

      // Benchmark the style.
      sheet.disabled = true;
      await layoutReady();
      const measurements = await benchmark(scenario, n, true);
      await layoutReady();
      sheet.disabled = false;

      // Extract CSS map
      const cssMap = await extractSourceMap(style.textContent);

      // Store result.
      results.push({
        ...measurements,
        content: style.textContent,
        source: cssMap != null ? cssMap.sources[0] : null,
        stylesheetIndex: sheetIndex
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
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    const styles = [...document.querySelectorAll('style')];
    const reference = await benchmark(scenario, n * 2, true);
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
        stylesheetIndex: rule.stylesheetIndex,
        bgMatches: document.querySelectorAll(rule.selector).length
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
  interpretation: (
    <>
      <ul>
        <li>
          <code>bgMatches</code>: how many elements matched the rule at standby
          (as compared to during scenario execution); mostly useful to find too
          broad rules, or potentially unused rules with expensive selectors.
        </li>
      </ul>
      <div>
        Negative <code>Δ</code> highlights rules which may be deteriorating
        performance.
      </div>
    </>
  )
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
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    let styles = [...document.querySelectorAll('style')];
    const reference = await benchmark(scenario, n * 2, true);
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
