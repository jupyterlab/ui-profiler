import type { DockPanel } from '@lumino/widgets';

export function shuffled<T = any>(array: T[]): T[] {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

export function reportTagCounts(): Record<string, number> {
  const allElements = document.querySelectorAll('*');
  const counts: Record<string, number> = {};
  for (const elements of allElements.values()) {
    const tagName = elements.tagName.toLocaleLowerCase();
    if (!Object.prototype.hasOwnProperty.call(counts, tagName)) {
      counts[tagName] = 1;
    } else {
      counts[tagName] += 1;
    }
  }
  return counts;
}

export function formatTime(miliseconds: number): string {
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

export interface IJupyterState {
  version: string;
  client: string;
  devMode: boolean;
  mode: DockPanel.Mode;
}

/**
 * Simplistic extraction of major browsers data, based on
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/User-Agent
 */
export function extractBrowserVersion(userAgent: string): string {
  // order matters!
  const expressions = [
    /Firefox\/\d+/,
    /OPR\/\d+/,
    /Edg\/\d+/,
    /Mobile\/.* Safari\/\d+/,
    /Chrome\/\d+/
  ];
  for (const expr of expressions) {
    const match = userAgent.match(expr);
    if (match) {
      return match[0];
    }
  }
  return 'Unknown browser';
}

export function* iterateSubtree(node: Node): Generator<Node> {
  for (const child of node.childNodes) {
    yield child;
    yield* iterateSubtree(child);
  }
}

export function* iterateAffectedNodes(
  mutations: MutationRecord[]
): Generator<Node> {
  for (const mutation of mutations) {
    yield mutation.target;
    for (const node of mutation.addedNodes) {
      if (node === document.body) {
        continue;
      }
      yield node;
      for (const child of iterateSubtree(node)) {
        yield child;
      }
    }
    for (const node of mutation.removedNodes) {
      if (node === document.body) {
        continue;
      }
      yield node;
      for (const child of iterateSubtree(node)) {
        yield child;
      }
    }
  }
}
