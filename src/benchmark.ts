import { JSONSchema7 } from 'json-schema';
import type { Signal } from '@lumino/signaling';
import { Statistic } from './statistics';

export interface IScenario {
  id: string;
  name: string;
  run: () => Promise<void>;

  setupSuite?: () => Promise<void>;
  cleanupSuite?: () => Promise<void>;

  setup?: () => Promise<void>;
  cleanup?: () => Promise<void>;

  configSchema: JSONSchema7;
  setOptions: (options: any) => void;
}

export interface IProgress {
  percentage: number;
}

export interface IBenchmark<T extends IOutcomeBase = IOutcomeBase> {
  id: string;
  name: string;
  run: (
    scenario: IScenario,
    options: any,
    progress?: Signal<any, IProgress>
  ) => Promise<T>;
  configSchema: JSONSchema7;
  render?: (props: { outcome: T }) => JSX.Element;
  /**
   * Checks whether the benchmark can be executed on runing browser.
   * If not defined, the benchmark is assumed to be available.
   */
  isAvailable?: () => boolean;
  sortColumn?: string;
}

interface IMeasurement {
  errors?: any[];
  // allow assignments
  [index: string]: any;
}

export interface ITimeMeasurement extends IMeasurement {
  times: number[];
}

export interface IProfileMeasurement extends IMeasurement {
  traces: ProfilerTrace[];
  /**
   * Average actual sampling interval.
   */
  samplingInterval: number;
}

export interface IOutcomeBase<T extends IMeasurement = IMeasurement> {
  results: T[];
  tags: Record<string, number>;
  totalTime: number;
  type: string;
}

export interface ITimingOutcome<T extends ITimeMeasurement = ITimeMeasurement>
  extends IOutcomeBase<T> {
  reference: number[];
  type: 'time';
}

export interface IProfilingOutcome<
  T extends IProfileMeasurement = IProfileMeasurement
> extends IOutcomeBase<T> {
  type: 'profile';
}

export type IOutcome = ITimingOutcome | IProfilingOutcome;

export async function profile(
  scenario: IScenario,
  options: ProfilerInitOptions,
  mode: 'micro' | 'macro',
  afterMicroStep: (step: number) => void,
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

  if (mode === 'micro') {
    for (let i = 0; i < n; i++) {
      if (scenario.setup) {
        await scenario.setup();
      }
      const profiler = new window.Profiler(options);
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
      afterMicroStep(i);
    }
  } else {
    const profiler = new window.Profiler(options);
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
    samplingInterval: Statistic.mean(
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
  inSuite = false
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
    } catch (e) {
      console.error('Benchmark failed in scenario', scenario, e);
      errors.push(e);
    }
    times.push(performance.now() - start);

    if (scenario.cleanup) {
      await scenario.cleanup();
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
