import Form from '@rjsf/core';
import React from 'react';
import { ReactWidget, UseSignal, showErrorMessage } from '@jupyterlab/apputils';
import { Contents, ServiceManager } from '@jupyterlab/services';
import { ProgressBar } from '@jupyterlab/statusbar';
import { ITranslator } from '@jupyterlab/translation';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import { PathExt } from '@jupyterlab/coreutils';
import { Signal, ISignal } from '@lumino/signaling';
import { Component as JSONComponent } from '@jupyterlab/json-extension/lib/component';
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
import { extractTimes, iterateFrames } from './jsBenchmarks';
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
  resultLocation: string;
  getJupyterState: () => IJupyterState;
}

interface ILauncherProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
  onResult: (result: IBenchmarkResult) => void;
  resultLocation: string;
}

interface IMonitorProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
}

namespace ProfileTrace {
  export interface IProps {
    trace: ProfilerTrace;
    itemHeight: number;
  }
  export interface IState {
    scale: {
      x: number;
      y: number;
    };
    position: {
      x: number;
      y: number;
    };
    dimensions: {
      width: number;
      height: number;
    } | null;
    inDrag: boolean;
  }
}

export class ProfileTrace extends React.Component<
  ProfileTrace.IProps,
  ProfileTrace.IState
> {
  constructor(props: ProfileTrace.IProps) {
    super(props);
    this.state = {
      scale: { x: 1, y: 1 },
      position: { x: 0, y: 0 },
      dimensions: null,
      inDrag: false
    };
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.container = React.createRef();
    this.resizeObserver = new ResizeObserver(this.updateSizeInfo.bind(this));
  }

  resizeObserver: ResizeObserver;
  container: React.RefObject<HTMLDivElement>;
  deepest = 0;
  contentWidth = 100;
  contentHeight = 100;
  initialWidth = 100;

  componentDidMount(): void {
    const trace = this.props.trace;
    const first = trace.samples[0].timestamp;
    const initialWidth = Math.max(
      ...trace.samples.map(sample => sample.timestamp - first)
    );
    const dimensions = {
      width: this.container.current!.offsetWidth,
      height: this.container.current!.offsetHeight
    };
    this.setState({
      scale: { x: dimensions!.width / initialWidth, y: 1 },
      dimensions
    });
    this.resizeObserver.observe(this.container.current!);
  }
  componentWillUnmount(): void {
    this.resizeObserver.disconnect();
  }
  updateSizeInfo(): void {
    this.setState({
      dimensions: {
        width: this.container.current!.offsetWidth,
        height: this.container.current!.offsetHeight
      }
    });
  }

  handleWheel(e: React.WheelEvent): void {
    const scale = this.state.scale;
    const newScale = scale.x - e.deltaY / 100;
    if (newScale > 0) {
      this.setState({
        scale: {
          x: newScale,
          y: scale.y
        }
      });
    }
  }

  handleMouseMove(e: MouseEvent): void {
    if (this.state.inDrag) {
      const position = this.state.position;
      const cushion = 50;
      this.setState({
        position: {
          x: Math.max(
            Math.min(
              position.x + e.movementX,
              this.state.dimensions!.width - cushion
            ),
            -this.contentWidth + cushion
          ),
          y: 0
        }
      });
    }
  }

  handleMouseUp(): void {
    this.setState({ inDrag: false });
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  handleMouseDown(): void {
    this.setState({ inDrag: true });
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  renderContent(): JSX.Element {
    const { trace, itemHeight } = this.props;
    if (!trace.samples) {
      return <div>No samples in trace</div>;
    }
    const first = trace.samples[0].timestamp;

    const frameLocations = [...iterateFrames(trace)];
    this.deepest = Math.max(...frameLocations.map(frame => frame.stackDepth));

    const scale = this.state.scale;

    const samples = trace.samples.map((sample, i) => {
      const nextSample = trace.samples[i + 1];
      const style = {
        width: (nextSample?.timestamp - sample.timestamp) * scale.x,
        left: (sample.timestamp - first) * scale.x
      };
      return (
        <div
          className="up-ProfileTrace-sample"
          key={'sample-' + i}
          style={style}
        ></div>
      );
    });

    let contentWidth = 0;
    const frames = frameLocations.map((location, i) => {
      const frame = trace.frames[location.frameId];
      const left = (location.start - first) * scale.x;
      const width = location.duration * scale.x;
      contentWidth = Math.max(contentWidth, left + width);
      const style = {
        width: width,
        top: (location.stackDepth - 1) * itemHeight * scale.y,
        left: left,
        height: itemHeight
      };
      return (
        <div
          className={
            'up-ProfileTrace-frame ' +
            (typeof frame.resourceId === 'undefined'
              ? 'up-ProfileTrace-frame-native'
              : '')
          }
          key={'frame-' + i}
          style={style}
          title={[
            frame.name,
            Statistic.round(location.duration, 1) + 'ms'
          ].join('\n')}
        >
          {frame.name}
        </div>
      );
    });

    this.contentWidth = contentWidth;
    this.contentHeight = (2 + this.deepest) * this.props.itemHeight * scale.y;

    // TODO: also show samples as dotted horizontal line with absolute positioning for reference
    return (
      <div
        className="up-ProfileTrace-content"
        style={{
          transform: `translate(${this.state.position.x}px, ${this.state.position.y}px)`,
          width: contentWidth + 'px',
          height: this.contentHeight + 'px'
        }}
      >
        {frames}
        {samples}
      </div>
    );
  }

  render(): JSX.Element {
    return (
      <div
        className="up-ProfileTrace"
        onWheel={this.handleWheel}
        onMouseDown={this.handleMouseDown}
        ref={this.container}
      >
        {this.state.dimensions ? this.renderContent() : 'Loading'}
      </div>
    );
  }
}

interface IProfilerState {
  benchmarks: Array<IBenchmark<ITimingOutcome> | IBenchmark<IProfilingOutcome>>;
  scenarios: Array<IScenario>;
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
  /**
   * Is any benchmark currently running?
   */
  isRunning: boolean;
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
  const [selectedTrace, setTraceSelection] = React.useState(0);
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
            functionTimings[timingId].totalTime += timing.time;
            functionTimings[timingId].calls += 1;
          } else {
            const entry = {
              name: timing.name,
              times: [timing.time],
              resource: timing.resource,
              column: timing.column,
              line: timing.line,
              calls: 1,
              totalTime: timing.time
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
        sortColumn: 'totalTime',
        lowerIsBetter: true
      });
    } else {
      functionWidget.current = null;
    }
  }
  if (selectedTrace > props.outcome.results[0].traces.length) {
    // reset trace
    setTraceSelection(0);
    return <></>;
  }
  return (
    <>
      <select
        value={selectedTrace}
        onChange={e => {
          setTraceSelection(Number(e.target.value));
        }}
      >
        {props.outcome.results[0].traces.map((trace, i) => (
          <option value={i} key={'trace-' + i}>
            Trace {i} ({trace.samples.length} samples)
          </option>
        ))}
      </select>
      <ProfileTrace
        trace={props.outcome.results[0].traces[selectedTrace]}
        itemHeight={20}
      />
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
    this.manager.contents.save(this.props.resultLocation, {
      type: 'directory'
    });
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
  resultLocation: string;
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
    const dirModel = await this.props.manager.contents.get(
      this.props.resultLocation
    );
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
          this.state.current === file.name
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
      <div
        title={
          timing.reference.sort().map(Statistic.round).join(' ms\n') + ' ms'
        }
      >
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
        .{' '}
        <span
          title={
            'Average recorderd: ' +
            Statistic.round(first.averageSampleInterval, 1)
          }
        >
          Sampling interval: {Statistic.round(first.samplingInterval, 1)} ms
        </span>
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
        <div className="up-BenchmarkResult-options">
          <details>
            <summary>Options</summary>
            <div className="up-BenchmarkResult-options-benchmark">
              <b>Benchmark</b>
              <JSONComponent data={result.options.benchmark} />
            </div>
            <div className="up-BenchmarkResult-options-scenario">
              <b>Scenario</b>
              {typeof result.options.scenario === 'undefined' ? (
                <div>No options</div>
              ) : (
                <JSONComponent data={result.options.scenario} />
              )}
            </div>
          </details>
        </div>
        <div className="up-BenchmarkResult-details">
          {benchmark.interpretation ? (
            <details>
              <summary>Interpretation</summary>
              {benchmark.interpretation}
            </details>
          ) : null}
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

function OptionsStub(props: { name: string }): JSX.Element {
  return (
    <div className="rjsf">
      <div className="jp-root">
        <fieldset>
          <legend>{props.name} configuration</legend>
          No options available for {props.name}.
        </fieldset>
      </div>
    </div>
  );
}

export class BenchmarkLauncher extends React.Component<
  ILauncherProps,
  IProfilerState
> {
  constructor(props: ILauncherProps) {
    super(props);
    this.state = {
      benchmarks: [props.benchmarks[0]],
      scenarios: [props.scenarios[0]],
      fieldTemplate: CustomTemplateFactory(this.props.translator),
      arrayFieldTemplate: CustomArrayTemplateFactory(this.props.translator),
      objectFieldTemplate: CustomObjectTemplateFactory(this.props.translator),
      isRunning: false
    };
    this.runSelected = this.runSelected.bind(this);
  }
  state: IProfilerState;

  async runBenchmark<T extends IOutcome = ITimingOutcome | IProfilingOutcome>(
    scenario: IScenario,
    benchmark: IBenchmark<ITimingOutcome> | IBenchmark<IProfilingOutcome>,
    config: IConfigValue
  ): Promise<IBenchmarkResultBase<T>> {
    const options = JSONExt.deepCopy({
      scenario: config.scenarios[scenario.id],
      benchmark: config.benchmarks[benchmark.id]
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
  }

  onBenchmarkChanged(event: React.ChangeEvent<HTMLInputElement>): void {
    const matched = this.props.benchmarks.find(
      benchmark => benchmark.id === event.target.value
    );
    if (!matched) {
      throw Error(`Benchmark not matched ${event.target.value}`);
    }
    let activeBenchmarks = [...this.state.benchmarks];
    if (event.target.checked) {
      activeBenchmarks.push(matched);
    } else {
      activeBenchmarks = activeBenchmarks.filter(b => b.id !== matched.id);
    }
    const referenceOrder = this.props.benchmarks.map(s => s.id);
    activeBenchmarks.sort(
      (a, b) => referenceOrder.indexOf(a.id) - referenceOrder.indexOf(b.id)
    );
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
    let activeScenarios = [...this.state.scenarios];
    if (event.target.checked) {
      activeScenarios.push(matched);
    } else {
      activeScenarios = activeScenarios.filter(s => s.id !== matched.id);
    }
    const referenceOrder = this.props.scenarios.map(s => s.id);
    activeScenarios.sort(
      (a, b) => referenceOrder.indexOf(a.id) - referenceOrder.indexOf(b.id)
    );
    this.setState({
      scenarios: activeScenarios
    });
  }

  async runSelected(): Promise<void> {
    this.setState({
      isRunning: true
    });
    try {
      // copy to prevent user inadvertedly changing what is being run
      const scheduledBenchmarks = [...this.state.benchmarks];
      const scheduledScenarios = [...this.state.scenarios];
      const config = JSONExt.deepCopy(this._config as any) as IConfigValue;
      for (const benchmark of scheduledBenchmarks) {
        for (const scenario of scheduledScenarios) {
          const result = await this.runBenchmark(scenario, benchmark, config);
          const filename = benchmarkFilename(result);
          this.props.upload(
            new File(
              JSON.stringify(result).split('\n'),
              PathExt.join(this.props.resultLocation, filename),
              {
                type: 'application/json'
              }
            )
          );
          this.props.onResult(result);
        }
      }
    } catch (e) {
      void showErrorMessage('Benchmark failed', e);
    }
    this.setState({
      isRunning: false
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
            checked={this.state.benchmarks.includes(benchmark)}
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
            checked={this.state.scenarios.includes(scenario)}
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
              {this.state.benchmarks.map(benchmark => {
                const properties = benchmark.configSchema.properties;
                if (!properties || Object.keys(properties).length === 0) {
                  return <OptionsStub name={benchmark.name} />;
                }
                benchmark.configSchema.title =
                  benchmark.name + ' configuration';
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
              {this.state.scenarios.map(scenario => {
                const properties = scenario.configSchema.properties;
                if (!properties || Object.keys(properties).length === 0) {
                  return <OptionsStub name={scenario.name} />;
                }
                scenario.configSchema.title = scenario.name + ' configuration';
                return (
                  <Form
                    key={'up-profiler-scenario-' + scenario.id}
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
        </div>
        <div className="up-BenchmarkLauncher-launchbar">
          <BenchmarkMonitor {...this.props} />
          <div className="up-BenchmarkLauncher-launchbar-buttons">
            <button
              onClick={this.runSelected}
              className="jp-mod-styled jp-mod-accept"
              disabled={
                this.state.scenarios.length === 0 ||
                this.state.benchmarks.length === 0 ||
                this.state.isRunning
              }
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  protected _config: IConfigValue = {
    scenarios: {},
    benchmarks: {}
  };
}
