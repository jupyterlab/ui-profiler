import Form from '@rjsf/core';
import React from 'react';
import { ReactWidget, UseSignal } from '@jupyterlab/apputils';
import { Contents } from '@jupyterlab/services';
import { ProgressBar } from '@jupyterlab/statusbar';
import { ITranslator } from '@jupyterlab/translation';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import {
  DataGrid,
  JSONModel,
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel
} from '@lumino/datagrid';
import { Signal, ISignal } from '@lumino/signaling';
import { IBenchmark, IOutcome, IScenario, IProgress } from './benchmark';
import { IRuleData } from './css';
import { formatTime } from './utils';
import { IRuleBlockResult } from './styleBenchmarks';
import {
  CustomTemplateFactory,
  CustomArrayTemplateFactory,
  CustomObjectTemplateFactory
} from './templates';
import { Statistic } from './statistics';
import { LuminoWidget } from './lumino';

interface IProfilerProps {
  benchmarks: IBenchmark[];
  scenarios: IScenario[];
  /**
   * Translator object
   */
  translator: ITranslator;
  upload: (file: File) => Promise<Contents.IModel>;
}

interface ILauncherProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
  onResult: (result: IBenchmarkResult) => void;
}

interface IMonitorProps extends IProfilerProps {
  progress: Signal<any, IProgress>;
}

interface IProfilerState {
  benchmark: IBenchmark;
  scenario: IScenario;
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

interface IValue {
  scenario: JSONObject;
  benchmark: JSONObject;
}

export class ResultTable extends DataGrid {
  constructor(outcome: IOutcome) {
    super();
    const results = outcome.results;
    for (const result of results) {
      result['min'] = Math.min(...result.times);
      result['mean'] = Statistic.round(Statistic.mean(result.times), 1);
      result['IQM'] = Statistic.round(
        Statistic.interQuartileMean(result.times),
        1
      );
      if (result.source) {
        result['source'] = result['source'].replace('webpack://./', '');
      }
      if (result['rulesInBlock']) {
        result['rulesInBlock'] = (result['rulesInBlock'] as IRuleData[]).map(
          rule => {
            return rule.rule.selectorText;
          }
        );
      }
    }
    const first = results[0];
    const fieldNames = Object.keys(first);
    this.dataModel = new JSONModel({
      data: results.sort((a, b) => a.IQM - b.IQM),
      schema: {
        fields: fieldNames.map(key => {
          return {
            name: key,
            type: 'string'
          };
        })
      }
    });
    this.keyHandler = new BasicKeyHandler();
    this.mouseHandler = new BasicMouseHandler();
    this.selectionModel = new BasicSelectionModel({
      dataModel: this.dataModel
    });
    this.node.style.height = '500px';
    this.fitColumnNames('all');
    const columnWidths = {
      source: 425,
      content: 100,
      selector: 175,
      rulesInBlock: 500
    };
    for (const [name, size] of Object.entries(columnWidths)) {
      const index = fieldNames.indexOf(name);
      if (index !== -1) {
        this.resizeColumn('body', index, size);
      }
    }
  }
}

export function renderBlockResult(props: {
  outcome: IOutcome<IRuleBlockResult>;
}) {
  const result = props.outcome.results;
  result.map(result => {
    result.rulesInBlock;
  });
  return <div>test</div>;
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
  handleResult(result: IBenchmarkResult) {
    this.result = result;
    this.update();
    this.resultAdded.emit(result);
  }

  async loadResult(file: Contents.IModel) {
    file = await this.manager.contents.get(file.path);
    this.handleResult(JSON.parse(file.content));
  }

  render() {
    return (
      <div className="up-UIProfiler">
        <BenchmarkLauncher
          onResult={this.handleResult}
          progress={this.progress}
          {...this.props}
        />
        <BenchmarkMonitor progress={this.progress} {...this.props} />
        <BenchmarkHistory
          resultAdded={this.resultAdded}
          manager={this.manager}
          onSelect={this.loadResult}
          {...this.props}
        />
        <BenchmarkResult result={this.result} {...this.props} />
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

import { ServiceManager } from '@jupyterlab/services';

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

  componentDidMount() {
    this._handle = window.setInterval(this.update, 2000);
  }

  componentWillUnmount() {
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

interface IResultProps {
  result: IBenchmarkResult | null;
  benchmarks: IBenchmark[];
  scenarios: IScenario[];
}

export class BenchmarkResult extends React.Component<IResultProps> {
  render() {
    const { result, benchmarks, scenarios } = this.props;
    const wrap = (el: JSX.Element) => (
      <div className="up-BenchmarkResult">{el}</div>
    );
    if (!result) {
      return wrap(
        <div>
          No result yet (choose one from the panel, or run a new benchmark)
        </div>
      );
    }
    const scenario = scenarios.find(
      candidate => candidate.id === result.scenario
    );
    const benchmark = benchmarks.find(
      candidate => candidate.id === result.benchmark
    );
    if (!scenario) {
      return wrap(<div>Unknown scenario: {result.scenario}</div>);
    }
    if (!benchmark) {
      return wrap(<div>Unknown benchmark: {result.benchmark}</div>);
    }
    return wrap(
      <div>
        Results for {benchmark.name} {scenario.name}. Reference: IQM:{' '}
        {Statistic.round(
          Statistic.interQuartileMean(result.result.reference),
          1
        )}{' '}
        ms, mean: {Statistic.round(Statistic.mean(result.result.reference), 1)}{' '}
        ms, min: {Statistic.min(result.result.reference)} ms
        {benchmark.render ? <benchmark.render outcome={result.result} /> : null}
        <LuminoWidget widget={new ResultTable(result.result)} />
      </div>
    );
  }
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
              const now = new Date();
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
}

interface IBenchmarkResult {
  result: IOutcome;
  options: JSONObject;
  benchmark: string;
  scenario: string;
  browser: string;
  hardwareConcurrency: number;
  completed: Date;
  windowSize: {
    width: number;
    height: number;
  };
}

function benchmarkFilename(result: IBenchmarkResult): string {
  return (
    [result.benchmark, result.scenario, result.completed.toISOString()].join(
      '_'
    ) + '.profile.json'
  );
}

export class BenchmarkLauncher extends React.Component<
  ILauncherProps,
  IProfilerState
> {
  constructor(props: ILauncherProps) {
    super(props);
    this.state = {
      benchmark: props.benchmarks[0],
      scenario: props.scenarios[0],
      fieldTemplate: CustomTemplateFactory(this.props.translator),
      arrayFieldTemplate: CustomArrayTemplateFactory(this.props.translator),
      objectFieldTemplate: CustomObjectTemplateFactory(this.props.translator)
    };
  }
  state: IProfilerState;

  async runBenchmark(): Promise<IBenchmarkResult> {
    // TODO: can we add a simple "lights out" overlay to reduce user interference while the benchmark is running (but do keep showing them progress) without interfering with measurements?

    const options = JSONExt.deepCopy(this._value as any);
    const scenario = this.state.scenario;
    scenario.setOptions(options.scenario);
    const benchmark = this.state.benchmark;
    this.props.progress.emit({ percentage: 0 });
    const result = await benchmark.run(
      scenario,
      options.benchmark,
      this.props.progress
    );
    this.props.progress.emit({ percentage: 100 });
    return {
      result: result,
      options: options,
      benchmark: benchmark.id,
      scenario: scenario.id,
      browser: window.navigator.userAgent,
      hardwareConcurrency: window.navigator.hardwareConcurrency,
      completed: new Date(),
      windowSize: {
        width: window.innerWidth,
        height: window.innerHeight
      }
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
    this.setState({
      benchmark: matched
    });
  }

  onScenarioChanged(event: React.ChangeEvent<HTMLInputElement>): void {
    const matched = this.props.scenarios.find(
      scenario => scenario.id === event.target.value
    );
    if (!matched) {
      throw Error(`Scenario not matched ${event.target.value}`);
    }
    this.setState({
      scenario: matched
    });
  }

  render(): JSX.Element {
    const benchmarks = this.props.benchmarks.map(benchmark => {
      return (
        <label key={benchmark.id}>
          <input
            type="radio"
            checked={this.state.benchmark === benchmark}
            className="up-BenchmarkLauncher-choice-input"
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
            type="radio"
            checked={this.state.scenario === scenario}
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
      <div className="up-BenchmarkLauncher">
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
            <Form
              schema={this.state.benchmark.configSchema}
              idPrefix={'up-profiler-benchmark'}
              onChange={form => {
                this._value.benchmark = form.formData as JSONObject;
              }}
              FieldTemplate={this.state.fieldTemplate}
              ArrayFieldTemplate={this.state.arrayFieldTemplate}
              ObjectFieldTemplate={this.state.objectFieldTemplate}
              liveValidate
            />
          </div>
          <div className="up-BenchmarkLauncher-card">
            <h4 className="up-card-heading">Scenario</h4>
            <div
              className="up-BenchmarkLauncher-choices"
              onChange={this.onScenarioChanged.bind(this)}
            >
              {scenarios}
            </div>
            <Form
              schema={this.state.scenario.configSchema}
              idPrefix={'up-profiler-scenario'}
              onChange={form => {
                this._value.scenario = form.formData as JSONObject;
              }}
              FieldTemplate={this.state.fieldTemplate}
              ArrayFieldTemplate={this.state.arrayFieldTemplate}
              ObjectFieldTemplate={this.state.objectFieldTemplate}
              liveValidate
            />
          </div>
          <div className="up-BenchmarkLauncher-card">
            <h4 className="up-card-heading">Run</h4>
            <button
              onClick={async () => {
                const result = await this.runBenchmark();
                const filename = benchmarkFilename(result);
                this.props.upload(
                  new File(JSON.stringify(result).split('\n'), filename, {
                    type: 'application/json'
                  })
                );
                this.props.onResult(result);
              }}
              className={'jp-mod-styled jp-mod-accept'}
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  protected _value: IValue = {
    scenario: {},
    benchmark: {}
  };
}
