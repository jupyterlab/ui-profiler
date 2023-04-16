import { Token, JSONObject } from '@lumino/coreutils';
import { JSONSchema7 } from 'json-schema';
import type { ISignal, Signal } from '@lumino/signaling';
import type { DockPanel } from '@lumino/widgets';

export interface IJupyterState {
  version: string;
  client: string;
  devMode: boolean;
  mode: DockPanel.Mode;
}

/**
 * Scenario defining set of steps to carry out during benchmarking.
 */
export interface IScenario {
  /**
   * The internal identifier, has to be unique.
   */
  id: string;

  /**
   * The name displayed to user.
   */
  name: string;

  /**
   * The actual scenario execution.
   *
   * Note: any async calls made in the `run()` function should be awaited so
   * that the execution time measurements are accurate and to prevent calling
   * `cleanup()` too early.
   */
  run: () => Promise<void>;

  /**
   * Prepare scenario before running, called once for any given benchmark run.
   */
  setupSuite?: () => Promise<void>;

  /**
   * Clean up after scenario running, called once for any given benchmark run.
   */
  cleanupSuite?: () => Promise<void>;

  /**
   * Prepare for scenario repeat, called as many times as benchmark repeats.
   */
  setup?: () => Promise<void>;

  /**
   * Clean up after scenario, called as many times as benchmark repeats.
   */
  cleanup?: () => Promise<void>;

  /**
   * Configuration schema used to build the configuration form with rjsf.
   */
  configSchema?: JSONSchema7;

  /**
   * Callback receiving JSON object with user configuration choices.
   */
  setOptions?: (options: any) => void;
}

export interface IBenchmark<T extends IOutcomeBase = IOutcomeBase> {
  /**
   * Unique identifier.
   */
  id: string;
  /**
   * User-facing name of the benchmark.
   */
  name: string;
  /**
   * Function excuting the benchmark for given scenario.
   * @param scenario - the scenario to execute.
   * @param options - the JSON data from rjsf form generated from `configSchema`.
   */
  run: (
    scenario: IScenario,
    options: any,
    progress?: Signal<any, IProgress>,
    stopSignal?: ISignal<any, void>
  ) => Promise<T>;
  /**
   * Configuration schema for rendering by rjsf.
   */
  configSchema: JSONSchema7;
  /**
   * Custom renderer for results.
   */
  render?: (props: { outcome: T }) => JSX.Element;
  /**
   * Checks whether the benchmark can be executed on runing browser.
   * If not defined, the benchmark is assumed to be available.
   */
  isAvailable?: () => boolean;
  /**
   * Column to sort results by when presenting in a table.
   */
  sortColumn?: string;
  /**
   * Brief (one-two sentences) explanation how to interpret the results.
   */
  interpretation?: string | JSX.Element;
}

export interface IMeasurement {
  errors?: any[];
  // allow assignments
  [index: string]: any;
}

interface IOutcomeBase<T extends IMeasurement = IMeasurement> {
  results: T[];
  tags: Record<string, number>;
  totalTime: number;
  type: string;
  interrupted: boolean;
}

export interface IProgress {
  percentage: number;
  interrupted?: boolean;
  errored?: boolean;
}

export interface ITimeMeasurement extends IMeasurement {
  times: number[];
}

export interface IProfileMeasurement extends IMeasurement {
  traces: ProfilerTrace[];
  /**
   * Average actual sampling interval.
   */
  averageSampleInterval: number;
  /**
   * Sampling interval reported by profiler.
   */
  samplingInterval: number;
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

export interface IBenchmarkResult<T extends IOutcome = IOutcome> {
  options: {
    scenario: JSONObject;
    benchmark: JSONObject;
  };
  benchmark: string;
  scenario: string;
  userAgent: string;
  hardwareConcurrency: number;
  completed: Date;
  windowSize: {
    width: number;
    height: number;
  };
  id: string;
  jupyter: IJupyterState;
  outcome: T;
  /** @deprecated - use outcome instead **/
  result?: T;
}

/**
 * The UIProfiler public API.
 */
export interface IUIProfiler {
  /**
   * Add scenario to profiler.
   */
  addScenario(scenario: IScenario): void;

  /**
   * Run scenario.
   */
  runBenchmark<T extends IOutcome = IOutcome>(
    scenario: {
      id: string;
      options: JSONObject;
    },
    benchmark: {
      id: string;
      options: JSONObject;
    }
  ): Promise<IBenchmarkResult<T>>;

  /**
   * Signal emitted when a new scenario is added.
   */
  readonly scenarioAdded: ISignal<IUIProfiler, IScenario>;

  /**
   * Request interruption in execution of current benchmark.
   */
  abortBenchmark(): void;

  /**
   * Signal remitting progress updates during execution.
   */
  readonly progress: ISignal<IUIProfiler, IProgress>;

  readonly benchmarks: IBenchmark[];
  readonly scenarios: IScenario[];
}

/**
 * The UIProfiler token.
 */
export const IUIProfiler = new Token<IUIProfiler>(
  '@jupyterlab/ui-profiler:plugin'
);
