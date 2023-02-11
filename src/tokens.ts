import { Token } from '@lumino/coreutils';
import { JSONSchema7 } from 'json-schema';

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

/**
 * The UIProfiler public API.
 */
export interface IUIProfiler {
  /**
   * Add scenario to profiler.
   */
  addScenario(scenario: IScenario): void;
}

/**
 * The UIProfiler token.
 */
export const IUIProfiler = new Token<IUIProfiler>(
  '@jupyterlab/ui-profiler:manager'
);
