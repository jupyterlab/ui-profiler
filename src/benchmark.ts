import { JSONSchema7 } from 'json-schema';

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

export interface IBenchmark {
  id: string;
  name: string;
  run: (scenario: IScenario, options: any) => Promise<IOutcome>;
  configSchema: JSONSchema7;
}

export interface IResult {
  times: number[];
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
    await scenario.run();
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
