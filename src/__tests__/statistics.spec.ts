import { Statistic } from '../statistics';

describe('Statistic.min()', () => {
  it('should forward arguments to Math.min()', () => {
    expect(Statistic.min([1, 2, 3])).toEqual(1);
  });
});

describe('Statistic.mean()', () => {
  it('should handle case of no numbers with NaN', () => {
    expect(Statistic.mean([])).toEqual(NaN);
  });

  it('should calculate mean', () => {
    expect(Statistic.mean([1, 2, 3])).toEqual(2);
    expect(Statistic.mean([1])).toEqual(1);
    expect(Statistic.mean([0, -10])).toEqual(-5);
  });
});

describe('Statistic.sum()', () => {
  it('should handle case of no numbers by returning 0', () => {
    expect(Statistic.sum([])).toEqual(0);
  });

  it('should calculate sum', () => {
    expect(Statistic.sum([1, 2, 3])).toEqual(6);
    expect(Statistic.sum([1])).toEqual(1);
    expect(Statistic.sum([0, -10])).toEqual(-10);
  });
});

describe('Statistic.quartile()', () => {
  it('should handle case of no numbers by returning NaN', () => {
    expect(Statistic.quartile([], 1)).toEqual(NaN);
  });

  it('should compute quartiles for odd numbers', () => {
    const numbers = [6, 7, 15, 36, 39, 40, 41, 42, 43, 47, 49];
    expect(Statistic.quartile(numbers, 1)).toEqual(15);
    expect(Statistic.quartile(numbers, 2)).toEqual(40);
    expect(Statistic.quartile(numbers, 3)).toEqual(43);
  });

  it('should compute quartiles for even numbers', () => {
    const numbers = [7, 15, 36, 39, 40, 41];
    expect(Statistic.quartile(numbers, 1)).toEqual(15);
    expect(Statistic.quartile(numbers, 2)).toEqual(37.5);
    expect(Statistic.quartile(numbers, 3)).toEqual(40);
  });

  it('should be invariant to order', () => {
    const numbers = [41, 36, 15, 39, 40, 7];
    expect(Statistic.quartile(numbers, 2)).toEqual(37.5);
  });

  it('should not modify order', () => {
    const numbers = [41, 36, 15, 39, 40, 7];
    Statistic.quartile(numbers, 2);
    expect(numbers).toEqual([41, 36, 15, 39, 40, 7]);
  });

  it.each([
    [[1, 2, 3, 4]],
    [[1, 2, 3, 4, 5]],
    [[1, 2, 3, 4, 5, 6]],
    [[1, 2, 3, 4, 5, 6, 7]]
  ])('quartiles should be invariant to duplication %p', (numbers: number[]) => {
    const doubled = [...numbers, ...numbers];
    expect(Statistic.quartile(numbers, 1)).toEqual(
      Statistic.quartile(doubled, 1)
    );
    expect(Statistic.quartile(numbers, 2)).toEqual(
      Statistic.quartile(doubled, 2)
    );
    expect(Statistic.quartile(numbers, 3)).toEqual(
      Statistic.quartile(doubled, 3)
    );
  });
});

describe('Statistic.standardDeviation()', () => {
  it('should handle case of no numbers by returning NaN', () => {
    expect(Statistic.standardDeviation([])).toEqual(NaN);
  });

  it.each([
    [[1, 2, 3], 1],
    [[1, 2, 3, 4], 1.3],
    [[1, 2, 3, 4, 5], 1.6],
    [[1, 2, 3, 4, 5, 6], 1.9]
  ])(
    'should compute sample standard deviation for %p',
    (numbers: number[], expected: number) => {
      expect(Statistic.round(Statistic.standardDeviation(numbers), 1)).toEqual(
        expected
      );
    }
  );
});

describe('Statistic.interQuartileMean()', () => {
  it('should handle case of no numbers by returning NaN', () => {
    expect(Statistic.interQuartileMean([])).toEqual(NaN);
  });

  it('should calculate interQuartileMean for divisible by four', () => {
    expect(
      Statistic.interQuartileMean([5, 8, 4, 38, 8, 6, 9, 7, 7, 3, 1, 6])
    ).toEqual(6.5);
  });

  it('should calculate interQuartileMean for not divisible by four', () => {
    expect(Statistic.interQuartileMean([1, 2, 3, 4, 5])).toEqual(3);
    expect(
      Statistic.interQuartileMean([1, 3, 5, 7, 9, 11, 13, 15, 17])
    ).toEqual(9);
    expect(Statistic.interQuartileMean([0, 5, 1000])).toEqual(170);
  });
});

describe('Statistic.round()', () => {
  it('should handle NaN', () => {
    expect(Statistic.round(NaN)).toEqual(NaN);
  });

  it('should round number with specified precision', () => {
    expect(Statistic.round(3 / 4, 1)).toEqual(0.8);
    expect(Statistic.round(3 / 4, 2)).toEqual(0.75);
    expect(Statistic.round(1 / 6, 1)).toEqual(0.2);
    expect(Statistic.round(1 / 6, 2)).toEqual(0.17);
    expect(Statistic.round(1 / 6, 3)).toEqual(0.167);
  });
});

describe('standardNormalDensity', () => {
  it('should calculate standard normal density', () => {
    expect(Statistic.standardNormalDensity(0)).toEqual(
      1 / (2 * Math.PI) ** 0.5
    );
    expect(Statistic.standardNormalDensity(+1)).toEqual(
      Statistic.standardNormalDensity(-1)
    );
  });
});
