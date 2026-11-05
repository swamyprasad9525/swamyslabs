import { describe, expect, it } from 'vitest';
import {
  parseBillingInvoiceListQuery,
  validateInvoiceDraftCreate,
  validateInvoiceDraftUpdate,
  validateInvoiceIssue,
  validateSellerTaxProfileUpdate,
} from './billingValidation.js';

describe('billing validation', () => {
  it('validates invoice draft create payload', () => {
    const valid = validateInvoiceDraftCreate({
      salesOrderId: '507f1f77bcf86cd799439011',
      requestKey: 'valid-req-key-1234',
      dueDate: '2026-12-01',
      placeOfSupplyStateCode: '29',
    });
    expect(valid.error).toBeUndefined();
    expect(valid.value.salesOrderId).toBe('507f1f77bcf86cd799439011');
    expect(valid.value.placeOfSupplyStateCode).toBe('29');

    const invalidState = validateInvoiceDraftCreate({
      salesOrderId: '507f1f77bcf86cd799439011',
      requestKey: 'valid-req-key-1234',
      placeOfSupplyStateCode: 'A1',
    });
    expect(invalidState.error).toMatch(/two-digit Indian state code/);
  });

  it('validates invoice draft update payload', () => {
    const valid = validateInvoiceDraftUpdate({
      notes: 'Rush order delivery',
      terms: 'Payment upon delivery',
    });
    expect(valid.error).toBeUndefined();
    expect(valid.value.notes).toBe('Rush order delivery');

    // Prevents tampering with source sales order or request key in draft update
    const immutableAttempt = validateInvoiceDraftUpdate({
      salesOrderId: '507f1f77bcf86cd799439099',
    });
    expect(immutableAttempt.error).toMatch(/cannot be changed/);
  });

  it('validates invoice issue payload', () => {
    const valid = validateInvoiceIssue({
      issueDate: '2026-11-05',
      requestKey: 'issue-key-998877',
    });
    expect(valid.error).toBeUndefined();
    expect(valid.value.requestKey).toBe('issue-key-998877');

    const missingDate = validateInvoiceIssue({
      requestKey: 'issue-key-998877',
    });
    expect(missingDate.error).toMatch(/Issue date is required/);
  });

  it('validates seller tax profile updates with strict GSTIN and verification rules', () => {
    const valid = validateSellerTaxProfileUpdate({
      legalName: 'Swamy Slabs Industries',
      registeredAddress: 'Plot 45, Jigani Industrial Area, Anekal Taluk, Bangalore',
      gstin: '29AABCU9603R1ZM',
      registrationState: 'Karnataka',
      stateCode: '29',
      invoiceSeries: 'INV',
      taxRules: [{
        stoneId: 'black-galaxy',
        stoneSlug: 'black-galaxy',
        hsnCode: '680221',
        taxRateBasisPoints: 1800,
      }],
      verification: {
        identityVerified: true,
        taxRulesVerified: true,
        verificationNote: 'Verified by Accounts Lead against GST Portal',
      },
    });
    expect(valid.error).toBeUndefined();
    expect(valid.value.gstin).toBe('29AABCU9603R1ZM');
    expect(valid.value.taxRules).toHaveLength(1);

    const invalidGSTIN = validateSellerTaxProfileUpdate({
      gstin: 'INVALID-GSTIN',
    });
    expect(invalidGSTIN.error).toMatch(/GSTIN format is invalid/);

    const verifiedWithoutNote = validateSellerTaxProfileUpdate({
      verification: {
        identityVerified: true,
        taxRulesVerified: false,
        verificationNote: '',
      },
    });
    expect(verifiedWithoutNote.error).toMatch(/verification note is required/);
  });

  it('parses and bounds invoice list queries', () => {
    const parsed = parseBillingInvoiceListQuery({
      page: '2',
      limit: '50',
      documentStatus: 'ISSUED',
      paymentStatus: 'UNPAID',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(parsed.error).toBeUndefined();
    expect(parsed.value.page).toBe(2);
    expect(parsed.value.limit).toBe(50);
    expect(parsed.value.documentStatus).toBe('ISSUED');
    expect(parsed.value.paymentStatus).toBe('UNPAID');

    const invalidRange = parseBillingInvoiceListQuery({
      from: '2026-12-31',
      to: '2026-01-01',
    });
    expect(invalidRange.error).toMatch(/From date cannot be after to date/);
  });
});
