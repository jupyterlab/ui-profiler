export namespace Statistic {
  export function min(numbers: number[]): number {
    return Math.min(...numbers);
  }

  export function mean(numbers: number[]): number {
    return sum(numbers) / numbers.length;
  }

  export function interQuartileMean(numbers: number[]): number {
    const q = Math.floor(numbers.length / 4);
    return mean(numbers.slice(q, numbers.length - q));
  }

  export function round(n: number, precision = 0): number {
    const factor = Math.pow(10, precision);
    return Math.round(n * factor) / factor;
  }

  export function sum(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b);
  }
}
