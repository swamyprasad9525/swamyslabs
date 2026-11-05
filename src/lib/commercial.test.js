import { describe, expect, it } from 'vitest';
import {
  actionIsAllowed,
  commercialLineQuantity,
  formatCommercialMoney,
  normalizedAllowedActions,
  quotationTotals,
} from './commercial.js';

describe('commercial UI adapters', () => {
  it('formats persisted integer minor units without inventing a currency', () => {
    expect(formatCommercialMoney(123450, '')).toBe('1,234.50 (currency not recorded)');
    expect(formatCommercialMoney(12.5, 'INR')).toBe('Not recorded');
  });

  it('derives a display quantity from persisted milli-units', () => {
    expect(commercialLineQuantity({ quantityMilli: 10125 })).toBe(10.125);
    expect(commercialLineQuantity({ quantity: 3, quantityMilli: 9999 })).toBe(3);
  });

  it('reads totals from both quotation and financial snapshot shapes', () => {
    expect(quotationTotals({ grandTotalMinor: 500 })).toMatchObject({ grandTotalMinor: 500 });
    expect(quotationTotals({ financialSnapshot: { totals: { grandTotalMinor: 750 } } })).toEqual({ grandTotalMinor: 750 });
  });

  it('normalizes array and object action contracts', () => {
    expect([...normalizedAllowedActions({ allowedActions: ['ISSUE', 'cancel'] })]).toEqual(['issue', 'cancel']);
    expect(actionIsAllowed({ allowedActions: { convert: true, cancel: false } }, 'convert')).toBe(true);
    expect(actionIsAllowed({}, 'issue', false)).toBe(false);
  });
});
