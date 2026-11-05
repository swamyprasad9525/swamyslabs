import { describe, expect, it } from 'vitest';
import {
  parseDispatchListQuery,
  validateDispatchCancel,
  validateDispatchCreate,
  validateDispatchUpdate,
} from './dispatchValidation.js';

describe('dispatch validation', () => {
  it('validates dispatch creation payload', () => {
    const valid = validateDispatchCreate({
      salesOrderId: '507f1f77bcf86cd799439011',
      reservationIds: ['507f1f77bcf86cd799439022', '507f1f77bcf86cd799439033'],
      dispatchDate: '2026-11-05',
      transport: {
        mode: 'ROAD',
        vehicleNumber: 'ka-01-ab-1234',
        driverName: 'Ramesh',
        driverPhone: '9876543210',
        transporterName: 'VRL Logistics',
      },
      destinationAddress: {
        line1: 'Site 42, HSR Layout',
        city: 'Bangalore',
        state: 'Karnataka',
        stateCode: '29',
      },
      notes: 'Fragile marble slabs; handle with care',
    });

    expect(valid.error).toBeUndefined();
    expect(valid.value.salesOrderId).toBe('507f1f77bcf86cd799439011');
    expect(valid.value.reservationIds).toHaveLength(2);
    expect(valid.value.transport.vehicleNumber).toBe('KA-01-AB-1234');
    expect(valid.value.transport.mode).toBe('ROAD');
  });

  it('rejects dispatch creation with empty or invalid reservations', () => {
    const emptyRes = validateDispatchCreate({
      salesOrderId: '507f1f77bcf86cd799439011',
      reservationIds: [],
    });
    expect(emptyRes.error).toMatch(/At least one reservation is required/);

    const duplicateRes = validateDispatchCreate({
      salesOrderId: '507f1f77bcf86cd799439011',
      reservationIds: ['507f1f77bcf86cd799439022', '507f1f77bcf86cd799439022'],
    });
    expect(duplicateRes.error).toMatch(/Duplicate reservations are not allowed/);
  });

  it('validates dispatch update and cancel payloads', () => {
    const update = validateDispatchUpdate({
      transport: { vehicleNumber: 'KA-05-XY-9999' },
      notes: 'Driver changed',
    });
    expect(update.error).toBeUndefined();
    expect(update.value.transport.vehicleNumber).toBe('KA-05-XY-9999');

    const cancel = validateDispatchCancel({
      reason: 'Customer requested delayed shipment',
    });
    expect(cancel.error).toBeUndefined();
    expect(cancel.value.reason).toBe('Customer requested delayed shipment');

    const missingCancelReason = validateDispatchCancel({});
    expect(missingCancelReason.error).toMatch(/Cancellation reason is required/);
  });

  it('parses and bounds dispatch list queries', () => {
    const query = parseDispatchListQuery({
      page: '1',
      limit: '25',
      status: 'READY_TO_DISPATCH',
      search: 'KA-01',
    });
    expect(query.error).toBeUndefined();
    expect(query.value.status).toBe('READY_TO_DISPATCH');
    expect(query.value.limit).toBe(25);
    expect(query.value.search).toBe('KA-01');
  });
});
