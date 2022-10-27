import type { DockPanel } from '@lumino/widgets';

export function shuffled<T = any>(array: T[]): T[] {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

export function reportTagCounts(): Record<string, number> {
  return {
    total: document.querySelectorAll('*').length,
    div: document.querySelectorAll('div').length,
    span: document.querySelectorAll('span').length,
    svg: document.querySelectorAll('svg').length,
    li: document.querySelectorAll('li').length
  };
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
