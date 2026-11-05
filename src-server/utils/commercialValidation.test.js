import { describe, expect, it } from 'vitest';
import {
  parseQuotationListQuery,
  validateInventoryReservationPayload,
  validateInventoryReservationRelease,
  validateProcessingLink,
  validateQuotationPayload,
  validateSalesOrderAvailabilityQuery,
  validateSalesOrderSlabAvailabilityQuery,
} from './commercialValidation.js';

const objectId = '507f1f77bcf86cd799439011';

function quotationPayload(overrides = {}) {
  return {
    customerId: objectId,
    issueDate: '2026-10-20',
    validUntil: '2026-10-31',
    currency: 'INR',
    lineItems: [{
      stoneId: '1',
      quantity: '10.5',
      areaSqFt: '10.5',
      unit: 'SQ_FT',
      unitRate: '125.50',
      discountPercent: '2',
      taxRatePercent: '0',
    }],
    ...overrides,
  };
}

describe('commercial request validation', () => {
  it('normalizes a bounded quotation payload without accepting computed totals', () => {
    const result = validateQuotationPayload(quotationPayload());
    expect(result.error).toBeUndefined();
    expect(result.value.lineItems[0]).toMatchObject({
      stoneId: '1',
      quantity: '10.5',
      areaSqFt: '10.5',
      unitRate: '125.50',
    });
  });

  it('rejects impossible calendar dates in payloads and list filters', () => {
    expect(validateQuotationPayload(quotationPayload({ issueDate: '2026-02-30' })).error).toMatch(/invalid/i);
    expect(parseQuotationListQuery({ from: '2026-02-30' }).error).toMatch(/invalid/i);
  });

  it('requires whole quantities for slab and piece lines', () => {
    const result = validateQuotationPayload(quotationPayload({
      lineItems: [{ stoneId: '1', quantity: '1.5', unit: 'SLAB', unitRate: '100' }],
    }));
    expect(result.error).toMatch(/whole number/i);
  });

  it('bounds pagination and validates an ordered date interval', () => {
    expect(parseQuotationListQuery({ page: '1', limit: '101' }).error).toMatch(/between 1 and 100/i);
    expect(parseQuotationListQuery({ from: '2026-10-21', to: '2026-10-20' }).error).toMatch(/cannot be after/i);
    expect(parseQuotationListQuery({ page: '2', limit: '25', from: '2026-10-01', to: '2026-10-20' }).value)
      .toMatchObject({ page: 2, limit: 25 });
  });

  it('requires both sales-order line and processing-job identifiers', () => {
    expect(validateProcessingLink({ processingJobId: objectId }).error).toMatch(/line ID/i);
    expect(validateProcessingLink({ lineItemId: objectId, processingJobId: objectId }).value).toEqual({
      lineItemId: objectId,
      processingJobId: objectId,
    });
  });

  it('validates and bounds sales-order availability lookup queries', () => {
    expect(validateSalesOrderAvailabilityQuery({ lineItemId: objectId }).value).toEqual({
      lineItemId: objectId,
      page: 1,
      limit: 20,
    });
    expect(validateSalesOrderAvailabilityQuery({ lineItemId: objectId, limit: '101' }).error)
      .toMatch(/between 1 and 100/i);
    expect(validateSalesOrderAvailabilityQuery({ lineItemId: objectId, unexpected: 'value' }).error)
      .toMatch(/unsupported/i);
  });

  it('validates paginated sales-order slab availability queries', () => {
    expect(validateSalesOrderSlabAvailabilityQuery({
      lineItemId: objectId,
      page: '2',
      limit: '25',
    }).value).toEqual({ lineItemId: objectId, page: 2, limit: 25 });
    expect(validateSalesOrderSlabAvailabilityQuery({ lineItemId: 'invalid' }).error)
      .toMatch(/valid sales order line ID/i);
    expect(validateSalesOrderSlabAvailabilityQuery({ lineItemId: objectId, page: '0' }).error)
      .toMatch(/positive integer/i);
    expect(validateSalesOrderSlabAvailabilityQuery({ lineItemId: objectId, limit: '101' }).error)
      .toMatch(/between 1 and 100/i);
  });

  it('accepts exactly one strict inventory reservation basis', () => {
    const valid = validateInventoryReservationPayload({
      lineItemId: objectId,
      batchId: objectId,
      areaSqFt: '25.5',
      requestKey: 'phase7-request-1',
    });
    expect(valid.value).toMatchObject({
      lineItemId: objectId,
      batchId: objectId,
      areaSqFt: 25.5,
      slabIds: [],
      requestKey: 'phase7-request-1',
    });
    expect(validateInventoryReservationPayload({
      lineItemId: objectId,
      batchId: objectId,
      quantity: 1,
      areaSqFt: 25,
      requestKey: 'phase7-request-2',
    }).error).toMatch(/exactly one/i);
    expect(validateInventoryReservationPayload({
      lineItemId: objectId,
      batchId: objectId,
      quantity: 1.5,
      requestKey: 'phase7-request-3',
    }).error).toMatch(/whole number/i);
  });

  it('requires a bounded reservation release reason', () => {
    expect(validateInventoryReservationRelease({ reason: ' Customer changed allocation. ' }).value)
      .toEqual({ reason: 'Customer changed allocation.' });
    expect(validateInventoryReservationRelease({ reason: '' }).error).toMatch(/required/i);
    expect(validateInventoryReservationRelease({ reason: 'valid', extra: true }).error).toMatch(/unsupported/i);
  });
});
