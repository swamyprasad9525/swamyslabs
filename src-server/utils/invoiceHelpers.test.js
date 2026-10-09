import { describe, expect, it } from 'vitest';
import { amountInWords, computeTotals, deriveTaxType, getFY, counterKey } from './invoiceHelpers.js';

describe('invoice helpers', () => {
  it('computes line totals, tax, and grand total', () => {
    expect(computeTotals([
      { description: 'Stone', qty: 10, rate: 125.5 },
      { description: 'Packing', qty: 2, rate: 100 },
    ], 18)).toMatchObject({ taxableValue: 1455, taxAmount: 261.9, grandTotal: 1716.9 });
  });

  it('derives GST type from buyer and seller states', () => {
    expect(deriveTaxType('37', '37')).toBe('CGST_SGST');
    expect(deriveTaxType('29', '37')).toBe('IGST');
  });

  it('converts deterministic rupee values to Indian words', () => {
    expect(amountInWords(14868.5)).toBe('FOURTEEN THOUSAND EIGHT HUNDRED SIXTY EIGHT RUPEES AND FIFTY PAISE ONLY');
  });

  it('derives Indian financial years and counter keys', () => {
    expect(getFY('2026-03-31T12:00:00Z')).toBe('2025-26');
    expect(getFY('2026-04-01T12:00:00Z')).toBe('2026-27');
    expect(counterKey('2026-27')).toBe('invoices_2026-27');
  });
});
