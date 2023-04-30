import { JSONSchema7 } from 'json-schema';
import { Statistic } from './statistics';
import { reportTagCounts } from './utils';
import { layoutReady } from './dramaturg';
import benchmarkExecutionOptionsSchema from './schema/benchmark-execution.json';
import type { ExecutionTimeBenchmarkOptions } from './types';
import { renderTimings } from './ui';
import {
  IBenchmark,
  IScenario,
  IProfileMeasurement,
  ITimingOutcome,
  ITimeMeasurement
} from './tokens';

export async function profile(
  scenario: IScenario,
  options: ProfilerInitOptions,
  mode: 'micro' | 'macro',
  afterMicroStep: (step: number) => boolean,
  n = 3,
  inSuite = false
): Promise<IProfileMeasurement> {
  if (!inSuite && scenario.setupSuite) {
    await scenario.setupSuite();
  }
  if (typeof window.Profiler === 'undefined') {
    throw new Error('Self-profiling is not available');
  }
  const traces = [];
  const errors = [];

  let profiler: Profiler;

  if (mode === 'micro') {
    for (let i = 0; i < n; i++) {
      if (scenario.setup) {
        await scenario.setup();
      }
      profiler = new window.Profiler(options);
      try {
        await scenario.run();
      } catch (e) {
        console.error('Benchmark failed in scenario', scenario, e);
        errors.push(e);
      }
      traces.push(await profiler.stop());

      if (scenario.cleanup) {
        await scenario.cleanup();
      }
      const shouldContinue = afterMicroStep(i);
      if (!shouldContinue) {
        break;
      }
    }
  } else {
    profiler = new window.Profiler(options);
    for (let i = 0; i < n; i++) {
      if (scenario.setup) {
        await scenario.setup();
      }
      try {
        await scenario.run();
      } catch (e) {
        console.error('Benchmark failed in scenario', scenario, e);
        errors.push(e);
      }
      if (scenario.cleanup) {
        await scenario.cleanup();
      }
    }
    traces.push(await profiler.stop());
  }
  if (!inSuite && scenario.cleanupSuite) {
    await scenario.cleanupSuite();
  }
  return {
    traces,
    errors,
    samplingInterval: profiler!.sampleInterval,
    averageSampleInterval: Statistic.mean(
      traces
        .map(trace => {
          let previous = trace.samples[0].timestamp;
          const intervals = [];
          for (const sample of trace.samples.slice(1)) {
            intervals.push(sample.timestamp - previous);
            previous = sample.timestamp;
          }
          return intervals;
        })
        .flat()
    )
  };
}

export async function benchmark(
  scenario: IScenario,
  n = 3,
  inSuite = false,
  afterStep?: (step: number) => boolean
): Promise<ITimeMeasurement> {
  if (!inSuite && scenario.setupSuite) {
    await scenario.setupSuite();
  }
  const times = [];
  const errors = [];
  for (let i = 0; i < n; i++) {
    if (scenario.setup) {
      await scenario.setup();
    }
    const start = performance.now();
    try {
      await scenario.run();
      times.push(performance.now() - start);
    } catch (e) {
      console.error('Benchmark failed in scenario', scenario, e);
      errors.push(e);
    }

    if (scenario.cleanup) {
      await scenario.cleanup();
    }
    if (afterStep) {
      const shouldContinue = afterStep(i);
      if (!shouldContinue) {
        break;
      }
    }
  }
  if (!inSuite && scenario.cleanupSuite) {
    await scenario.cleanupSuite();
  }
  return {
    times,
    errors
  };
}

export const executionTimeBenchmark: IBenchmark<ITimingOutcome> = {
  id: 'execution-time',
  name: 'Execution Time',
  configSchema: benchmarkExecutionOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: ExecutionTimeBenchmarkOptions,
    progress,
    stopSignal
  ): Promise<ITimingOutcome> => {
    let stop = false;
    const stopListener = () => {
      stop = true;
    };
    stopSignal?.connect(stopListener);
    const n = options.repeats || 3;
    const start = Date.now();
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    await layoutReady();
    const reference = await benchmark(scenario, n, true, i => {
      progress?.emit({ percentage: (100 * (i + 1)) / n });
      return !stop;
    });
    await layoutReady();
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    stopSignal?.disconnect(stopListener);
    return {
      reference: reference.times,
      results: [reference],
      tags: reportTagCounts(),
      totalTime: Date.now() - start,
      type: 'time',
      interrupted: stop
    };
  },
  render: renderTimings
};
