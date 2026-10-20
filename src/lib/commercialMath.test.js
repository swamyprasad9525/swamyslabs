import { describe, expect, it } from 'vitest';
import {
  calculateCommercialLine,
  calculateQuotationTotals,
  minorToMoney,
  moneyToMinor,
  percentToBasisPoints,
  quantityToMilli,
} from './commercialMath.js';

describe('commercial money helpers', () => {
  it('converts currency, quantity and percentage inputs to deterministic integers', () => {
    expect(moneyToMinor('123.45')).toBe(12345);
    expect(quantityToMilli('10.125')).toBe(10125);
    expect(percentToBasisPoints('18')).toBe(1800);
    expect(minorToMoney(12345)).toBe(123.45);
  });

  it('rounds each line to paise using integer arithmetic', () => {
    expect(calculateCommercialLine({
      quantity: '10.125',
      unitRate: '123.45',
      discountPercent: '2.5',
      taxRatePercent: '18',
    })).toMatchObject({
      lineSubtotalMinor: 124993,
      discountMinor: 3125,
      taxableMinor: 121868,
      taxMinor: 21936,
      lineTotalMinor: 143804,
    });
  });

  it('sums stored line results and returns a rate-grouped tax breakdown', () => {
    const result = calculateQuotationTotals([
      { quantity: '2', unitRate: '100', discountPercent: '0', taxRatePercent: '18' },
      { quantity: '1', unitRate: '50', discountPercent: '10', taxRatePercent: '0' },
    ]);

    expect(result.totals).toEqual({
      subtotalMinor: 25000,
      discountMinor: 500,
      taxableMinor: 24500,
      taxMinor: 3600,
      grandTotalMinor: 28100,
    });
    expect(result.taxBreakdown).toEqual([
      { taxRateBasisPoints: 0, taxableMinor: 4500, taxMinor: 0 },
      { taxRateBasisPoints: 1800, taxableMinor: 20000, taxMinor: 3600 },
    ]);
  });

  it('rejects excessive precision, negative values and percentages over 100', () => {
    expect(() => moneyToMinor('1.001')).toThrow(/2 decimal places/);
    expect(() => quantityToMilli('-1')).toThrow(/non-negative/);
    expect(() => percentToBasisPoints('100.01')).toThrow(/100%/);
  });
});
