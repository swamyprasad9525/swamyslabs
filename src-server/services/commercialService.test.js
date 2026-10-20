import { describe, expect, it, vi } from 'vitest';
import {
  CommercialError,
  acceptQuotation,
  createQuotation,
  formatCommercialReference,
  issueQuotation,
} from './commercialService.js';

const activeSession = { inTransaction: () => true };
const customerId = '507f1f77bcf86cd799439011';

function createModel(capture) {
  return {
    create: vi.fn(async ([document]) => {
      capture.push(document);
      return [document];
    }),
  };
}

describe('commercial service foundations', () => {
  it('formats concurrency-backed references in India calendar time', () => {
    expect(formatCommercialReference('QT', new Date('2026-12-31T20:00:00.000Z'), 7))
      .toBe('QT-2027-0007');
  });

  it('requires a real active transaction for quotation creation', async () => {
    await expect(createQuotation({
      input: {},
      actor: 'authenticated-admin',
      session: { inTransaction: () => false },
    })).rejects.toMatchObject({
      status: 503,
      code: 'TRANSACTION_REQUIRED',
    });
  });

  it('calculates authoritative draft totals and stores only neutral seller identity', async () => {
    const quotations = [];
    const events = [];
    const result = await createQuotation({
      input: {
        customerId,
        currency: 'INR',
        lineItems: [{
          stoneId: '1',
          quantity: '2',
          areaSqFt: '2',
          unit: 'SQ_FT',
          unitRate: '100',
          discountPercent: '10',
          taxRatePercent: '18',
          lineTotalMinor: 1,
        }],
      },
      actor: 'authenticated-admin',
      now: new Date('2026-10-20T10:00:00.000Z'),
      session: activeSession,
      models: {
        CustomerModel: {
          findById: vi.fn(async () => ({
            _id: customerId,
            customerNumber: 'CU-2026-0001',
            name: 'Synthetic Customer',
            phone: '9999999999',
          })),
        },
        CounterModel: { findOneAndUpdate: vi.fn(async () => ({ seq: 1 })) },
        QuotationModel: createModel(quotations),
        QuotationEventModel: createModel(events),
      },
    });

    expect(result.quotation).toMatchObject({
      quotationNumber: 'QT-2026-0001',
      subtotalMinor: 20000,
      discountMinor: 2000,
      taxableMinor: 18000,
      taxMinor: 3240,
      grandTotalMinor: 21240,
      taxType: 'UNSPECIFIED',
      sellerSnapshot: { name: 'Swamy Slabs' },
      notification: { status: 'NOT_CONFIGURED' },
    });
    expect(Object.keys(result.quotation.sellerSnapshot)).toEqual(['name']);
    expect(result.quotation.lineItems[0].lineTotalMinor).toBe(21240);
    expect(String(result.quotation.rootQuotationId)).toBe(String(result.quotation._id));
    expect(events[0].type).toBe('QUOTATION_CREATED');
  });

  it('keeps validUntil inclusive for acceptance and blocks unconfigured tax on issue', async () => {
    const accepted = {
      _id: customerId,
      quotationNumber: 'QT-2026-0001',
      revision: 1,
      status: 'ISSUED',
      validUntil: new Date('2026-10-20T00:00:00.000Z'),
      save: vi.fn(async () => undefined),
    };
    const eventModel = createModel([]);
    await expect(acceptQuotation({
      quotationId: accepted._id,
      actor: 'authenticated-admin',
      now: new Date('2026-10-20T23:59:59.000Z'),
      session: activeSession,
      models: {
        QuotationModel: { findById: vi.fn(async () => accepted) },
        QuotationEventModel: eventModel,
      },
    })).resolves.toMatchObject({ quotation: { status: 'ACCEPTED' } });

    const taxedDraft = {
      ...accepted,
      status: 'DRAFT',
      issueDate: undefined,
      validUntil: new Date('2026-10-31T00:00:00.000Z'),
      taxMinor: 1800,
      taxType: 'UNSPECIFIED',
      save: vi.fn(async () => undefined),
    };
    await expect(issueQuotation({
      quotationId: taxedDraft._id,
      actor: 'authenticated-admin',
      now: new Date('2026-10-20T10:00:00.000Z'),
      session: activeSession,
      models: {
        QuotationModel: { findById: vi.fn(async () => taxedDraft) },
        QuotationEventModel: eventModel,
      },
    })).rejects.toEqual(expect.objectContaining({
      name: 'CommercialError',
      code: 'TAX_CONFIGURATION_REQUIRED',
    }));
    expect(taxedDraft.save).not.toHaveBeenCalled();
  });
});

it('exposes typed commercial errors', () => {
  expect(new CommercialError('Conflict', 409, 'CONFLICT')).toMatchObject({ status: 409, code: 'CONFLICT' });
});
