import { describe, expect, it } from 'vitest';
import { parseInvoiceListQuery, validateEnquiry, validateInvoiceInput } from './validation.js';
import { getInvoice } from '../controllers/invoiceController.js';

describe('request validation helpers', () => {
  it('applies invoice pagination defaults', () => {
    expect(parseInvoiceListQuery({}).value).toMatchObject({ page: 1, limit: 20 });
  });

  it('rejects out-of-range pagination', () => {
    expect(parseInvoiceListQuery({ page: '0', limit: '20' }).error).toBeTruthy();
    expect(parseInvoiceListQuery({ page: '1', limit: '101' }).error).toBeTruthy();
    expect(parseInvoiceListQuery({ page: 'abc', limit: '20' }).error).toBeTruthy();
  });

  it('validates invoice line item quantities and rates', () => {
    const base = { buyer: { name: 'Buyer' }, consignee: { name: 'Receiver' } };
    expect(validateInvoiceInput({ ...base, lineItems: [{ description: 'Stone', qty: 0, rate: 10 }] }).error).toBeTruthy();
    expect(validateInvoiceInput({ ...base, lineItems: [{ description: 'Stone', qty: 1, rate: 10 }] }).error).toBeUndefined();
  });

  it('preserves bounded stone and project context for an enquiry', () => {
    const result = validateEnquiry({
      customerName: 'Architect',
      email: 'architect@example.com',
      phoneNumber: '+919999999999',
      productName: 'Tandur Yellow Limestone',
      productId: '1',
      productSlug: 'tandur-yellow-limestone',
      productUrl: '/stones/tandur-yellow-limestone',
      selectedFinish: 'Tumbled',
      company: 'Studio',
      projectLocation: 'Hyderabad',
      quantity: '2000 sq.ft',
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      productId: '1',
      productSlug: 'tandur-yellow-limestone',
      productUrl: '/stones/tandur-yellow-limestone',
      selectedFinish: 'Tumbled',
      company: 'Studio',
      projectLocation: 'Hyderabad',
    });
  });

  it('returns 400 for malformed invoice IDs without querying MongoDB', async () => {
    const response = {
      statusCode: 200,
      payload: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await getInvoice({ params: { id: 'not-an-object-id' } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.payload.error).toMatch(/Invalid invoice ID/);
  });
});
