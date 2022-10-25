import Form from '@rjsf/core';
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { IBenchmark, IScenario } from './benchmark';

interface IProfilerProps {
  benchmarks: IBenchmark[];
  scenarios: IScenario[];
}

interface IProfilerState {
  benchmark: IBenchmark;
  scenario: IScenario;
}

interface IValue {
  // TODO
  scenario: any;
  benchmark: any;
}

export class UIProfiler extends ReactWidget {
  constructor(private props: IProfilerProps) {
    super();
  }
  render() {
    // TODO add BenchmarkMonitor displaying progress, performance metrics etc
    // TODO add BenchmarkHistory showing a list of most recent results
    return <BenchmarkLauncher {...this.props} />;
  }
}

export class BenchmarkLauncher extends React.Component<
  IProfilerProps,
  IProfilerState
> {
  constructor(props: IProfilerProps) {
    super(props);
    this.state = {
      benchmark: props.benchmarks[0],
      scenario: props.scenarios[0]
    };
  }
  state: IProfilerState;

  runBenchmark() {
    // TODO: can we add a simple "lights out" overlay to reduce user interference while the benchmark is running (but do keep showing them progress) without interfering with measurements?
    const scenario = this.state.scenario;
    scenario.setOptions(this._value.scenario);
    return this.state.benchmark.run(scenario, this._value.benchmark);
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
    return (
      <div>
        <div>
          <h3>Select Benchmark</h3>
          <div onChange={this.onBenchmarkChanged.bind(this)}>{benchmarks}</div>
          <Form
            schema={this.state.benchmark.configSchema}
            idPrefix={`ui-profiler-benchmark`}
            onChange={form => {
              this._value.benchmark = form.formData;
            }}
            liveValidate
          />
        </div>
        <div>
          <h3>Select Scenario</h3>
          <div onChange={this.onScenarioChanged.bind(this)}>{scenarios}</div>
          <Form
            schema={this.state.scenario.configSchema}
            idPrefix={`ui-profiler-scenario`}
            onChange={form => {
              this._value.scenario = form.formData;
            }}
            liveValidate
          />
        </div>
        <div>
          <h3>Run</h3>
          <button onClick={() => this.runBenchmark().then(console.log)}>
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
