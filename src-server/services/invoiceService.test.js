import { describe, expect, it, vi } from 'vitest';
import {
  BillingError,
  calculateInvoiceTotalsFromOrderLines,
  createInvoiceDraft,
  issueInvoice,
  nextBillingReference,
  updateInvoiceDraft,
  voidInvoice,
} from './invoiceService.js';

const activeSession = { inTransaction: () => true };
const salesOrderId = '507f1f77bcf86cd799439011';
const invoiceId = '507f1f77bcf86cd799439022';
const customerId = '507f1f77bcf86cd799439033';
const quotationId = '507f1f77bcf86cd799439044';
const lineItemId = '507f1f77bcf86cd799439055';

function sampleOrderLine(overrides = {}) {
  // 10 sq.ft at 100.00 INR (10000 minor) = 1000.00 (100000 minor)
  // 10% discount = 100.00 (10000 minor), taxable = 900.00 (90000 minor)
  // 18% GST = 162.00 (16200 minor), total = 1062.00 (106200 minor)
  return {
    _id: lineItemId,
    stoneSnapshot: { stoneId: 'black-galaxy', name: 'Black Galaxy Granite', slug: 'black-galaxy' },
    description: 'Black Galaxy Polished 20mm',
    finish: 'POLISHED',
    thicknessMm: 20,
    quantity: 10,
    quantityMilli: 10000,
    areaSqFt: 10,
    unit: 'SQ_FT',
    unitRateMinor: 10000,
    lineSubtotalMinor: 100000,
    discountBasisPoints: 1000,
    discountMinor: 10000,
    taxableMinor: 90000,
    taxRateBasisPoints: 1800,
    taxMinor: 16200,
    lineTotalMinor: 106200,
    ...overrides,
  };
}

describe('invoice calculations and arithmetic', () => {
  it('correctly calculates deterministic totals with minor units and tax breakdown', () => {
    const line = sampleOrderLine();
    const result = calculateInvoiceTotalsFromOrderLines([line]);

    expect(result.totals).toEqual({
      subtotalMinor: 100000,
      discountMinor: 10000,
      taxableMinor: 90000,
      taxMinor: 16200,
      grandTotalMinor: 106200,
    });
    expect(result.taxBreakdown).toEqual([
      { taxRateBasisPoints: 1800, taxableMinor: 90000, taxMinor: 16200 },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].lineTotalMinor).toBe(106200);
  });

  it('rejects order lines with mismatched financial assertions', () => {
    const corruptedLine = sampleOrderLine({ lineTotalMinor: 999999 });
    expect(() => calculateInvoiceTotalsFromOrderLines([corruptedLine]))
      .toThrowError(BillingError);
  });

  it('generates immutable consecutive billing references in Indian calendar year', async () => {
    const mockCounter = {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 42 }),
    };
    const ref = await nextBillingReference('INV', new Date('2026-11-05T12:00:00.000Z'), mockCounter);
    expect(ref).toBe('INV-2026-0042');
  });
});

describe('invoice draft creation and updates', () => {
  it('requires a real transaction session', async () => {
    await expect(createInvoiceDraft({
      salesOrderId,
      requestKey: 'req-draft-001',
      actor: 'admin',
      session: { inTransaction: () => false },
    })).rejects.toMatchObject({
      status: 503,
      code: 'TRANSACTION_REQUIRED',
    });
  });

  it('creates a draft invoice with draft reference and UNPAID status', async () => {
    const line = sampleOrderLine();
    const mockOrder = {
      _id: salesOrderId,
      salesOrderNumber: 'SO-2026-0001',
      quotationId,
      quotationNumber: 'QTN-2026-0001',
      customerId,
      status: 'CONFIRMED',
      currency: 'INR',
      items: [line],
      financialSnapshot: {
        subtotalMinor: 100000,
        discountMinor: 10000,
        taxableMinor: 90000,
        taxMinor: 16200,
        grandTotalMinor: 106200,
        currency: 'INR',
      },
      customerSnapshot: {
        customerNumber: 'CUST-001',
        name: 'John Doe',
        company: 'Doe Enterprises',
        billingAddress: { stateCode: '29', state: 'Karnataka' },
      },
    };

    const createdInvoices = [];
    const createdEvents = [];

    const mockInvoiceModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ([doc]) => {
        const instance = {
          ...doc,
          save: vi.fn().mockResolvedValue(doc),
        };
        createdInvoices.push(instance);
        return [instance];
      }),
    };
    const mockSalesOrderModel = {
      findById: vi.fn().mockResolvedValue(mockOrder),
    };
    const mockInvoiceEventModel = {
      create: vi.fn(async ([evt]) => {
        createdEvents.push(evt);
        return [evt];
      }),
    };

    const result = await createInvoiceDraft({
      salesOrderId,
      requestKey: 'draft-req-12345',
      draft: { placeOfSupplyStateCode: '29' },
      actor: 'admin',
      now: new Date('2026-11-05T12:00:00.000Z'),
      session: activeSession,
      models: {
        InvoiceModel: mockInvoiceModel,
        SalesOrderModel: mockSalesOrderModel,
        InvoiceEventModel: mockInvoiceEventModel,
      },
    });

    expect(result.duplicate).toBe(false);
    expect(result.invoice.documentStatus).toBe('DRAFT');
    expect(result.invoice.invoiceNumber).toMatch(/^DRAFT-/);
    expect(result.invoice.paymentSummary).toEqual({
      confirmedMinor: 0,
      outstandingMinor: 106200,
      status: 'UNPAID',
    });
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].type).toBe('INVOICE_DRAFT_CREATED');
  });

  it('updates draft invoice notes and terms', async () => {
    const mockInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'DRAFT',
      notes: '',
      terms: '',
      save: vi.fn().mockResolvedValue(true),
    };
    const createdEvents = [];

    const result = await updateInvoiceDraft({
      invoiceId,
      updates: { notes: 'Updated notes', terms: 'Payment due in 15 days' },
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockInvoice) },
        InvoiceEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.invoice.notes).toBe('Updated notes');
    expect(result.invoice.terms).toBe('Payment due in 15 days');
    expect(createdEvents[0].type).toBe('INVOICE_DRAFT_UPDATED');
  });
});

describe('invoice issuance and GST verification gates', () => {
  it('blocks issuance if seller identity profile is unverified', async () => {
    const mockDraft = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'DRAFT',
      taxMinor: 16200,
    };
    const mockProfile = {
      profileKey: 'default',
      legalName: '',
      gstin: '',
      verification: { identityVerified: false },
    };

    await expect(issueInvoice({
      invoiceId,
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockDraft) },
        SellerTaxProfileModel: { findOne: vi.fn().mockResolvedValue(mockProfile) },
      },
    })).rejects.toMatchObject({
      status: 400,
      code: 'TAX_PROFILE_UNVERIFIED',
    });
  });

  it('blocks positive-tax issuance if tax rules are unverified', async () => {
    const mockDraft = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'DRAFT',
      taxMinor: 16200,
      itemsV2: [{
        stoneSnapshot: { stoneId: 'black-galaxy', name: 'Black Galaxy' },
        taxRateBasisPoints: 1800,
      }],
    };
    const mockProfile = {
      profileKey: 'default',
      legalName: 'Swamy Slabs Industries',
      registeredAddress: 'Industrial Area, Bangalore',
      gstin: '29ABCDE1234F1Z5',
      stateCode: '29',
      verification: { identityVerified: true, taxRulesVerified: false },
      taxRules: [],
    };

    await expect(issueInvoice({
      invoiceId,
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockDraft) },
        SellerTaxProfileModel: { findOne: vi.fn().mockResolvedValue(mockProfile) },
      },
    })).rejects.toMatchObject({
      status: 400,
      code: 'TAX_PROFILE_UNVERIFIED',
    });
  });

  it('issues invoice with CGST + SGST for intra-state supply when verified', async () => {
    const line = sampleOrderLine();
    const mockDraft = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'DRAFT',
      placeOfSupplyStateCode: '29', // Same as seller
      taxMinor: 16200,
      grandTotalMinor: 106200,
      itemsV2: [line],
      taxBreakdownV2: [{ taxRateBasisPoints: 1800, taxableMinor: 90000, taxMinor: 16200 }],
      save: vi.fn().mockResolvedValue(true),
    };
    const mockProfile = {
      profileKey: 'default',
      legalName: 'Swamy Slabs Industries',
      registeredAddress: 'Industrial Area, Bangalore',
      gstin: '29ABCDE1234F1Z5',
      registrationState: 'Karnataka',
      stateCode: '29',
      invoiceSeries: 'INV',
      verification: { identityVerified: true, taxRulesVerified: true },
      taxRules: [{
        stoneId: 'black-galaxy',
        stoneSlug: 'black-galaxy',
        hsnCode: '680221',
        taxRateBasisPoints: 1800,
      }],
    };

    const mockCounter = {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    };
    const createdEvents = [];

    const result = await issueInvoice({
      invoiceId,
      requestKey: 'issue-req-001',
      actor: 'admin',
      now: new Date('2026-11-05T12:00:00.000Z'),
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockDraft) },
        SellerTaxProfileModel: { findOne: vi.fn().mockResolvedValue(mockProfile) },
        CounterModel: mockCounter,
        InvoiceEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.invoice.documentStatus).toBe('ISSUED');
    expect(result.invoice.invoiceNumber).toBe('INV-2026-0001');
    expect(result.invoice.taxType).toBe('CGST_SGST');
    expect(result.invoice.cgstMinor).toBe(8100);
    expect(result.invoice.sgstMinor).toBe(8100);
    expect(result.invoice.igstMinor).toBe(0);
    expect(result.invoice.itemsV2[0].hsnCode).toBe('680221');
    expect(createdEvents[0].type).toBe('INVOICE_ISSUED');
  });

  it('issues invoice with IGST for inter-state supply when verified', async () => {
    const line = sampleOrderLine();
    const mockDraft = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'DRAFT',
      placeOfSupplyStateCode: '27', // Maharashtra (Seller is 29 Karnataka)
      taxMinor: 16200,
      grandTotalMinor: 106200,
      itemsV2: [line],
      taxBreakdownV2: [{ taxRateBasisPoints: 1800, taxableMinor: 90000, taxMinor: 16200 }],
      save: vi.fn().mockResolvedValue(true),
    };
    const mockProfile = {
      profileKey: 'default',
      legalName: 'Swamy Slabs Industries',
      registeredAddress: 'Industrial Area, Bangalore',
      gstin: '29ABCDE1234F1Z5',
      registrationState: 'Karnataka',
      stateCode: '29',
      invoiceSeries: 'INV',
      verification: { identityVerified: true, taxRulesVerified: true },
      taxRules: [{
        stoneId: 'black-galaxy',
        stoneSlug: 'black-galaxy',
        hsnCode: '680221',
        taxRateBasisPoints: 1800,
      }],
    };

    const mockCounter = {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 2 }),
    };

    const result = await issueInvoice({
      invoiceId,
      requestKey: 'issue-req-002',
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockDraft) },
        SellerTaxProfileModel: { findOne: vi.fn().mockResolvedValue(mockProfile) },
        CounterModel: mockCounter,
        InvoiceEventModel: { create: vi.fn(async ([evt]) => [evt]) },
      },
    });

    expect(result.invoice.documentStatus).toBe('ISSUED');
    expect(result.invoice.taxType).toBe('IGST');
    expect(result.invoice.igstMinor).toBe(16200);
    expect(result.invoice.cgstMinor).toBe(0);
    expect(result.invoice.sgstMinor).toBe(0);
  });
});

describe('invoice voiding', () => {
  it('blocks voiding an invoice that has confirmed payments', async () => {
    const mockIssuedInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      paymentSummary: { confirmedMinor: 50000, status: 'PARTIALLY_PAID' },
    };

    await expect(voidInvoice({
      invoiceId,
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockIssuedInvoice) },
      },
    })).rejects.toMatchObject({
      status: 409,
      code: 'INVOICE_HAS_PAYMENTS',
    });
  });

  it('voids an issued invoice with 0 payments', async () => {
    const mockIssuedInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      paymentSummary: { confirmedMinor: 0, status: 'UNPAID' },
      save: vi.fn().mockResolvedValue(true),
    };
    const createdEvents = [];

    const result = await voidInvoice({
      invoiceId,
      reason: 'Customer cancelled project before dispatch',
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockIssuedInvoice) },
        InvoiceEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.invoice.documentStatus).toBe('VOID');
    expect(createdEvents[0].type).toBe('INVOICE_VOIDED');
  });
});

