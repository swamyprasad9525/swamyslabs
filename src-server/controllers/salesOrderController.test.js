import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/commercialService.js', async () => {
  const actual = await vi.importActual('../services/commercialService.js');
  return { ...actual, getSalesOrder: vi.fn() };
});

vi.mock('../services/inventoryService.js', async () => {
  const actual = await vi.importActual('../services/inventoryService.js');
  return {
    ...actual,
    listInventoryAllocationCandidates: vi.fn(),
    listReservableSlabs: vi.fn(),
  };
});

import { getSalesOrder } from '../services/commercialService.js';
import {
  listInventoryAllocationCandidates,
  listReservableSlabs,
} from '../services/inventoryService.js';
import { getSalesOrderReservableSlabs } from './salesOrderController.js';

const SALES_ORDER_ID = '507f1f77bcf86cd799439011';
const LINE_ITEM_ID = '507f191e810c19729de860ea';
const BATCH_ID = '507f191e810c19729de860eb';
const SLAB_ID = '507f191e810c19729de860ec';

function salesOrder(overrides = {}) {
  return {
    _id: SALES_ORDER_ID,
    status: 'CONFIRMED',
    items: [{
      _id: LINE_ITEM_ID,
      stoneSnapshot: {
        stoneId: '1',
        slug: 'tandur-yellow-limestone-cobble-premium',
      },
      finish: 'Honed',
      thicknessMm: 20,
    }],
    ...overrides,
  };
}

function responseDouble() {
  const response = {
    statusCode: 200,
    payload: undefined,
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode;
      return response;
    }),
    json: vi.fn((payload) => {
      response.payload = payload;
      return response;
    }),
  };
  return response;
}

describe('sales-order reservable slab controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesOrder.mockResolvedValue(salesOrder());
  });

  it('returns only paginated slabs from an exact matching allocation batch', async () => {
    const batch = { _id: BATCH_ID, inventoryMode: 'INDIVIDUAL_SLAB' };
    const slab = { _id: SLAB_ID, batch: BATCH_ID, status: 'AVAILABLE' };
    listInventoryAllocationCandidates.mockResolvedValue({ batches: [batch], total: 1 });
    listReservableSlabs.mockResolvedValue({
      batch,
      slabs: [slab],
      total: 3,
      page: 2,
      limit: 1,
      pages: 3,
    });
    const response = responseDouble();

    await getSalesOrderReservableSlabs({
      params: { id: SALES_ORDER_ID, batchId: BATCH_ID },
      query: { lineItemId: LINE_ITEM_ID, page: '2', limit: '1' },
    }, response);

    expect(listInventoryAllocationCandidates).toHaveBeenCalledWith({
      stoneId: '1',
      stoneSlug: 'tandur-yellow-limestone-cobble-premium',
      batchId: BATCH_ID,
      inventoryMode: 'INDIVIDUAL_SLAB',
      finish: 'Honed',
      thicknessMm: 20,
      page: 1,
      limit: 1,
    });
    expect(listReservableSlabs).toHaveBeenCalledWith({ batchId: BATCH_ID, page: 2, limit: 1 });
    expect(response.status).not.toHaveBeenCalled();
    expect(response.payload).toMatchObject({
      batch,
      slabs: [slab],
      total: 3,
      page: 2,
      limit: 1,
      pages: 3,
      lineItem: { _id: LINE_ITEM_ID },
    });
  });

  it('does not expose slabs when the requested batch is not eligible for the order line', async () => {
    listInventoryAllocationCandidates.mockResolvedValue({ batches: [], total: 0 });
    const response = responseDouble();

    await getSalesOrderReservableSlabs({
      params: { id: SALES_ORDER_ID, batchId: BATCH_ID },
      query: { lineItemId: LINE_ITEM_ID },
    }, response);

    expect(response.statusCode).toBe(404);
    expect(response.payload).toEqual({
      error: 'Matching inventory batch was not found.',
      code: 'ALLOCATION_BATCH_NOT_FOUND',
    });
    expect(listReservableSlabs).not.toHaveBeenCalled();
  });

  it('rejects cancelled orders before looking up inventory', async () => {
    getSalesOrder.mockResolvedValue(salesOrder({ status: 'CANCELLED' }));
    const response = responseDouble();

    await getSalesOrderReservableSlabs({
      params: { id: SALES_ORDER_ID, batchId: BATCH_ID },
      query: { lineItemId: LINE_ITEM_ID },
    }, response);

    expect(response.statusCode).toBe(409);
    expect(response.payload.code).toBe('INVALID_SALES_ORDER_STATE');
    expect(listInventoryAllocationCandidates).not.toHaveBeenCalled();
    expect(listReservableSlabs).not.toHaveBeenCalled();
  });

  it('rejects malformed route identifiers before loading the order', async () => {
    const response = responseDouble();

    await getSalesOrderReservableSlabs({
      params: { id: SALES_ORDER_ID, batchId: 'not-an-object-id' },
      query: { lineItemId: LINE_ITEM_ID },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(response.payload.code).toBe('INVALID_ID');
    expect(getSalesOrder).not.toHaveBeenCalled();
  });
});
