import crypto from 'node:crypto';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const DATABASE_PREFIX = 'swamyslabs_phase7_';
const E2E_URI = String(process.env.PHASE7_E2E_MONGODB_URI || '').trim();

function isolatedMongoConfiguration(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('PHASE7_E2E_MONGODB_URI must be a valid MongoDB URI.');
  }

  if (parsed.protocol !== 'mongodb:') {
    throw new Error('PHASE7_E2E_MONGODB_URI must use mongodb:// on localhost.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('PHASE7_E2E_MONGODB_URI is restricted to localhost or 127.0.0.1.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.startsWith(DATABASE_PREFIX) || databaseName.includes('/')) {
    throw new Error(`The Phase 7 E2E database name must start with ${DATABASE_PREFIX}.`);
  }

  return { uri, hostname, databaseName };
}

const isolatedMongo = E2E_URI ? isolatedMongoConfiguration(E2E_URI) : null;
const describeWithIsolatedMongo = isolatedMongo ? describe.sequential : describe.skip;

const TEST_ENVIRONMENT_KEYS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'EMAIL_USER',
  'EMAIL_PASS',
  'ALLOWED_ORIGINS',
  'NODE_ENV',
  'VERCEL',
];

function restoreEnvironment(snapshot) {
  for (const key of TEST_ENVIRONMENT_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function closeHttpServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function futureDateOnly(days = 30) {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000))
    .toISOString()
    .slice(0, 10);
}

describeWithIsolatedMongo('Phase 7 real CRM-to-commercial-to-reservation acceptance journey', () => {
  let appServer;
  let baseUrl;
  let token;
  let stone;
  let mongoose;
  let Lead;
  let Customer;
  let Quotation;
  let QuotationEvent;
  let SalesOrder;
  let SalesOrderEvent;
  let InventoryBatch;
  let InventoryMovement;
  let InventoryReservation;
  let ReservationEvent;
  let ProcessingJob;
  let reserveInventory;
  let originalEnvironment;
  let loginEvidence;
  let salesOrderId;
  let salesOrderLineItemId;

  function assertConnectedToDisposableDatabase() {
    const databaseName = mongoose?.connection?.db?.databaseName;
    const hostname = String(mongoose?.connection?.host || '').toLowerCase();

    if (databaseName !== isolatedMongo.databaseName || !databaseName.startsWith(DATABASE_PREFIX)) {
      throw new Error('Refusing to use or clean a MongoDB database outside the Phase 7 test namespace.');
    }
    if (!['localhost', '127.0.0.1'].includes(hostname)) {
      throw new Error('Refusing to use or clean a non-local MongoDB connection.');
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  function jsonOptions(method, body, authenticated = true) {
    return {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  function expectStatus(result, status) {
    expect(result.response.status, JSON.stringify(result.body)).toBe(status);
    return result.body;
  }

  function expectNoStore(response) {
    expect(response.headers.get('cache-control') || '').toMatch(/no-store/i);
  }

  function plannerSubmission(submissionId) {
    const form = new FormData();
    const finish = stone.finishes?.[0];
    const thickness = stone.thicknesses?.[0];
    const application = stone.applications?.[0];

    form.set('submissionId', submissionId);
    form.set('source', 'PROJECT_PLANNER');
    form.set('customerName', 'Phase 7 Synthetic Customer');
    form.set('company', 'Phase 7 Integration QA');
    form.set('email', `phase7-${submissionId.slice(0, 8)}@example.invalid`);
    form.set('phoneNumber', '+919999999997');
    form.set('projectLocation', 'Synthetic Phase 7 Project');
    form.set('productName', stone.name);
    form.set('productId', stone.id);
    form.set('productSlug', stone.slug);
    form.set('productUrl', `/project-planner?stone=${encodeURIComponent(stone.slug)}`);
    form.set('materialType', stone.materialFamily || stone.materialType || 'Natural stone');
    if (finish) form.set('selectedFinish', finish);
    if (thickness) form.set('thickness', thickness);
    if (application) form.set('application', application);
    form.set('quantity', '100 sq.ft');
    form.set('message', 'Synthetic Phase 7 commercial acceptance request. Do not contact.');
    form.set('enteredArea', '100 sq.ft');
    form.set('projectAreaSqFt', '100');
    form.set('planningAllowancePercent', '0');
    form.set('requiredAreaSqFt', '100');
    form.set('estimatedSlabs', '1');
    return form;
  }

  async function createBatch({ receivedSqFt = 100, suffix = 'commercial' } = {}) {
    const created = await request('/api/admin/inventory/batches', jsonOptions('POST', {
      stoneSlug: stone.slug,
      inventoryMode: 'BATCH',
      receivedDate: new Date().toISOString().slice(0, 10),
      receivedCount: 1,
      receivedSqFt,
      finish: stone.finishes?.[0] || 'Raw',
      thicknessMm: 20,
      source: { supplier: `Synthetic Phase 7 ${suffix}` },
      location: { warehouse: 'Phase 7 Test Yard', zone: 'E2E', rack: suffix },
      notes: 'Disposable Phase 7 integration fixture. Do not use as business data.',
      publicAvailabilityVisible: false,
    }));
    expectStatus(created, 201);
    return created.body.batch;
  }

  async function createPlannedProcessingJob(batchId) {
    const created = await request('/api/admin/processing/jobs', jsonOptions('POST', {
      inventoryMode: 'BATCH',
      input: { batchId },
      target: { finish: 'Polished', thicknessMm: 18 },
      routing: [{ operation: 'CUTTING' }],
      expectedCompletionDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
      notes: 'Disposable Phase 7 Sales Order processing linkage fixture.',
    }));
    expectStatus(created, 201);

    const planned = await request(
      `/api/admin/processing/jobs/${created.body.job._id}/plan`,
      jsonOptions('POST', {}),
    );
    expectStatus(planned, 200);
    return planned.body.job;
  }

  async function getBatch(batchId) {
    const result = await request(`/api/admin/inventory/batches/${batchId}`, {
      headers: authHeaders(),
    });
    expectStatus(result, 200);
    expectNoStore(result.response);
    return result.body.batch;
  }

  beforeAll(async () => {
    originalEnvironment = Object.fromEntries(
      TEST_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
    );

    process.env.MONGODB_URI = isolatedMongo.uri;
    process.env.JWT_SECRET = 'phase7-local-e2e-jwt-secret-that-is-never-used-outside-tests';
    process.env.ADMIN_PASSWORD = 'phase7-local-e2e-admin-password';
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ALLOWED_ORIGINS = '';
    process.env.NODE_ENV = 'test';
    process.env.VERCEL = '1';

    vi.resetModules();
    vi.doMock('dotenv', () => ({
      default: { config: () => ({ parsed: {} }) },
    }));
    delete globalThis.__swamySlabsMongo;

    const mongooseModule = await import('mongoose');
    mongoose = mongooseModule.default;
    if (mongoose.connection.readyState !== 0) {
      throw new Error('The Phase 7 E2E test requires a clean Mongoose connection.');
    }

    const [
      { default: app },
      { connectDB },
      leadModule,
      customerModule,
      quotationModule,
      quotationEventModule,
      salesOrderModule,
      salesOrderEventModule,
      inventoryBatchModule,
      inventoryMovementModule,
      inventoryReservationModule,
      reservationEventModule,
      processingJobModule,
      reservationServiceModule,
      catalogModule,
    ] = await Promise.all([
      import('./server.js'),
      import('./src-server/config/database.js'),
      import('./src-server/models/Lead.js'),
      import('./src-server/models/Customer.js'),
      import('./src-server/models/Quotation.js'),
      import('./src-server/models/QuotationEvent.js'),
      import('./src-server/models/SalesOrder.js'),
      import('./src-server/models/SalesOrderEvent.js'),
      import('./src-server/models/InventoryBatch.js'),
      import('./src-server/models/InventoryMovement.js'),
      import('./src-server/models/InventoryReservation.js'),
      import('./src-server/models/ReservationEvent.js'),
      import('./src-server/models/ProcessingJob.js'),
      import('./src-server/services/reservationService.js'),
      import('./src/lib/catalog.js'),
    ]);

    Lead = leadModule.default;
    Customer = customerModule.default;
    Quotation = quotationModule.default;
    QuotationEvent = quotationEventModule.default;
    SalesOrder = salesOrderModule.default;
    SalesOrderEvent = salesOrderEventModule.default;
    InventoryBatch = inventoryBatchModule.default;
    InventoryMovement = inventoryMovementModule.default;
    InventoryReservation = inventoryReservationModule.default;
    ReservationEvent = reservationEventModule.default;
    ProcessingJob = processingJobModule.default;
    reserveInventory = reservationServiceModule.reserveInventory;
    stone = catalogModule.getAllStones()[0];
    if (!stone) throw new Error('The Phase 7 E2E test requires at least one real catalog stone.');

    await connectDB();
    assertConnectedToDisposableDatabase();
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      Lead.syncIndexes(),
      Customer.syncIndexes(),
      Quotation.syncIndexes(),
      QuotationEvent.syncIndexes(),
      SalesOrder.syncIndexes(),
      SalesOrderEvent.syncIndexes(),
      InventoryBatch.syncIndexes(),
      InventoryMovement.syncIndexes(),
      InventoryReservation.syncIndexes(),
      ReservationEvent.syncIndexes(),
      ProcessingJob.syncIndexes(),
    ]);

    await new Promise((resolve, reject) => {
      appServer = app.listen(0, '127.0.0.1');
      appServer.once('listening', resolve);
      appServer.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;

    loginEvidence = await request('/api/admin/login', jsonOptions('POST', {
      password: process.env.ADMIN_PASSWORD,
    }, false));
    if (loginEvidence.response.status !== 200 || !loginEvidence.body?.token) {
      throw new Error(`Phase 7 E2E admin login failed with status ${loginEvidence.response.status}.`);
    }
    token = loginEvidence.body.token;
  }, 45_000);

  afterAll(async () => {
    try {
      await closeHttpServer(appServer);
      if (mongoose?.connection?.readyState === 1) {
        assertConnectedToDisposableDatabase();
        await mongoose.connection.db.dropDatabase();
      }
      if (mongoose?.connection?.readyState !== 0) await mongoose.disconnect();
    } finally {
      vi.doUnmock('dotenv');
      delete globalThis.__swamySlabsMongo;
      if (originalEnvironment) restoreEnvironment(originalEnvironment);
    }
  }, 30_000);

  it('moves a real planner lead through one accepted quotation into exactly one Sales Order', async () => {
    expect(loginEvidence.body.token).toEqual(expect.any(String));
    expectNoStore(loginEvidence.response);

    const unauthorized = await request('/api/admin/quotations');
    expectStatus(unauthorized, 401);
    expectNoStore(unauthorized.response);

    const submissionId = crypto.randomUUID();
    const submitted = await request('/api/leads', {
      method: 'POST',
      body: plannerSubmission(submissionId),
    });
    expectStatus(submitted, 201);
    expect(submitted.body.reference).toMatch(/^LD-\d{4}-\d{4}$/);

    const leadSearch = await request(
      `/api/admin/leads?search=${encodeURIComponent(submitted.body.reference)}&page=1&limit=20`,
      { headers: authHeaders() },
    );
    expectStatus(leadSearch, 200);
    expect(leadSearch.body.leads).toHaveLength(1);
    const leadId = leadSearch.body.leads[0]._id;

    for (const stage of ['CONTACTED', 'QUALIFIED', 'READY_FOR_QUOTATION']) {
      const transition = await request(
        `/api/admin/leads/${leadId}`,
        jsonOptions('PATCH', { stage, reason: '' }),
      );
      expectStatus(transition, 200);
      expect(transition.body.lead.stage).toBe(stage);
    }

    const customerConversion = await request(
      `/api/admin/leads/${leadId}/convert-to-customer`,
      jsonOptions('POST'),
    );
    expectStatus(customerConversion, 201);
    const customerId = customerConversion.body.customer._id;
    expect(await Customer.countDocuments({ sourceLead: leadId })).toBe(1);

    const quotationCreate = await request('/api/admin/quotations', jsonOptions('POST', {
      customerId,
      sourceLeadId: leadId,
      validUntil: futureDateOnly(),
      currency: 'INR',
      lineItems: [{
        stoneId: stone.id,
        stoneSlug: stone.slug,
        description: `${stone.name} for the synthetic Phase 7 project`,
        finish: stone.finishes?.[0] || 'Raw',
        thicknessMm: 20,
        quantity: '100',
        areaSqFt: '100',
        unit: 'SQ_FT',
        unitRate: '125.50',
        discountPercent: '0',
        taxRatePercent: '0',
        processingRequirements: [{ operation: 'CUTTING', notes: 'Reviewed synthetic requirement.' }],
      }],
      paymentTerms: 'Synthetic test terms only.',
      deliveryTerms: 'Synthetic test delivery terms only.',
      notes: 'Disposable Phase 7 quotation.',
      internalNotes: 'Not customer data.',
    }));
    expectStatus(quotationCreate, 201);
    expectNoStore(quotationCreate.response);
    expect(quotationCreate.body.quotation).toMatchObject({
      status: 'DRAFT',
      customerId,
      sourceLeadId: leadId,
      currency: 'INR',
      subtotalMinor: 1255000,
      grandTotalMinor: 1255000,
    });
    const quotationId = quotationCreate.body.quotation._id;

    const issued = await request(
      `/api/admin/quotations/${quotationId}/issue`,
      jsonOptions('POST', { note: 'Synthetic document issuance.' }),
    );
    expectStatus(issued, 200);
    expect(issued.body.quotation.status).toBe('ISSUED');

    const accepted = await request(
      `/api/admin/quotations/${quotationId}/accept`,
      jsonOptions('POST', { note: 'Synthetic customer acceptance.' }),
    );
    expectStatus(accepted, 200);
    expect(accepted.body.quotation.status).toBe('ACCEPTED');

    const conversions = await Promise.all([
      request(`/api/admin/quotations/${quotationId}/convert-to-sales-order`, jsonOptions('POST', {})),
      request(`/api/admin/quotations/${quotationId}/convert-to-sales-order`, jsonOptions('POST', {})),
    ]);
    expect(conversions.map(({ response }) => response.status).sort((left, right) => left - right))
      .toEqual([200, 201]);
    expect(conversions.map(({ body }) => body.duplicate).sort()).toEqual([false, true]);
    const convertedIds = new Set(conversions.map(({ body }) => body.salesOrder._id));
    expect(convertedIds.size).toBe(1);
    [salesOrderId] = convertedIds;

    const retry = await request(
      `/api/admin/quotations/${quotationId}/convert-to-sales-order`,
      jsonOptions('POST', {}),
    );
    expectStatus(retry, 200);
    expect(retry.body).toMatchObject({ duplicate: true, salesOrder: { _id: salesOrderId } });

    expect(await SalesOrder.countDocuments({ quotationId })).toBe(1);
    const persistedQuotation = await Quotation.findById(quotationId).lean();
    expect(persistedQuotation.status).toBe('CONVERTED');
    expect(String(persistedQuotation.convertedSalesOrderId)).toBe(salesOrderId);
    expect(await QuotationEvent.countDocuments({ quotation: quotationId, type: 'QUOTATION_CONVERTED' })).toBe(1);

    const orderDetail = await request(`/api/admin/sales-orders/${salesOrderId}`, {
      headers: authHeaders(),
    });
    expectStatus(orderDetail, 200);
    expectNoStore(orderDetail.response);
    expect(orderDetail.body.salesOrder).toMatchObject({
      _id: salesOrderId,
      quotationId,
      status: 'CONFIRMED',
      financialSnapshot: { grandTotalMinor: 1255000 },
    });
    expect(orderDetail.body.salesOrder.items).toHaveLength(1);
    salesOrderLineItemId = orderDetail.body.salesOrder.items[0]._id;
    expect(await SalesOrderEvent.countDocuments({
      salesOrder: salesOrderId,
      type: 'SALES_ORDER_CREATED',
    })).toBe(1);
  }, 90_000);

  it('cancels a second real Sales Order and atomically releases its inventory without physical movement', async () => {
    const sourceLead = await Lead.findOne({ stage: 'READY_FOR_QUOTATION' }).lean();
    expect(sourceLead).toBeTruthy();
    const customer = await Customer.findOne({ sourceLead: sourceLead._id }).lean();
    expect(customer).toBeTruthy();

    const quotationCreate = await request('/api/admin/quotations', jsonOptions('POST', {
      customerId: String(customer._id),
      sourceLeadId: String(sourceLead._id),
      validUntil: futureDateOnly(),
      currency: 'INR',
      lineItems: [{
        stoneId: stone.id,
        stoneSlug: stone.slug,
        description: `${stone.name} cancellation and release fixture`,
        finish: stone.finishes?.[0] || 'Raw',
        thicknessMm: 20,
        quantity: '25',
        areaSqFt: '25',
        unit: 'SQ_FT',
        unitRate: '100',
        discountPercent: '0',
        taxRatePercent: '0',
      }],
      notes: 'Disposable cancellation auto-release quotation.',
    }));
    expectStatus(quotationCreate, 201);
    const quotationId = quotationCreate.body.quotation._id;

    const issued = await request(
      `/api/admin/quotations/${quotationId}/issue`,
      jsonOptions('POST', { note: 'Synthetic cancellation fixture issuance.' }),
    );
    expectStatus(issued, 200);
    const accepted = await request(
      `/api/admin/quotations/${quotationId}/accept`,
      jsonOptions('POST', { note: 'Synthetic cancellation fixture acceptance.' }),
    );
    expectStatus(accepted, 200);

    const converted = await request(
      `/api/admin/quotations/${quotationId}/convert-to-sales-order`,
      jsonOptions('POST', {}),
    );
    expectStatus(converted, 201);
    expect(converted.body.duplicate).toBe(false);
    const cancellationOrderId = converted.body.salesOrder._id;
    const cancellationLineId = converted.body.salesOrder.items[0]._id;

    const batch = await createBatch({ receivedSqFt: 50, suffix: 'cancellation-release' });
    const movementCount = await InventoryMovement.countDocuments({ batch: batch._id });
    expect(movementCount).toBe(1);

    const reservation = await request(
      `/api/admin/sales-orders/${cancellationOrderId}/reservations`,
      jsonOptions('POST', {
        lineItemId: cancellationLineId,
        batchId: batch._id,
        areaSqFt: 25,
        requestKey: `phase7-cancel-${crypto.randomUUID()}`,
      }),
    );
    expectStatus(reservation, 201);
    expect(reservation.body).toMatchObject({
      reservation: { status: 'ACTIVE', areaSqFt: 25 },
      availability: {
        onHand: { areaSqFt: 50 },
        reserved: { areaSqFt: 25 },
        availableToPromise: { areaSqFt: 25 },
      },
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(movementCount);

    const cancelled = await request(
      `/api/admin/sales-orders/${cancellationOrderId}/cancel`,
      jsonOptions('POST', { reason: 'Synthetic cancellation must atomically release stock.' }),
    );
    expectStatus(cancelled, 200);
    expect(cancelled.body).toMatchObject({
      duplicate: false,
      salesOrder: {
        _id: cancellationOrderId,
        status: 'CANCELLED',
        allocationSummary: {
          reservedQuantity: 0,
          reservedAreaSqFt: 0,
          activeReservationCount: 0,
        },
      },
    });
    expect(cancelled.body.releasedReservations).toHaveLength(1);
    expect(cancelled.body.releasedReservations[0]).toMatchObject({
      reservation: {
        _id: reservation.body.reservation._id,
        status: 'RELEASED',
      },
      availability: { availableToPromise: { areaSqFt: 50 } },
    });

    const restoredBatch = await getBatch(batch._id);
    expect(restoredBatch).toMatchObject({
      status: 'AVAILABLE',
      quantity: { currentCount: 1 },
      area: { availableSqFt: 50 },
      reservationBalance: { quantity: 0, areaSqFt: 0 },
      inventoryAvailability: {
        onHand: { areaSqFt: 50 },
        reserved: { areaSqFt: 0 },
        availableToPromise: { areaSqFt: 50 },
      },
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(movementCount);
    expect(await InventoryReservation.countDocuments({
      salesOrderId: cancellationOrderId,
      status: 'ACTIVE',
    })).toBe(0);
    expect(await ReservationEvent.countDocuments({
      salesOrderId: cancellationOrderId,
      type: 'RELEASED',
    })).toBe(1);
    expect(await SalesOrderEvent.countDocuments({
      salesOrder: cancellationOrderId,
      type: 'SALES_ORDER_CANCELLED',
    })).toBe(1);

    const duplicateCancel = await request(
      `/api/admin/sales-orders/${cancellationOrderId}/cancel`,
      jsonOptions('POST', { reason: 'A duplicate cancellation must remain idempotent.' }),
    );
    expectStatus(duplicateCancel, 200);
    expect(duplicateCancel.body).toMatchObject({
      duplicate: true,
      salesOrder: { _id: cancellationOrderId, status: 'CANCELLED' },
      releasedReservations: [],
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(movementCount);
  }, 90_000);

  it('proves reservation ATP, idempotency, concurrency, release, and processing compatibility', async () => {
    const batch = await createBatch({ receivedSqFt: 100, suffix: 'reservation-processing' });
    const initialMovementCount = await InventoryMovement.countDocuments({ batch: batch._id });
    expect(initialMovementCount).toBe(1);

    const availability = await request(
      `/api/admin/sales-orders/${salesOrderId}/availability?lineItemId=${salesOrderLineItemId}&page=1&limit=20`,
      { headers: authHeaders() },
    );
    expectStatus(availability, 200);
    expectNoStore(availability.response);
    expect(JSON.stringify(availability.body)).toContain(batch._id);

    const firstRequest = {
      lineItemId: salesOrderLineItemId,
      batchId: batch._id,
      areaSqFt: 40,
      requestKey: `phase7-${crypto.randomUUID()}`,
    };
    const firstReservation = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations`,
      jsonOptions('POST', firstRequest),
    );
    expectStatus(firstReservation, 201);
    expect(firstReservation.body).toMatchObject({
      idempotent: false,
      reservation: { status: 'ACTIVE', basis: 'AREA', areaSqFt: 40, quantity: 0 },
      availability: {
        onHand: { quantity: 1, areaSqFt: 100 },
        reserved: { quantity: 0, areaSqFt: 40 },
        availableToPromise: { quantity: null, areaSqFt: 60 },
      },
    });
    const firstReservationId = firstReservation.body.reservation._id;

    const reservedBatch = await getBatch(batch._id);
    expect(reservedBatch).toMatchObject({
      status: 'AVAILABLE',
      quantity: { currentCount: 1 },
      area: { availableSqFt: 100 },
      reservationBalance: { quantity: 0, areaSqFt: 40 },
      inventoryAvailability: {
        basis: 'AREA',
        onHand: { quantity: 1, areaSqFt: 100 },
        reserved: { quantity: 0, areaSqFt: 40 },
        availableToPromise: { quantity: null, areaSqFt: 60 },
      },
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(initialMovementCount);

    const idempotentRetry = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations`,
      jsonOptions('POST', firstRequest),
    );
    expectStatus(idempotentRetry, 200);
    expect(idempotentRetry.body).toMatchObject({
      idempotent: true,
      reservation: { _id: firstReservationId },
    });
    expect(await InventoryReservation.countDocuments({
      salesOrderId,
      requestKey: firstRequest.requestKey,
    })).toBe(1);
    expect((await getBatch(batch._id)).reservationBalance.areaSqFt).toBe(40);

    const releaseFirst = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations/${firstReservationId}/release`,
      jsonOptions('POST', { reason: 'Synthetic idempotency reservation released.' }),
    );
    expectStatus(releaseFirst, 200);
    expect(releaseFirst.body).toMatchObject({
      idempotent: false,
      reservation: { _id: firstReservationId, status: 'RELEASED' },
      availability: { availableToPromise: { areaSqFt: 100 } },
    });

    const releaseRetry = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations/${firstReservationId}/release`,
      jsonOptions('POST', { reason: 'Synthetic duplicate release must not subtract twice.' }),
    );
    expectStatus(releaseRetry, 200);
    expect(releaseRetry.body.idempotent).toBe(true);
    expect((await getBatch(batch._id)).reservationBalance.areaSqFt).toBe(0);

    const competingBodies = [1, 2].map((number) => ({
      lineItemId: salesOrderLineItemId,
      batchId: batch._id,
      areaSqFt: 60,
      requestKey: `phase7-competing-${number}-${crypto.randomUUID()}`,
    }));
    const competing = await Promise.all(competingBodies.map((body) => request(
      `/api/admin/sales-orders/${salesOrderId}/reservations`,
      jsonOptions('POST', body),
    )));
    expect(competing.map(({ response }) => response.status).sort((left, right) => left - right))
      .toEqual([201, 409]);
    const winner = competing.find(({ response }) => response.status === 201).body;
    expect(winner.reservation).toMatchObject({ status: 'ACTIVE', areaSqFt: 60 });
    expect(await InventoryReservation.countDocuments({
      salesOrderId,
      batch: batch._id,
      status: 'ACTIVE',
    })).toBe(1);
    expect((await getBatch(batch._id)).inventoryAvailability).toMatchObject({
      onHand: { areaSqFt: 100 },
      reserved: { areaSqFt: 60 },
      availableToPromise: { areaSqFt: 40 },
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(initialMovementCount);

    const releaseWinner = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations/${winner.reservation._id}/release`,
      jsonOptions('POST', { reason: 'Release concurrency winner for processing compatibility test.' }),
    );
    expectStatus(releaseWinner, 200);
    expect((await getBatch(batch._id)).inventoryAvailability.availableToPromise.areaSqFt).toBe(100);

    const job = await createPlannedProcessingJob(batch._id);
    const link = await request(
      `/api/admin/sales-orders/${salesOrderId}/processing-links`,
      jsonOptions('POST', { lineItemId: salesOrderLineItemId, processingJobId: job._id }),
    );
    expect([200, 201]).toContain(link.response.status);
    expectNoStore(link.response);
    const linkedJob = await ProcessingJob.findById(job._id).lean();
    expect(linkedJob.sourceSalesOrder).toMatchObject({
      salesOrderId: expect.anything(),
      salesOrderLineItemId: expect.anything(),
    });
    expect(String(linkedJob.sourceSalesOrder.salesOrderId)).toBe(salesOrderId);
    expect(String(linkedJob.sourceSalesOrder.salesOrderLineItemId)).toBe(salesOrderLineItemId);

    const blockingReservation = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations`,
      jsonOptions('POST', {
        lineItemId: salesOrderLineItemId,
        batchId: batch._id,
        areaSqFt: 40,
        requestKey: `phase7-processing-block-${crypto.randomUUID()}`,
      }),
    );
    expectStatus(blockingReservation, 201);

    const blockedStart = await request(
      `/api/admin/processing/jobs/${job._id}/start`,
      jsonOptions('POST', {}),
    );
    expectStatus(blockedStart, 409);
    expect(await InventoryBatch.findById(batch._id).lean()).toMatchObject({
      status: 'AVAILABLE',
      quantity: { currentCount: 1 },
      area: { availableSqFt: 100 },
      reservationBalance: { quantity: 0, areaSqFt: 40 },
    });
    expect(await InventoryMovement.countDocuments({
      batch: batch._id,
      type: 'PROCESSING_ISSUE',
    })).toBe(0);

    const releaseBlocking = await request(
      `/api/admin/sales-orders/${salesOrderId}/reservations/${blockingReservation.body.reservation._id}/release`,
      jsonOptions('POST', { reason: 'Explicitly release before processing issue.' }),
    );
    expectStatus(releaseBlocking, 200);

    const started = await request(
      `/api/admin/processing/jobs/${job._id}/start`,
      jsonOptions('POST', {}),
    );
    expectStatus(started, 200);
    expect(started.body.job.status).toBe('IN_PROGRESS');
    const issuedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(issuedBatch).toMatchObject({
      status: 'IN_PROCESSING',
      quantity: { currentCount: 0 },
      area: { availableSqFt: 0 },
      reservationBalance: { quantity: 0, areaSqFt: 0 },
    });
    const processingIssues = await InventoryMovement.find({
      batch: batch._id,
      type: 'PROCESSING_ISSUE',
    }).lean();
    expect(processingIssues).toHaveLength(1);
    expect(processingIssues[0]).toMatchObject({ quantityDelta: -1, areaDeltaSqFt: -100 });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(initialMovementCount + 1);

    const salesOrder = await SalesOrder.findById(salesOrderId).lean();
    expect(salesOrder.allocationSummary).toMatchObject({
      reservedQuantity: 0,
      reservedAreaSqFt: 0,
      activeReservationCount: 0,
    });
    expect(salesOrder.processingLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lineItemId: expect.anything(),
        processingJobId: expect.anything(),
      }),
    ]));
    expect(await ReservationEvent.countDocuments({ salesOrderId, type: 'RESERVED' })).toBe(3);
    expect(await ReservationEvent.countDocuments({ salesOrderId, type: 'RELEASED' })).toBe(3);
  }, 120_000);

  it('rolls back a real reservation when its append-only event cannot be written', async () => {
    const batch = await createBatch({ receivedSqFt: 50, suffix: 'reservation-rollback' });
    const movementCount = await InventoryMovement.countDocuments({ batch: batch._id });
    const eventFailure = new Error('synthetic reservation event failure');
    const faultingEventModel = { create: vi.fn().mockRejectedValue(eventFailure) };
    const allocationCallback = vi.fn();
    const requestKey = `phase7-rollback-${crypto.randomUUID()}`;

    await expect(reserveInventory({
      salesOrderId,
      salesOrderLineItemId,
      requestKey,
      batchId: batch._id,
      areaSqFt: 10,
      expectedStone: { stoneId: stone.id, slug: stone.slug },
      actor: 'authenticated-admin',
      connection: mongoose.connection,
      models: { ReservationEventModel: faultingEventModel },
      applySalesOrderAllocation: allocationCallback,
    })).rejects.toBe(eventFailure);

    expect(faultingEventModel.create).toHaveBeenCalledTimes(1);
    expect(allocationCallback).not.toHaveBeenCalled();
    expect(await InventoryReservation.countDocuments({ requestKey })).toBe(0);
    expect(await ReservationEvent.countDocuments({ salesOrderId, 'details.batchId': batch._id })).toBe(0);
    const persistedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(persistedBatch).toMatchObject({
      status: 'AVAILABLE',
      quantity: { currentCount: 1 },
      area: { availableSqFt: 50 },
      reservationBalance: { quantity: 0, areaSqFt: 0 },
    });
    expect(await InventoryMovement.countDocuments({ batch: batch._id })).toBe(movementCount);
  }, 60_000);
});
