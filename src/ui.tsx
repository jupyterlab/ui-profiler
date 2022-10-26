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
import { Widget } from '@lumino/widgets';
import { Signal } from '@lumino/signaling';
import { IBenchmark, IOutcome, IScenario, IProgress } from './benchmark';
import { IRuleData } from './styleBenchmarks';
import {
  CustomTemplateFactory,
  CustomArrayTemplateFactory,
  CustomObjectTemplateFactory
} from './templates';

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

interface ILuminoWidget {
  widget: Widget;
}

const LuminoWidget = (props: ILuminoWidget) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const widget = props.widget;
    //
    Widget.attach(widget, ref.current!);
    return () => {
      Widget.detach(widget);
    };
  }, [props.widget]);

  React.useLayoutEffect(() => {
    function updateSize() {
      props.widget.fit();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return <div ref={ref}></div>;
};

export class ResultTable extends DataGrid {
  constructor(outcome: IOutcome) {
    super();
    const results = outcome.results;
    for (const result of results) {
      result['min'] = Math.min(...result.times);
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
      data: results.sort((a, b) => a.min - b.min),
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

export class UIProfiler extends ReactWidget {
  constructor(private props: IProfilerProps) {
    super();
    // results DB?
    // this.results =
    this.progress = new Signal(this);
    this.handleResult = this.handleResult.bind(this);
  }
  handleResult(result: IBenchmarkResult) {
    this.result = result;
    this.update();
  }
  render() {
    // TODO add BenchmarkMonitor displaying progress, performance metrics etc
    // TODO add BenchmarkHistory showing a list of most recent results

    return (
      <div className="up-UIProfiler">
        <BenchmarkLauncher
          onResult={this.handleResult}
          progress={this.progress}
          {...this.props}
        />
        <BenchmarkMonitor progress={this.progress} {...this.props} />
        {this.result ? (
          <div>
            Results for {this.result.benchmark} {this.result.scenario}.
            Reference:{' '}
            {this.result.result.reference.map(time => time + 'ms').join(', ')}
            <LuminoWidget widget={new ResultTable(this.result.result)} />
          </div>
        ) : null}
      </div>
    );
  }

  progress: Signal<any, IProgress>;
  result: IBenchmarkResult | null = null;
  //manager: ServiceManager;
}

export class BenchmarkMonitor extends React.Component<
  IMonitorProps,
  IProfilerState
> {
  render() {
    return (
      <div className="up-BenchmarkMonitor">
        <UseSignal
          signal={this.props.progress}
          initialArgs={{ percentage: -1 }}
        >
          {(sender, args) => {
            if (args!.percentage === 0) {
              this.start = new Date();
            }
            let elapsed = NaN;
            let remaining = NaN;
            if (this.start) {
              const now = new Date();
              elapsed = now.getTime() - this.start.getTime();
              remaining =
                ((100 - args!.percentage) * elapsed) / args!.percentage;
            }
            return (
              <>
                <div>
                  Elapsed: {formatTime(elapsed)}. Remaining:{' '}
                  {formatTime(remaining)}
                </div>
                <ProgressBar percentage={args!.percentage} />
              </>
            );
          }}
        </UseSignal>
      </div>
    );
  }
  start: Date | null = null;
}

function formatTime(miliseconds: number): string {
  if (isNaN(miliseconds)) {
    return '-';
  }
  const seconds = miliseconds / 1000;
  const minutes = Math.floor(seconds / 60);
  let formatted = Math.round(seconds - minutes * 60) + ' seconds';
  if (minutes < 1) {
    return formatted;
  }
  const hours = Math.floor(minutes / 60);
  formatted = Math.round(minutes - hours * 60) + ' minutes ' + formatted;
  if (hours < 1) {
    return formatted;
  }
  formatted = Math.round(hours) + ' hours ' + formatted;
  return formatted;
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
    // TODO: save the result to file, open templated notebook for analysis/display results
  }

  onBenchmarkChanged(event: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      benchmark: this.props.benchmarks.find(
        benchmark => benchmark.id === event.target.value
      )!
    });
  }

  onScenarioChanged(event: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      scenario: this.props.scenarios.find(
        scenario => scenario.id === event.target.value
      )!
    });
  }

  render() {
    const benchmarks = this.props.benchmarks.map(benchmark => {
      return (
        <label key={benchmark.id}>
          <input
            type="radio"
            checked={this.state.benchmark === benchmark}
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
        <div>
          <h3>Benchmark</h3>
          <div onChange={this.onBenchmarkChanged.bind(this)}>{benchmarks}</div>
          <Form
            schema={this.state.benchmark.configSchema}
            idPrefix={'ui-profiler-benchmark'}
            onChange={form => {
              this._value.benchmark = form.formData as JSONObject;
            }}
            FieldTemplate={this.state.fieldTemplate}
            ArrayFieldTemplate={this.state.arrayFieldTemplate}
            ObjectFieldTemplate={this.state.objectFieldTemplate}
            liveValidate
          />
        </div>
        <div>
          <h3>Scenario</h3>
          <div onChange={this.onScenarioChanged.bind(this)}>{scenarios}</div>
          <Form
            schema={this.state.scenario.configSchema}
            idPrefix={'ui-profiler-scenario'}
            onChange={form => {
              this._value.scenario = form.formData as JSONObject;
            }}
            FieldTemplate={this.state.fieldTemplate}
            ArrayFieldTemplate={this.state.arrayFieldTemplate}
            ObjectFieldTemplate={this.state.objectFieldTemplate}
            liveValidate
          />
        </div>
        <div>
          <h3>Run</h3>
          <button
            onClick={async () => {
              const result = await this.runBenchmark();
              const filename =
                [
                  result.benchmark,
                  result.scenario,
                  result.completed.toISOString()
                ].join('_') + '.profile.json';
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
    );
  }

  protected _value: IValue = {
    scenario: {},
    benchmark: {}
  };
}
