import { JSONSchema7 } from 'json-schema';

import {
  IScenario,
  IProfilingOutcome,
  IBenchmark,
  IProfileMeasurement,
  profile
} from './benchmark';
import { reportTagCounts } from './utils';
import { layoutReady } from './dramaturg';
import { renderProfile } from './ui';

import benchmarkProfileOptionsSchema from './schema/benchmark-profile.json';
import type { ProfileBenchmarkOptions } from './types/_benchmark-profile';

interface IFunctionTiming {
  time: number;
  readonly name: string;
  readonly line?: number;
  readonly column?: number;
  readonly resource?: string;
}

interface IFrameState {
  start: number;
  stackDepth: number;
  frameId: number;
}

export interface IFrameLocation extends IFrameState {
  duration: number;
}

export function* iterateFrames(
  trace: ProfilerTrace
): Generator<IFrameLocation> {
  let runningFrames: Map<string, IFrameState> = new Map();
  for (const sample of trace.samples) {
    const now = sample.timestamp;
    // when undefined, the stack was empty -> mark all currently running functions as done
    let completedFrames: string[];
    const previouslyRunningFrames = [...runningFrames.keys()];
    const activeFrames = new Map<string, IFrameState>();
    if (typeof sample.stackId === 'undefined') {
      completedFrames = [...previouslyRunningFrames];
    } else {
      let stack: ProfilerStack | null = trace.stacks[sample.stackId];

      let staskSize = 0;
      while (stack) {
        stack =
          typeof stack.parentId !== 'undefined'
            ? trace.stacks[stack.parentId]
            : null;
        staskSize++;
      }

      let depth = 0;
      stack = trace.stacks[sample.stackId];
      while (stack) {
        const inverseDepth = staskSize - depth;
        const blockId = stack.frameId + '-' + inverseDepth;
        activeFrames.set(
          blockId,
          runningFrames.get(blockId) ?? {
            start: now,
            stackDepth: inverseDepth,
            frameId: stack.frameId
          }
        );
        stack =
          typeof stack.parentId !== 'undefined'
            ? trace.stacks[stack.parentId]
            : null;
        depth++;
      }
      completedFrames = [...previouslyRunningFrames].filter(
        a => !activeFrames.has(a)
      );
    }

    for (const frameId of completedFrames) {
      const state = runningFrames.get(frameId)!;
      const time = now - state.start;
      yield {
        duration: time,
        ...state
      };
      runningFrames.delete(frameId);
    }
    runningFrames = activeFrames;
  }
}

export function extractTimes(trace: ProfilerTrace): IFunctionTiming[] {
  const totalFrameTime: Map<number, number> = new Map();
  for (const frameData of iterateFrames(trace)) {
    totalFrameTime.set(
      frameData.frameId,
      totalFrameTime.get(frameData.frameId) || 0 + frameData.duration
    );
  }

  return [...totalFrameTime.entries()].map(([frameId, time]) => {
    const frame = trace.frames[frameId];
    return {
      resource:
        typeof frame.resourceId !== 'undefined'
          ? trace.resources[frame.resourceId]
          : undefined,
      name: frame.name,
      column: frame.column,
      line: frame.line,
      time
    };
  });
}

export const selfProfileBenchmark: IBenchmark<
  IProfilingOutcome<IProfileMeasurement>
> = {
  id: 'self-profile',
  name: 'Profile JavaScript',
  configSchema: benchmarkProfileOptionsSchema as JSONSchema7,
  run: async (
    scenario: IScenario,
    options: ProfileBenchmarkOptions,
    progress
  ): Promise<IProfilingOutcome> => {
    const n = options.repeats || 3;
    const start = Date.now();
    if (scenario.setupSuite) {
      await scenario.setupSuite();
    }
    await layoutReady();
    const result = await profile(
      scenario,
      {
        maxBufferSize: options.maxBufferSize,
        sampleInterval: options.sampleInterval
      },
      options.scale,
      i => progress?.emit({ percentage: (100 * (i + 1)) / n }),
      n,
      true
    );
    await layoutReady();
    if (scenario.cleanupSuite) {
      await scenario.cleanupSuite();
    }
    progress?.emit({ percentage: 100 });
    return {
      results: [result],
      tags: reportTagCounts(),
      totalTime: Date.now() - start,
      type: 'profile'
    };
  },
  isAvailable: () => typeof window.Profiler !== 'undefined',
  render: renderProfile
};
