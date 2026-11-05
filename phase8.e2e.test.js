import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

const DATABASE_PREFIX = 'swamyslabs_phase8_';
const E2E_URI = String(process.env.PHASE8_E2E_MONGODB_URI || '').trim();

function isolatedMongoConfiguration(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('PHASE8_E2E_MONGODB_URI must be a valid MongoDB URI.');
  }

  if (parsed.protocol !== 'mongodb:') {
    throw new Error('PHASE8_E2E_MONGODB_URI must use mongodb:// on localhost.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('PHASE8_E2E_MONGODB_URI is restricted to localhost or 127.0.0.1.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.startsWith(DATABASE_PREFIX) || databaseName.includes('/')) {
    throw new Error(`The Phase 8 E2E database name must start with ${DATABASE_PREFIX}.`);
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
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

describeWithIsolatedMongo('Phase 8 Invoicing, Payments & Physical Dispatch Acceptance Journey', () => {
  let appServer;
  let baseUrl;
  let token;
  let mongoose;
  let Lead;
  let Customer;
  let Quotation;
  let SalesOrder;
  let InventoryBatch;
  let InventoryMovement;
  let InventoryReservation;
  let Invoice;
  let Payment;
  let Dispatch;
  let SellerTaxProfile;
  let originalEnvironment;

  let testSalesOrderId;
  let testReservationId;
  let testInvoiceId;
  let testPaymentId;
  let testDispatchId;

  beforeAll(async () => {
    originalEnvironment = Object.fromEntries(
      TEST_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
    );

    process.env.MONGODB_URI = isolatedMongo.uri;
    process.env.JWT_SECRET = 'phase8-integration-test-secret-min-32-chars-long';
    process.env.ADMIN_PASSWORD = 'CorrectHorseBatteryStaple123!';
    process.env.EMAIL_USER = 'billing@swamyslabs.test';
    process.env.EMAIL_PASS = 'insecure-billing-mock-pass';
    process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:4173';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL;

    mongoose = (await import('mongoose')).default;
    await mongoose.connect(isolatedMongo.uri);
    await mongoose.connection.db.dropDatabase();

    Lead = (await import('./src-server/models/Lead.js')).default;
    Customer = (await import('./src-server/models/Customer.js')).default;
    Quotation = (await import('./src-server/models/Quotation.js')).default;
    SalesOrder = (await import('./src-server/models/SalesOrder.js')).default;
    InventoryBatch = (await import('./src-server/models/InventoryBatch.js')).default;
    InventoryMovement = (await import('./src-server/models/InventoryMovement.js')).default;
    InventoryReservation = (await import('./src-server/models/InventoryReservation.js')).default;
    Invoice = (await import('./src-server/models/Invoice.js')).default;
    Payment = (await import('./src-server/models/Payment.js')).default;
    Dispatch = (await import('./src-server/models/Dispatch.js')).default;
    SellerTaxProfile = (await import('./src-server/models/SellerTaxProfile.js')).default;

    const { default: app } = await import('./server.js');
    appServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => appServer.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;

    // Admin login
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'CorrectHorseBatteryStaple123!' }),
    });
    const loginData = await loginRes.json();
    token = loginData.token;
  }, 45000);

  afterAll(async () => {
    await closeHttpServer(appServer);
    if (mongoose?.connection?.readyState) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
    restoreEnvironment(originalEnvironment);
  });

  it('1. Establishes prerequisite Lead, Customer, Order, Batch, and Reservation', async () => {
    // 1. Create Lead & Customer
    const lead = await Lead.create({
      source: 'MANUAL',
      stage: 'QUALIFIED',
      customerDetails: {
        name: 'Venkata Satyanarayana Construction Ltd',
        phone: '9849012345',
        email: 'venkata@vsc.in',
      },
      requirements: { stoneType: 'Betamcherla Marble' },
    });

    const customer = await Customer.create({
      customerNumber: 'CUST-2026-0001',
      name: 'Venkata Satyanarayana Construction Ltd',
      phone: '9849012345',
      email: 'venkata@vsc.in',
      gstin: '37AAAAA0000A1Z5',
      billingAddress: {
        line1: '10 Industrial Area',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        stateCode: '37',
        postalCode: '520001',
      },
      sourceLead: lead._id,
    });

    // 2. Create Confirmed Sales Order
    const salesOrder = await SalesOrder.create({
      salesOrderNumber: 'SO-2026-0001',
      quotationNumber: 'QT-2026-0001',
      quotationRevision: 1,
      status: 'CONFIRMED',
      customerId: customer._id,
      customerSnapshot: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        gstin: customer.gstin,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.billingAddress,
      },
      items: [
        {
          stoneId: '507f1f77bcf86cd799439011',
          stoneSnapshot: { name: 'Betamcherla Marble', slug: 'betamcherla-marble' },
          surfaceFinish: 'Polished',
          thicknessMm: 20,
          quantity: 100,
          areaSqFt: 500,
          unit: 'SQ_FT',
          unitPriceMinor: 15000, // Rs. 150/sq.ft
          subtotalMinor: 7500000,
          discountMinor: 0,
          taxableMinor: 7500000,
          taxMinor: 1350000, // 18% GST = Rs. 13,500
          grandTotalMinor: 8850000, // Rs. 88,500
        },
      ],
      financialSnapshot: {
        currency: 'INR',
        subtotalMinor: 7500000,
        discountMinor: 0,
        taxableMinor: 7500000,
        taxMinor: 1350000,
        grandTotalMinor: 8850000,
      },
      fulfillmentStatus: {
        status: 'PENDING',
        fulfilledQuantity: 0,
        remainingQuantity: 100,
        fulfilledAreaSqFt: 0,
        remainingAreaSqFt: 500,
      },
    });
    testSalesOrderId = salesOrder._id.toString();

    // 3. Create Inventory Batch and Active Reservation
    const batch = await InventoryBatch.create({
      batchNumber: 'BATCH-2026-001',
      status: 'AVAILABLE',
      stoneName: 'Betamcherla Marble',
      surfaceFinish: 'Polished',
      thicknessMm: 20,
      quantityOnHand: 200,
      areaOnHandSqFt: 1000,
      reservedQuantity: 100,
      reservedAreaSqFt: 500,
    });

    const reservation = await InventoryReservation.create({
      reservationNumber: 'RES-2026-0001',
      salesOrderId: salesOrder._id,
      salesOrderLineItemId: salesOrder.items[0]._id,
      batchId: batch._id,
      status: 'ACTIVE',
      quantity: 100,
      areaSqFt: 500,
      batchSnapshot: {
        batchNumber: batch.batchNumber,
        stoneName: batch.stoneName,
        surfaceFinish: batch.surfaceFinish,
        thicknessMm: batch.thicknessMm,
      },
    });
    testReservationId = reservation._id.toString();

    expect(testSalesOrderId).toBeTruthy();
    expect(testReservationId).toBeTruthy();
  });

  it('2. Creates Invoice Draft and validates total calculations', async () => {
    const draftRes = await fetch(`${baseUrl}/api/admin/invoices/drafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        salesOrderId: testSalesOrderId,
        requestKey: `inv-draft-${Date.now()}-1`,
        dueDate: futureDateOnly(15),
        placeOfSupplyStateCode: '37',
        notes: 'Delivery through lorry freight.',
      }),
    });

    const draftData = await draftRes.json();
    expect(draftRes.status).toBe(201);
    expect(draftData.invoice).toBeDefined();
    expect(draftData.invoice.documentStatus).toBe('DRAFT');
    expect(draftData.invoice.grandTotalMinor).toBe(8850000);
    expect(draftData.invoice.taxMinor).toBe(1350000);
    testInvoiceId = draftData.invoice._id;
  });

  it('3. Enforces Seller Tax Profile verification gate before issuance', async () => {
    // Attempt issue while profile unverified -> must fail 409
    const issueRes = await fetch(`${baseUrl}/api/admin/invoices/${testInvoiceId}/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issueDate: new Date().toISOString().slice(0, 10),
        requestKey: `issue-req-${Date.now()}-1`,
      }),
    });

    const issueData = await issueRes.json();
    expect(issueRes.status).toBe(409);
    expect(issueData.code).toBe('SELLER_PROFILE_UNVERIFIED');

    // Verify Seller Tax Profile
    await SellerTaxProfile.findOneAndUpdate(
      { profileKey: 'PRIMARY_SELLER_PROFILE' },
      {
        $set: {
          'verification.identityVerified': true,
          'verification.taxRulesVerified': true,
          'verification.verifiedAt': new Date(),
          'verification.verifiedBy': 'integration-test',
        },
      },
      { upsert: true },
    );

    // Issue again -> must succeed
    const validIssueRes = await fetch(`${baseUrl}/api/admin/invoices/${testInvoiceId}/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issueDate: new Date().toISOString().slice(0, 10),
        requestKey: `issue-req-${Date.now()}-2`,
      }),
    });

    const validIssueData = await validIssueRes.json();
    expect(validIssueRes.status).toBe(200);
    expect(validIssueData.invoice.documentStatus).toBe('ISSUED');
    expect(validIssueData.invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(validIssueData.invoice.paymentStatus).toBe('UNPAID');
    expect(validIssueData.invoice.taxType).toBe('CGST_SGST'); // Intra-state 37 -> 37
  });

  it('4. Handles Partial and Full Payments with idempotency and balance reconciliation', async () => {
    const payKey = `pay-req-${Date.now()}-1`;

    // 1. Log partial payment of Rs. 40,000 (4,000,000 paise)
    const pay1Res = await fetch(`${baseUrl}/api/admin/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payKey,
      },
      body: JSON.stringify({
        invoiceId: testInvoiceId,
        amountMinor: 4000000,
        method: 'BANK_TRANSFER',
        referenceNumber: 'UTR-TEST-0001',
        receivedAt: new Date().toISOString(),
        requestKey: payKey,
      }),
    });

    const pay1Data = await pay1Res.json();
    expect(pay1Res.status).toBe(201);
    expect(pay1Data.payment.status).toBe('PENDING_VERIFICATION');
    testPaymentId = pay1Data.payment._id;

    // 2. Confirm payment
    const confirmRes = await fetch(`${baseUrl}/api/admin/payments/${testPaymentId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const confirmData = await confirmRes.json();
    expect(confirmRes.status).toBe(200);
    expect(confirmData.payment.status).toBe('CONFIRMED');

    // 3. Check invoice payment status is PARTIALLY_PAID
    const invRes = await fetch(`${baseUrl}/api/admin/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invData = await invRes.json();
    expect(invData.invoice.paymentStatus).toBe('PARTIALLY_PAID');
    expect(invData.invoice.paymentSummary.confirmedMinor).toBe(4000000);

    // 4. Test payment reversal
    const revRes = await fetch(`${baseUrl}/api/admin/payments/${testPaymentId}/reverse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Bank transaction reverted by customer' }),
    });
    expect(revRes.status).toBe(200);

    // Balance restored
    const invRevRes = await fetch(`${baseUrl}/api/admin/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invRevData = await invRevRes.json();
    expect(invRevData.invoice.paymentStatus).toBe('UNPAID');
    expect(invRevData.invoice.paymentSummary.confirmedMinor).toBe(0);

    // 5. Pay full balance Rs. 88,500 (8,850,000 paise)
    const fullPayKey = `pay-full-${Date.now()}`;
    const fullPayRes = await fetch(`${baseUrl}/api/admin/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': fullPayKey,
      },
      body: JSON.stringify({
        invoiceId: testInvoiceId,
        amountMinor: 8850000,
        method: 'RTGS',
        referenceNumber: 'RTGS-FULL-1001',
        receivedAt: new Date().toISOString(),
        requestKey: fullPayKey,
      }),
    });
    const fullPayData = await fullPayRes.json();
    await fetch(`${baseUrl}/api/admin/payments/${fullPayData.payment._id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const invFullRes = await fetch(`${baseUrl}/api/admin/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invFullData = await invFullRes.json();
    expect(invFullData.invoice.paymentStatus).toBe('PAID');
  });

  it('5. Creates Dispatch, marks ready, confirms departure and validates inventory stock deduction', async () => {
    // 1. Create Dispatch Draft
    const dispDraftRes = await fetch(`${baseUrl}/api/admin/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        salesOrderId: testSalesOrderId,
        reservationIds: [testReservationId],
        transport: {
          mode: 'BY_LORRY',
          vehicleNumber: 'AP21TC9999',
          carrierName: 'Balaji Freight Carriers',
          lrNumber: 'LR-2026-0981',
          driverName: 'Ramu',
          driverPhone: '9848011111',
        },
        notes: 'Material loaded in bay 3.',
      }),
    });

    const dispDraftData = await dispDraftRes.json();
    expect(dispDraftRes.status).toBe(201);
    expect(dispDraftData.dispatch.status).toBe('DRAFT');
    testDispatchId = dispDraftData.dispatch._id;

    // Reservation now has preparedDispatchId
    const resvDoc = await InventoryReservation.findById(testReservationId);
    expect(resvDoc.preparedDispatchId.toString()).toBe(testDispatchId);

    // 2. Mark Ready
    const readyRes = await fetch(`${baseUrl}/api/admin/dispatches/${testDispatchId}/ready`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const readyData = await readyRes.json();
    expect(readyRes.status).toBe(200);
    expect(readyData.dispatch.status).toBe('READY_TO_DISPATCH');

    // 3. Confirm Physical Dispatch (executes atomic multi-document movement)
    const confirmDispRes = await fetch(`${baseUrl}/api/admin/dispatches/${testDispatchId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const confirmDispData = await confirmDispRes.json();
    expect(confirmDispRes.status).toBe(200);
    expect(confirmDispData.dispatch.status).toBe('DISPATCHED');
    expect(confirmDispData.dispatch.gatePassNumber).toMatch(/^GP-\d{4}-\d{4}$/);

    // 4. Verify Physical Inventory Deductions
    const batchAfter = await InventoryBatch.findOne({ batchNumber: 'BATCH-2026-001' });
    expect(batchAfter.quantityOnHand).toBe(100); // 200 - 100 = 100
    expect(batchAfter.areaOnHandSqFt).toBe(500); // 1000 - 500 = 500
    expect(batchAfter.reservedQuantity).toBe(0); // 100 - 100 = 0
    expect(batchAfter.reservedAreaSqFt).toBe(0); // 500 - 500 = 0

    // 5. Verify Inventory Movement Record
    const movement = await InventoryMovement.findOne({
      referenceType: 'DISPATCH',
      referenceId: confirmDispData.dispatch._id,
    });
    expect(movement).toBeDefined();
    expect(movement.type).toBe('DISPATCH');
    expect(movement.quantityDelta).toBe(-100);
    expect(movement.areaDeltaSqFt).toBe(-500);

    // 6. Verify Reservation is marked CONSUMED
    const resvAfter = await InventoryReservation.findById(testReservationId);
    expect(resvAfter.status).toBe('CONSUMED');
    expect(resvAfter.consumedDispatchId.toString()).toBe(testDispatchId);

    // 7. Verify Sales Order Fulfillment is updated to FULFILLED
    const orderAfter = await SalesOrder.findById(testSalesOrderId);
    expect(orderAfter.fulfillmentStatus.status).toBe('FULFILLED');
    expect(orderAfter.fulfillmentStatus.fulfilledQuantity).toBe(100);
    expect(orderAfter.fulfillmentStatus.remainingQuantity).toBe(0);
    expect(orderAfter.fulfillmentStatus.fulfilledAreaSqFt).toBe(500);
    expect(orderAfter.fulfillmentStatus.remainingAreaSqFt).toBe(0);
  });
});
