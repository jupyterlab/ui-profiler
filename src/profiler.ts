import { JupyterFrontEnd } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { JSONObject } from '@lumino/coreutils';
import type { DockPanel } from '@lumino/widgets';
import { ISignal, Signal } from '@lumino/signaling';
import {} from './utils';
import {
  IBenchmarkResult,
  IJupyterState,
  IOutcome,
  ITimingOutcome,
  IProfilingOutcome,
  IBenchmark,
  IScenario,
  IUIProfiler,
  IProgress
} from './tokens';

function benchmarkId(result: Omit<IBenchmarkResult, 'id'>): string {
  return [
    result.benchmark,
    result.scenario,
    result.completed.toISOString()
  ].join('_');
}

export class UIProfiler implements IUIProfiler {
  constructor(protected options: UIProfiler.IOptions) {
    // no-op
  }

  /**
   * Signal emitted when a new scenario is added.
   */
  get scenarioAdded(): ISignal<IUIProfiler, IScenario> {
    return this._scenarioAdded;
  }

  /**
   * Signal remitting progress updates during execution.
   */
  get progress(): ISignal<IUIProfiler, IProgress> {
    return this._progress;
  }

  get benchmarks(): IBenchmark[] {
    return this.options.benchmarks;
  }

  get scenarios(): IScenario[] {
    return this._scenarios;
  }

  /**
   * Add scenario to profiler.
   */
  addScenario(scenario: IScenario): void {
    this._scenarios.push(scenario);
    this._scenarioAdded.emit(scenario);
  }

  async runBenchmark<T extends IOutcome = ITimingOutcome | IProfilingOutcome>(
    scenario: {
      id: string;
      options: JSONObject;
    },
    benchmark: {
      id: string;
      options: JSONObject;
    }
  ): Promise<IBenchmarkResult<T>> {
    const benchmarkRunner = this.options.benchmarks.find(
      b => b.id === benchmark.id
    );
    if (!benchmarkRunner) {
      throw Error(`Benchmark with id ${benchmark} not found`);
    }
    const scenarioInstance = this._scenarios.find(s => s.id === scenario.id);
    if (!scenarioInstance) {
      throw Error(`Scenario with id ${scenario} not found`);
    }

    if (scenarioInstance.setOptions) {
      scenarioInstance.setOptions(scenario.options);
    }
    this._progress.emit({ percentage: 0 });
    const result = (await benchmarkRunner.run(
      scenarioInstance,
      benchmark.options,
      this._progress,
      this._abortBenchmark
    )) as T;
    if (result.interrupted) {
      this._progress.emit({ percentage: NaN, interrupted: true });
    } else {
      this._progress.emit({ percentage: 100 });
    }
    const data: Omit<IBenchmarkResult<T>, 'id'> = {
      outcome: result,
      options: {
        benchmark: benchmark.options,
        scenario: scenario.options
      },
      benchmark: benchmark.id,
      scenario: scenario.id,
      userAgent: window.navigator.userAgent,
      hardwareConcurrency: window.navigator.hardwareConcurrency,
      completed: new Date(),
      windowSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      jupyter: this.getJupyterState()
    };
    return {
      ...data,
      id: benchmarkId(data)
    };
  }

  abortBenchmark(): void {
    this._abortBenchmark.emit();
  }

  protected getJupyterState(): IJupyterState {
    const app = this.options.app;
    return {
      client: app.name,
      version: app.version,
      devMode: (PageConfig.getOption('devMode') || '').toLowerCase() === 'true',
      mode: PageConfig.getOption('mode') as DockPanel.Mode
    };
  }

  private _scenarios: IScenario[] = [];
  private _scenarioAdded: Signal<UIProfiler, IScenario> = new Signal(this);
  private _abortBenchmark: Signal<UIProfiler, void> = new Signal(this);
  private _progress: Signal<UIProfiler, IProgress> = new Signal(this);
}

namespace UIProfiler {
  export interface IOptions {
    app: JupyterFrontEnd;
    benchmarks: IBenchmark[];
  }
}
