export namespace Statistic {
  export function min(numbers: number[]): number {
    return Math.min(...numbers);
  }

  export function mean(numbers: number[]): number {
    if (numbers.length === 0) {
      return NaN;
    }
    return sum(numbers) / numbers.length;
  }

  export function interQuartileMean(numbers: number[]): number {
    numbers = numbers.sort((a, b) => a - b);
    if (numbers.length % 4 === 0) {
      const q = Math.floor(numbers.length / 4);
      return mean(numbers.slice(q, numbers.length - q));
    } else {
      const iqrSpan = (numbers.length / 4) * 2;
      const q = Math.floor(numbers.length / 4);
      const toConsider = numbers.slice(q, numbers.length - q);
      const full = toConsider.length - 2;
      const fraction = (iqrSpan - full) / 2;
      const fullContrib = toConsider.slice(1, toConsider.length - 1);
      const fractionalPart = [
        toConsider[0] * fraction,
        toConsider[toConsider.length - 1] * fraction
      ];
      return sum([...fullContrib, ...fractionalPart]) / iqrSpan;
    }
  }

  export function round(n: number, precision = 0): number {
    const factor = Math.pow(10, precision);
    return Math.round(n * factor) / factor;
  }

  export function sum(numbers: number[]): number {
    if (numbers.length === 0) {
      return 0;
    }
    return numbers.reduce((a, b) => a + b);
  }
}
