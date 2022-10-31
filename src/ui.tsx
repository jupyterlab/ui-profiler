import Form from '@rjsf/core';
import React from 'react';
import { ReactWidget, UseSignal } from '@jupyterlab/apputils';
import { Contents, ServiceManager } from '@jupyterlab/services';
import { ProgressBar } from '@jupyterlab/statusbar';
import { ITranslator } from '@jupyterlab/translation';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import { Signal, ISignal } from '@lumino/signaling';
import {
  IBenchmark,
  IOutcome,
  ITimeMeasurement,
  IScenario,
  IProgress,
  ITimingOutcome,
  IProfilingOutcome
} from './benchmark';
import { formatTime, IJupyterState, extractBrowserVersion } from './utils';
import { IRuleBlockResult } from './styleBenchmarks';
import { extractTimes } from './jsBenchmarks';
import {
  CustomTemplateFactory,
  CustomArrayTemplateFactory,
  CustomObjectTemplateFactory
} from './templates';
import { Statistic } from './statistics';
import { TimingTable, ResultTable } from './table';
import { LuminoWidget } from './lumino';

interface IProfilerProps {
  benchmarks: (IBenchmark<ITimingOutcome> | IBenchmark<IProfilingOutcome>)[];
  scenarios: IScenario[];
  /**
   * Translator object
   */
  translator: ITranslator;
  upload: (file: File) => Promise<Contents.IModel>;
  getJupyterState: () => IJupyterState;
}

interface ILauncherProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
  onResult: (result: IBenchmarkResult) => void;
}

interface IMonitorProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
}

interface IProfilerState {
  benchmarks: Set<IBenchmark<ITimingOutcome> | IBenchmark<IProfilingOutcome>>;
  scenarios: Set<IScenario>;
  /**
   * Field template
   */
  fieldTemplate?: ReturnType<typeof CustomTemplateFactory>;
  /**
   * Array Field template
   */
  arrayFieldTemplate?: ReturnType<typeof CustomArrayTemplateFactory>;
  /**
   * Object Field template
   */
  objectFieldTemplate?: ReturnType<typeof CustomObjectTemplateFactory>;
}

interface IConfigValue {
  scenarios: {
    [id: string]: JSONObject;
  };
  benchmarks: {
    [id: string]: JSONObject;
  };
}

export function renderProfile(props: {
  outcome: IProfilingOutcome;
}): JSX.Element {
  // Cache the function table.
  const functionWidget = React.useRef<TimingTable | null>(null);
  if (
    functionWidget.current === null ||
    functionWidget.current.stateSource !== props.outcome
  ) {
    const functionTimings: Record<string, ITimeMeasurement> = {};
    for (const result of props.outcome.results) {
      for (const trace of result.traces) {
        for (const timing of extractTimes(trace)) {
          const timingId = [
            timing.name,
            timing.resource,
            timing.column,
            timing.line
          ].join('-');
          if (timingId in functionTimings) {
            functionTimings[timingId].times.push(timing.time);
          } else {
            const entry = {
              name: timing.name,
              times: [timing.time],
              resource: timing.resource,
              column: timing.column,
              line: timing.line
            };
            functionTimings[timingId] = entry;
          }
        }
      }
    }
    const filteredTimings = [...Object.values(functionTimings)].filter(
      timing => {
        const isNativeProfilerCall =
          typeof timing.resource === 'undefined' && timing.name === 'Profiler';
        const isOurProfilerCode =
          timing.resource &&
          timing.resource.includes('@jupyterlab-benchmarks/ui-profiler');
        return !isNativeProfilerCall && !isOurProfilerCode;
      }
    );
    if (filteredTimings.length !== 0) {
      functionWidget.current = new TimingTable({
        measurements: filteredTimings,
        stateSource: props.outcome,
        lowerIsBetter: true
      });
    } else {
      functionWidget.current = null;
    }
  }
  return (
    <>
      {functionWidget.current ? (
        <LuminoWidget widget={functionWidget.current} />
      ) : (
        'No results available. Reduce sampling interval, use macro mode, and/or increase the number of repeats.'
      )}
    </>
  );
}

export function renderBlockResult(props: {
  outcome: ITimingOutcome<IRuleBlockResult>;
}): JSX.Element {
  const results = props.outcome.results;
  const [display, setDisplay] = React.useState('block');
  // Cache the blocks table.
  const blocksWidget = React.useRef<TimingTable | null>(null);
  if (
    blocksWidget.current === null ||
    blocksWidget.current.stateSource !== props.outcome
  ) {
    blocksWidget.current = new TimingTable({
      measurements: results,
      reference: props.outcome.reference,
      stateSource: props.outcome,
      lowerIsBetter: false
    });
  }
  // Cache the rules table.
  const rulesWidget = React.useRef<TimingTable | null>(null);
  if (
    rulesWidget.current === null ||
    rulesWidget.current.stateSource !== props.outcome
  ) {
    const ruleResults: Record<string, ITimeMeasurement> = {};
    for (const block of results) {
      for (const rule of block.rulesInBlock) {
        if (rule.selector in ruleResults) {
          ruleResults[rule.selector].times.push(...block.times);
        } else {
          const entry = {
            ...rule,
            times: [...block.times],
            errors: block.errors ? [...block.errors] : []
          };
          delete (entry as any).sheet;
          delete (entry as any).rule;
          ruleResults[rule.selector] = entry;
        }
      }
    }
    rulesWidget.current = new TimingTable({
      measurements: [...Object.values(ruleResults)],
      reference: props.outcome.reference,
      stateSource: props.outcome,
      lowerIsBetter: false
    });
  }
  return (
    <>
      <div
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setDisplay(event.target.value);
        }}
      >
        <label>
          <input type="radio" checked={display === 'block'} value="block" />
          Blocks
        </label>
        <label>
          <input type="radio" checked={display === 'rule'} value="rule" />
          Rules
        </label>
      </div>
      {display === 'block' ? (
        <LuminoWidget widget={blocksWidget.current} />
      ) : (
        <LuminoWidget widget={rulesWidget.current} />
      )}
    </>
  );
}

export class UIProfiler extends ReactWidget {
  constructor(private props: IProfilerProps) {
    super();
    this.progress = new Signal(this);
    this.handleResult = this.handleResult.bind(this);
    this.loadResult = this.loadResult.bind(this);
    this.manager = new ServiceManager();
    this.resultAdded = new Signal(this);
  }
  handleResult(result: IBenchmarkResult): void {
    this.result = result;
    this.update();
    this.resultAdded.emit(result);
  }

  async loadResult(file: Contents.IModel): Promise<void> {
    file = await this.manager.contents.get(file.path);
    this.handleResult(JSON.parse(file.content));
  }

  render<T extends IProfilingOutcome | ITimingOutcome>(): JSX.Element {
    return (
      <div className="up-UIProfiler">
        <BenchmarkLauncher
          onResult={this.handleResult}
          progress={this.progress}
          {...this.props}
        />
        <BenchmarkHistory
          resultAdded={this.resultAdded}
          manager={this.manager}
          onSelect={this.loadResult}
          {...this.props}
        />
        <BenchmarkResult<T>
          result={this.result as IBenchmarkResultBase<T>}
          scenarios={this.props.scenarios}
          benchmarks={
            this.props.benchmarks.filter(
              b => b.id === this.result?.benchmark
            ) as unknown as IBenchmark<T>[]
          }
        />
      </div>
    );
  }

  progress: Signal<any, IProgress>;
  resultAdded: Signal<any, IBenchmarkResult>;
  result: IBenchmarkResult | null = null;
  manager: ServiceManager;
}

interface IHistoryProps {
  manager: ServiceManager;
  onSelect: (file: Contents.IModel) => void;
  resultAdded: ISignal<any, IBenchmarkResult>;
}

interface IHistoryState {
  files: Contents.IModel[];
  current: string | null;
}

export class BenchmarkHistory extends React.Component<
  IHistoryProps,
  IHistoryState
> {
  constructor(props: IHistoryProps) {
    super(props);
    this.state = {
      files: [],
      current: null
    };
    this.update();
    this.update = this.update.bind(this);
    this.props.resultAdded.connect(async (_, result: IBenchmarkResult) => {
      await this.update();
      this.setState({
        current: benchmarkFilename(result)
      });
    });
  }

  async update(): Promise<void> {
    const dirModel = await this.props.manager.contents.get('.');
    const files = dirModel.content.filter((a: Contents.IModel) =>
      a.path.endsWith('.profile.json')
    );
    files.sort(
      (a: Contents.IModel, b: Contents.IModel) =>
        new Date(b.created).getTime() - new Date(a.created).getTime()
    );
    this.setState({
      files: files
    });
  }

  componentDidMount(): void {
    this._handle = window.setInterval(this.update, 2000);
  }

  componentWillUnmount(): void {
    if (this._handle !== null) {
      window.clearInterval(this._handle);
    }
  }

  render(): JSX.Element {
    const list = this.state.files.map(file => (
      <li
        className={
          this.state.current === file.path
            ? 'up-BenchmarkHistory-file up-BenchmarkHistory-file-active'
            : 'up-BenchmarkHistory-file'
        }
        onClick={() => {
          this.props.onSelect(file);
          this.setState({
            current: file.path
          });
        }}
      >
        {file.name.replace('.profile.json', '')}
      </li>
    ));
    return (
      <div className="up-BenchmarkHistory">
        <h3 className="up-widget-heading">History</h3>
        <ul className="up-BenchmarkHistory-files">{list}</ul>
      </div>
    );
  }

  private _handle: number | null = null;
}

interface IResultProps<T extends IOutcome> {
  result: IBenchmarkResultBase<T> | null;
  benchmarks: IBenchmark<T>[];
  scenarios: IScenario[];
}

function timingSummary(timing: ITimingOutcome): JSX.Element {
  return (
    <>
      <div>
        Reference: IQM:{' '}
        {Statistic.round(Statistic.interQuartileMean(timing.reference), 1)} ms,
        mean: {Statistic.round(Statistic.mean(timing.reference), 1)} ms, min:{' '}
        {Statistic.round(Statistic.min(timing.reference), 1)} ms
      </div>
      <div>Total time: {formatTime(timing.totalTime)}</div>
    </>
  );
}

function profilingSummary(profile: IProfilingOutcome): JSX.Element {
  const first = profile.results[0];
  return (
    <>
      <div>
        Traces: {first.traces.length}. Average number of samples:{' '}
        {Statistic.round(
          Statistic.mean(first.traces.map(trace => trace.samples.length)),
          1
        )}
        , frames:{' '}
        {Statistic.round(
          Statistic.mean(first.traces.map(trace => trace.frames.length)),
          1
        )}
        , sampling interval: {Statistic.round(first.samplingInterval, 1)}
      </div>
      <div>Total time: {formatTime(profile.totalTime)}</div>
    </>
  );
}

export class BenchmarkResult<T extends IOutcome> extends React.Component<
  IResultProps<T>
> {
  render(): JSX.Element {
    const { result, benchmarks, scenarios } = this.props;
    const wrap = (el: JSX.Element) => (
      <div className="up-BenchmarkResult">{el}</div>
    );
    if (!result) {
      return wrap(
        <div>Choose a result from the panel, or run a new benchmark.</div>
      );
    }
    const scenario = scenarios.find(
      candidate => candidate.id === result.scenario
    );
    const benchmark = benchmarks.find(
      candidate => candidate.id === result.benchmark
    ) as IBenchmark<T> | undefined;
    if (!scenario) {
      return wrap(<div>Unknown scenario: {result.scenario}</div>);
    }
    if (!benchmark) {
      return wrap(<div>Unknown benchmark: {result.benchmark}</div>);
    }
    if (!benchmark.render && this._previousResult !== result.id) {
      if (result.result.type === 'time') {
        this._table = new TimingTable({
          measurements: (result.result as ITimingOutcome).results,
          reference: (result.result as ITimingOutcome).reference,
          sortColumn: benchmark.sortColumn,
          stateSource: null,
          lowerIsBetter: false
        });
      } else {
        // should there be a default ProfileTable?
        this._table = null;
      }
    }
    const tagsSummary = [...Object.entries(result.result.tags)]
      .map(([tag, count]) => `${tag}:  ${count}`)
      .join('\n');
    const totalTags = Statistic.sum([...Object.values(result.result.tags)]);
    return wrap(
      <>
        <div className="up-BenchmarkResult-summary">
          <div className="up-BenchmarkResult-benchmarkInfo">
            <div>
              {benchmark.name} {scenario.name}
            </div>
            {result.result.type === 'time'
              ? timingSummary(result.result as ITimingOutcome)
              : profilingSummary(result.result as IProfilingOutcome)}
          </div>
          <div className="up-BenchmarkResult-environmentInfo">
            <div>
              Application: {result.jupyter.client} {result.jupyter.version}{' '}
              {result.jupyter.devMode ? 'dev mode' : null} {result.jupyter.mode}
            </div>
            <div>
              <span title={result.userAgent}>
                Browser: {extractBrowserVersion(result.userAgent)}
              </span>
              , <span title={tagsSummary}>DOM Elements: {totalTags}</span>
            </div>
            <div>CPU cores: {result.hardwareConcurrency}</div>
          </div>
        </div>
        <div className="up-BenchmarkResult-details">
          {benchmark.render ? (
            <benchmark.render outcome={result.result as any} />
          ) : this._table ? (
            <LuminoWidget widget={this._table} />
          ) : null}
        </div>
      </>
    );
  }
  private _table: ResultTable | null = null;
  private _previousResult: string | null = null;
}

export class BenchmarkMonitor extends React.Component<
  IMonitorProps,
  IProfilerState
> {
  render(): JSX.Element {
    return (
      <div className="up-BenchmarkMonitor">
        <UseSignal
          signal={this.props.progress}
          initialArgs={{ percentage: -1 }}
        >
          {(sender, args) => {
            if (!args) {
              args = {
                percentage: -1
              };
            }
            if (args.percentage === 0) {
              this.start = new Date();
            }
            let elapsed = NaN;
            let remaining = NaN;
            let status: string;
            if (this.start) {
              const now =
                args.percentage === 100 && this.end ? this.end : new Date();
              this.end = now;
              elapsed = now.getTime() - this.start.getTime();
              remaining = ((100 - args.percentage) * elapsed) / args.percentage;
              status = args.percentage === 100 ? 'up-mod-completed' : '';
            } else {
              status = 'up-mod-waiting';
            }
            return (
              <div className={status + ' up-BenchmarkMonitor-content'}>
                <div>
                  Elapsed: {formatTime(elapsed)}. Remaining:{' '}
                  {formatTime(remaining)}
                </div>
                <ProgressBar percentage={args.percentage} />
              </div>
            );
          }}
        </UseSignal>
      </div>
    );
  }
  start: Date | null = null;
  end: Date | null = null;
}

interface IBenchmarkData {
  options: JSONObject;
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
}

interface IBenchmarkResultBase<T extends IOutcome> extends IBenchmarkData {
  result: T;
}

type IBenchmarkResult<T extends IOutcome = ITimingOutcome | IProfilingOutcome> =
  IBenchmarkResultBase<T>;

function benchmarkId(result: Omit<IBenchmarkData, 'id'>): string {
  return [
    result.benchmark,
    result.scenario,
    result.completed.toISOString()
  ].join('_');
}
function benchmarkFilename(result: IBenchmarkData): string {
  return result.id + '.profile.json';
}

export class BenchmarkLauncher extends React.Component<
  ILauncherProps,
  IProfilerState
> {
  constructor(props: ILauncherProps) {
    super(props);
    this.state = {
      benchmarks: new Set([props.benchmarks[0]]),
      scenarios: new Set([props.scenarios[0]]),
      fieldTemplate: CustomTemplateFactory(this.props.translator),
      arrayFieldTemplate: CustomArrayTemplateFactory(this.props.translator),
      objectFieldTemplate: CustomObjectTemplateFactory(this.props.translator)
    };
  }
  state: IProfilerState;

  async runBenchmark<T extends IOutcome = ITimingOutcome | IProfilingOutcome>(
    scenario: IScenario,
    benchmark: IBenchmark<ITimingOutcome> | IBenchmark<IProfilingOutcome>
  ): Promise<IBenchmarkResultBase<T>> {
    // TODO: can we add a simple "lights out" overlay to reduce user interference while the benchmark is running (but do keep showing them progress) without interfering with measurements?

    const options = JSONExt.deepCopy({
      scenario: this._config.scenarios[scenario.id],
      benchmark: this._config.benchmarks[benchmark.id]
    } as any);
    scenario.setOptions(options.scenario);
    this.props.progress.emit({ percentage: 0 });
    const result = (await benchmark.run(
      scenario,
      options.benchmark,
      this.props.progress
    )) as T;
    this.props.progress.emit({ percentage: 100 });
    const data: Omit<IBenchmarkResultBase<T>, 'id'> = {
      result: result,
      options: options,
      benchmark: benchmark.id,
      scenario: scenario.id,
      userAgent: window.navigator.userAgent,
      hardwareConcurrency: window.navigator.hardwareConcurrency,
      completed: new Date(),
      windowSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      jupyter: this.props.getJupyterState()
    };
    return {
      ...data,
      id: benchmarkId(data)
    };
    // TODO: open templated notebook for analysis of results
  }

  onBenchmarkChanged(event: React.ChangeEvent<HTMLInputElement>): void {
    const matched = this.props.benchmarks.find(
      benchmark => benchmark.id === event.target.value
    );
    if (!matched) {
      throw Error(`Benchmark not matched ${event.target.value}`);
    }
    const activeBenchmarks = this.state.benchmarks;
    if (event.target.checked) {
      activeBenchmarks.add(matched);
    } else {
      activeBenchmarks.delete(matched);
    }
    this.setState({
      benchmarks: activeBenchmarks
    });
  }

  onScenarioChanged(event: React.ChangeEvent<HTMLInputElement>): void {
    const matched = this.props.scenarios.find(
      scenario => scenario.id === event.target.value
    );
    if (!matched) {
      throw Error(`Scenario not matched ${event.target.value}`);
    }
    const activeScenarios = this.state.scenarios;
    if (event.target.checked) {
      activeScenarios.add(matched);
    } else {
      activeScenarios.delete(matched);
    }
    this.setState({
      scenarios: activeScenarios
    });
  }

  render(): JSX.Element {
    const benchmarks = this.props.benchmarks.map(benchmark => {
      const disabled = benchmark.isAvailable ? !benchmark.isAvailable() : false;
      return (
        <label
          key={benchmark.id}
          className={disabled ? 'up-label-disabled' : ''}
          title={
            disabled ? 'This benchmark is not available on this browser' : ''
          }
        >
          <input
            type="checkbox"
            checked={this.state.benchmarks.has(benchmark)}
            className="up-BenchmarkLauncher-choice-input"
            disabled={disabled}
            value={benchmark.id}
          />
          {benchmark.name}
        </label>
      );
    });
    const scenarios = this.props.scenarios.map(scenario => {
      return (
        <label key={scenario.id}>
          <input
            type="checkbox"
            checked={this.state.scenarios.has(scenario)}
            className="up-BenchmarkLauncher-choice-input"
            value={scenario.id}
          />
          {scenario.name}
        </label>
      );
    });
    // TODO: stop button
    // TODO: custom widget for path selection, FileDialog.getOpenFiles
    return (
      <div className="up-BenchmarkLauncher" style={{ height: '450px' }}>
        <h3 className="up-widget-heading">Launch</h3>
        <div className="up-BenchmarkLauncher-cards">
          <div className="up-BenchmarkLauncher-card">
            <h4 className="up-card-heading">Benchmark</h4>
            <div
              className="up-BenchmarkLauncher-choices"
              onChange={this.onBenchmarkChanged.bind(this)}
            >
              {benchmarks}
            </div>
            <div className="up-BenchmarkLauncher-forms">
              {[...this.state.benchmarks].map(benchmark => {
                return (
                  <Form
                    key={'up-profiler-benchmark-' + benchmark.id}
                    schema={benchmark.configSchema}
                    idPrefix={'up-profiler-benchmark'}
                    onChange={form => {
                      this._config.benchmarks[benchmark.id] =
                        form.formData as JSONObject;
                    }}
                    FieldTemplate={this.state.fieldTemplate}
                    ArrayFieldTemplate={this.state.arrayFieldTemplate}
                    ObjectFieldTemplate={this.state.objectFieldTemplate}
                    liveValidate
                  />
                );
              })}
            </div>
          </div>
          <div className="up-BenchmarkLauncher-card">
            <h4 className="up-card-heading">Scenario</h4>
            <div
              className="up-BenchmarkLauncher-choices"
              onChange={this.onScenarioChanged.bind(this)}
            >
              {scenarios}
            </div>
            <div className="up-BenchmarkLauncher-forms">
              {[...this.state.scenarios].map(scenario => {
                return (
                  <Form
                    key={'up-profiler-scenario-' + scenario.id}
                    // TODO: hide title or update title. Show placeholder if empty
                    schema={scenario.configSchema}
                    idPrefix={'up-profiler-scenario-' + scenario.id}
                    onChange={form => {
                      this._config.scenarios[scenario.id] =
                        form.formData as JSONObject;
                    }}
                    FieldTemplate={this.state.fieldTemplate}
                    ArrayFieldTemplate={this.state.arrayFieldTemplate}
                    ObjectFieldTemplate={this.state.objectFieldTemplate}
                    liveValidate
                  />
                );
              })}
            </div>
          </div>
          <div className="up-BenchmarkLauncher-card">
            <h4 className="up-card-heading">Run</h4>
            <button
              onClick={async () => {
                for (const benchmark of this.state.benchmarks) {
                  for (const scenario of this.state.scenarios) {
                    const result = await this.runBenchmark(scenario, benchmark);
                    const filename = benchmarkFilename(result);
                    this.props.upload(
                      new File(JSON.stringify(result).split('\n'), filename, {
                        type: 'application/json'
                      })
                    );
                    this.props.onResult(result);
                  }
                }
              }}
              className={'jp-mod-styled jp-mod-accept'}
              disabled={this.state.scenarios.size === 0}
            >
              Start
            </button>
          </div>
        </div>
        <BenchmarkMonitor {...this.props} />
      </div>
    );
  }

  protected _config: IConfigValue = {
    scenarios: {},
    benchmarks: {}
  };
}
