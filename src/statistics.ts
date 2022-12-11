const SND_CONSTANT = 1 / (2 * Math.PI) ** 0.5;

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

  /**
   * Implements CDF-based quantile, method four in http://jse.amstat.org/v14n3/langford.html
   */
  export function percentile(numbers: number[], percentile: number): number {
    numbers = [...numbers].sort((a, b) => a - b);
    const np = numbers.length * percentile;
    // is it an integer (float precision aside?)
    if (Math.abs(np - Math.round(np)) < 0.0001) {
      return (numbers[Math.ceil(np) - 1] + numbers[Math.floor(np + 1) - 1]) / 2;
    }
    return numbers[Math.ceil(np) - 1];
  }

  export function quartile(numbers: number[], quartile: 1 | 2 | 3): number {
    return percentile(numbers, 0.25 * quartile);
  }

  /**
   * Implements corrected sample standard deviation.
   */
  export function standardDeviation(numbers: number[]): number {
    if (numbers.length === 0) {
      return NaN;
    }
    const m = mean(numbers);
    return Math.sqrt(
      (sum(numbers.map(n => Math.pow(n - m, 2))) * 1) / (numbers.length - 1)
    );
  }

  /**
   * Implements sample standard error.
   */
  export function standardError(numbers: number[]): number {
    return standardDeviation(numbers) / Math.sqrt(numbers.length);
  }

  export function interQuartileMean(numbers: number[]): number {
    numbers = [...numbers].sort((a, b) => a - b);
    const q = Math.floor(numbers.length / 4);
    if (numbers.length % 4 === 0) {
      return mean(numbers.slice(q, numbers.length - q));
    } else {
      const iqrSpan = (numbers.length / 4) * 2;
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

  export function standardNormalDensity(x: number): number {
    return SND_CONSTANT * Math.E ** (-(x ** 2) / 2);
  }

  export function kernelDensityEstimate(
    sample: number[],
    x: number,
    h = 2
  ): number {
    return (
      (1 / (sample.length * h)) *
      Statistic.sum(sample.map(xi => standardNormalDensity((x - xi) / h)))
    );
  }
}
