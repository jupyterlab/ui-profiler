export {};

declare global {
  interface Window {
    Profiler: Profiler | undefined;
  }
  interface Profiler extends EventTarget {
    readonly stopped: boolean;
    readonly sampleInterval: DOMHighResTimeStamp;

    new (options: ProfilerInitOptions): Profiler;
    stop(): Promise<ProfilerTrace>;
  }
  interface ProfilerTrace {
    resources: ProfilerResource[];
    frames: ProfilerFrame[];
    stacks: ProfilerStack[];
    samples: ProfilerSample[];
  }
  interface ProfilerInitOptions {
    sampleInterval: DOMHighResTimeStamp;
    maxBufferSize: number;
  }
  interface ProfilerFrame {
    readonly name: string;
    readonly resourceId?: number;
    readonly line?: number;
    readonly column?: number;
  }
  interface ProfilerStack {
    readonly parentId?: number;
    readonly frameId: number;
  }
  interface ProfilerSample {
    readonly timestamp: DOMHighResTimeStamp;
    readonly stackId?: number;
    /*
    The markers extension
    https://github.com/WICG/js-self-profiling/blob/main/markers.md

    Unfortunately not available as of today.
    https://chromestatus.com/feature/5676352050036736
    */
    marker?: ProfilerMarker;
  }
  type ProfilerResource = string;
  type ProfilerMarker =
    | 'script'
    | 'gc'
    | 'style'
    | 'layout'
    | 'paint'
    | 'other';
}
