import { JSONSchema7 } from 'json-schema';
import type { Signal } from '@lumino/signaling';

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

export interface IBenchmark<T = IResult> {
  id: string;
  name: string;
  run: (
    scenario: IScenario,
    options: any,
    progress?: Signal<any, IProgress>
  ) => Promise<IOutcome<T>>;
  configSchema: JSONSchema7;
  render?: (props: { outcome: IOutcome<T> }) => JSX.Element;
}

export interface IResult {
  times: number[];
  [index: string]: any;
}

export interface IOutcome<T = IResult> {
  results: T[];
  reference: number[];
  tags: Record<string, number>;
  totalTime: number;
}

export async function benchmark(
  scenario: IScenario,
  n = 3,
  inSuite = false
): Promise<number[]> {
  if (!inSuite && scenario.setupSuite) {
    await scenario.setupSuite();
  }
  const times = [];
  for (let i = 0; i < n; i++) {
    if (scenario.setup) {
      await scenario.setup();
    }
    const start = Date.now();
    try {
      await scenario.run();
    } catch (e) {
      // TODO: surface the error in the UI
      // one solution would be to return (number | Error)[]s
      console.error('Benchmark failed in scenario', scenario, e);
    }
    times.push(Date.now() - start);
    if (scenario.cleanup) {
      await scenario.cleanup();
    }
  }
  if (!inSuite && scenario.cleanupSuite) {
    await scenario.cleanupSuite();
  }
  return times;
}
