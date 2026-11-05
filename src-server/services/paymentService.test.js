import { describe, expect, it, vi } from 'vitest';
import {
  confirmPayment,
  createPayment,
  derivePaymentSummary,
  PaymentError,
  rejectPayment,
  reversePayment,
} from './paymentService.js';

const activeSession = { inTransaction: () => true };
const invoiceId = '507f1f77bcf86cd799439022';
const customerId = '507f1f77bcf86cd799439033';
const paymentId = '507f1f77bcf86cd799439099';

describe('payment summary arithmetic', () => {
  it('correctly derives payment summary states', () => {
    // 0 paid of 100,000 minor = UNPAID
    expect(derivePaymentSummary(100000, 0)).toEqual({
      confirmedMinor: 0,
      outstandingMinor: 100000,
      status: 'UNPAID',
    });

    // 40,000 paid of 100,000 minor = PARTIALLY_PAID
    expect(derivePaymentSummary(100000, 40000)).toEqual({
      confirmedMinor: 40000,
      outstandingMinor: 60000,
      status: 'PARTIALLY_PAID',
    });

    // 100,000 paid of 100,000 minor = PAID
    expect(derivePaymentSummary(100000, 100000)).toEqual({
      confirmedMinor: 100000,
      outstandingMinor: 0,
      status: 'PAID',
    });
  });

  it('rejects overpayments beyond grandTotalMinor', () => {
    expect(() => derivePaymentSummary(100000, 100001)).toThrowError(PaymentError);
  });
});

describe('payment recording and lifecycle', () => {
  it('creates a payment in PENDING_VERIFICATION status', async () => {
    const mockInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      currency: 'INR',
      grandTotalMinor: 100000,
      customerId,
      invoiceNumber: 'INV-2026-0001',
      paymentSummary: { confirmedMinor: 0, outstandingMinor: 100000, status: 'UNPAID' },
    };
    const mockCustomer = {
      _id: customerId,
      customerNumber: 'CUST-001',
      name: 'Acme Builders',
    };

    const createdPayments = [];
    const createdEvents = [];

    const mockPaymentModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ([doc]) => {
        createdPayments.push(doc);
        return [doc];
      }),
    };
    const mockPaymentEventModel = {
      create: vi.fn(async ([evt]) => {
        createdEvents.push(evt);
        return [evt];
      }),
    };

    const result = await createPayment({
      input: {
        invoiceId,
        customerId,
        amountMinor: 50000,
        currency: 'INR',
        method: 'NEFT',
        referenceNumber: 'UTR-12345678',
        requestKey: 'pay-req-001-abc',
      },
      actor: 'admin',
      session: activeSession,
      models: {
        InvoiceModel: { findById: vi.fn().mockResolvedValue(mockInvoice) },
        CustomerModel: { findById: vi.fn().mockResolvedValue(mockCustomer) },
        PaymentModel: mockPaymentModel,
        PaymentEventModel: mockPaymentEventModel,
      },
    });

    expect(result.idempotent).toBe(false);
    expect(result.payment.status).toBe('PENDING_VERIFICATION');
    expect(result.payment.amountMinor).toBe(50000);
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].type).toBe('PAYMENT_CREATED');
  });

  it('confirms payment and updates invoice payment status to PARTIALLY_PAID then PAID', async () => {
    const mockPayment = {
      _id: paymentId,
      invoiceId,
      customerId,
      amountMinor: 50000,
      currency: 'INR',
      status: 'PENDING_VERIFICATION',
      save: vi.fn().mockResolvedValue(true),
    };
    const mockInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      currency: 'INR',
      grandTotalMinor: 100000,
      customerId,
      paymentSummary: { confirmedMinor: 0, outstandingMinor: 100000, status: 'UNPAID' },
    };

    const createdPaymentEvents = [];
    const createdInvoiceEvents = [];

    const mockPaymentModel = {
      findById: vi.fn().mockResolvedValue(mockPayment),
      find: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]), // No other confirmed payments yet
      }),
    };

    const mockInvoiceModel = {
      findById: vi.fn().mockResolvedValue(mockInvoice),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ...mockInvoice,
        paymentSummary: { confirmedMinor: 50000, outstandingMinor: 50000, status: 'PARTIALLY_PAID' },
      }),
    };

    const result = await confirmPayment({
      paymentId,
      actor: 'admin',
      note: 'Verified in bank statement',
      session: activeSession,
      models: {
        PaymentModel: mockPaymentModel,
        InvoiceModel: mockInvoiceModel,
        PaymentEventModel: { create: vi.fn(async ([evt]) => { createdPaymentEvents.push(evt); return [evt]; }) },
        InvoiceEventModel: { create: vi.fn(async ([evt]) => { createdInvoiceEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.payment.status).toBe('CONFIRMED');
    expect(result.summary.status).toBe('PARTIALLY_PAID');
    expect(result.summary.confirmedMinor).toBe(50000);
    expect(result.summary.outstandingMinor).toBe(50000);
    expect(createdPaymentEvents[0].type).toBe('PAYMENT_CONFIRMED');
    expect(createdInvoiceEvents[0].type).toBe('PAYMENT_BALANCE_UPDATED');
  });

  it('rejects a pending payment', async () => {
    const mockPayment = {
      _id: paymentId,
      invoiceId,
      customerId,
      status: 'PENDING_VERIFICATION',
      amountMinor: 50000,
      currency: 'INR',
      save: vi.fn().mockResolvedValue(true),
    };
    const createdEvents = [];

    const result = await rejectPayment({
      paymentId,
      reason: 'Cheque bounced or invalid reference',
      actor: 'admin',
      session: activeSession,
      models: {
        PaymentModel: { findById: vi.fn().mockResolvedValue(mockPayment) },
        PaymentEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.payment.status).toBe('REJECTED');
    expect(createdEvents[0].type).toBe('PAYMENT_REJECTED');
  });

  it('reverses a confirmed payment and restores invoice outstanding balance', async () => {
    const mockPayment = {
      _id: paymentId,
      invoiceId,
      customerId,
      amountMinor: 50000,
      currency: 'INR',
      status: 'CONFIRMED',
      save: vi.fn().mockResolvedValue(true),
    };
    const mockInvoice = {
      _id: invoiceId,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      currency: 'INR',
      grandTotalMinor: 100000,
      customerId,
      paymentSummary: { confirmedMinor: 50000, outstandingMinor: 50000, status: 'PARTIALLY_PAID' },
    };

    const mockPaymentModel = {
      findById: vi.fn().mockResolvedValue(mockPayment),
      find: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]), // Remaining confirmed payments total 0
      }),
    };

    const mockInvoiceModel = {
      findById: vi.fn().mockResolvedValue(mockInvoice),
      findOneAndUpdate: vi.fn().mockResolvedValue(mockInvoice),
    };

    const result = await reversePayment({
      paymentId,
      reason: 'Chargeback / refund issued',
      actor: 'admin',
      session: activeSession,
      models: {
        PaymentModel: mockPaymentModel,
        InvoiceModel: mockInvoiceModel,
        PaymentEventModel: { create: vi.fn(async ([evt]) => [evt]) },
        InvoiceEventModel: { create: vi.fn(async ([evt]) => [evt]) },
      },
    });

    expect(result.payment.status).toBe('REVERSED');
    expect(result.summary.status).toBe('UNPAID');
    expect(result.summary.confirmedMinor).toBe(0);
    expect(result.summary.outstandingMinor).toBe(100000);
  });
});

