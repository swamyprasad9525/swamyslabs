import crypto from 'node:crypto';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const DATABASE_PREFIX = 'swamyslabs_phase55_';
const E2E_URI = String(process.env.PHASE55_E2E_MONGODB_URI || '').trim();

function isolatedMongoConfiguration(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('PHASE55_E2E_MONGODB_URI must be a valid MongoDB URI.');
  }

  if (parsed.protocol !== 'mongodb:') {
    throw new Error('PHASE55_E2E_MONGODB_URI must use mongodb:// on localhost.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('PHASE55_E2E_MONGODB_URI is restricted to localhost or 127.0.0.1.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.startsWith(DATABASE_PREFIX) || databaseName.includes('/')) {
    throw new Error(`The Phase 5.5 E2E database name must start with ${DATABASE_PREFIX}.`);
  }

  return { uri, hostname, databaseName };
}

const isolatedMongo = E2E_URI ? isolatedMongoConfiguration(E2E_URI) : null;
const describeWithIsolatedMongo = isolatedMongo ? describe : describe.skip;

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

describeWithIsolatedMongo('Phase 5.5 real public-to-admin acceptance journey', () => {
  let appServer;
  let baseUrl;
  let mongoose;
  let Lead;
  let Customer;
  let stone;
  let originalEnvironment;

  function assertConnectedToDisposableDatabase() {
    const databaseName = mongoose?.connection?.db?.databaseName;
    const hostname = String(mongoose?.connection?.host || '').toLowerCase();

    if (databaseName !== isolatedMongo.databaseName || !databaseName.startsWith(DATABASE_PREFIX)) {
      throw new Error('Refusing to use or clean a MongoDB database outside the Phase 5.5 test namespace.');
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

  function jsonOptions(method, token, body) {
    return {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }

  function plannerSubmission(submissionId) {
    const form = new FormData();
    const finish = stone.finishes[0];
    const thickness = stone.thicknesses[0];
    const application = stone.applications[0];

    form.set('submissionId', submissionId);
    form.set('source', 'PROJECT_PLANNER');
    form.set('customerName', 'Phase 55 Synthetic Customer');
    form.set('company', 'Phase 55 Integration QA');
    form.set('email', `phase55-${submissionId.slice(0, 8)}@example.invalid`);
    form.set('phoneNumber', '+919999999998');
    form.set('projectLocation', 'Synthetic Integration Site');
    form.set('productName', stone.name);
    form.set('productId', stone.id);
    form.set('productSlug', stone.slug);
    form.set('productUrl', `/project-planner?stone=${encodeURIComponent(stone.slug)}`);
    form.set('materialType', stone.materialFamily || stone.materialType || 'Natural stone');
    if (finish) form.set('selectedFinish', finish);
    if (thickness) form.set('thickness', thickness);
    if (application) form.set('application', application);
    form.set('quantity', '1,320 sq.ft');
    form.set('message', 'Synthetic Phase 5.5 acceptance request. Do not contact.');
    form.set('enteredArea', '1,200 sq.ft');
    form.set('projectAreaSqFt', '1200');
    form.set('planningAllowancePercent', '10');
    form.set('requiredAreaSqFt', '1320');
    form.set('estimatedSlabs', '12');
    form.set('indicativeMaterialEstimate', String((stone.price || 1) * 1320));
    return form;
  }

  function expectSafePublicAvailability(payload, expectedStatus) {
    expect(payload).toEqual({
      stone: {
        slug: stone.slug,
        name: stone.name,
      },
      availability: {
        status: expectedStatus,
        message: expect.any(String),
      },
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('Phase 55 Private Test Yard');
    expect(serialized).not.toContain('Phase 55 Synthetic Supplier');
    expect(serialized).not.toContain('321.45');
  }

  beforeAll(async () => {
    originalEnvironment = Object.fromEntries(
      TEST_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
    );

    process.env.MONGODB_URI = isolatedMongo.uri;
    process.env.JWT_SECRET = 'phase55-local-e2e-jwt-secret-that-is-never-used-outside-tests';
    process.env.ADMIN_PASSWORD = 'phase55-local-e2e-admin-password';
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
      throw new Error('The Phase 5.5 E2E test requires a clean Mongoose connection.');
    }

    const [{ default: app }, { connectDB }, leadModule, customerModule, catalogModule] = await Promise.all([
      import('./server.js'),
      import('./src-server/config/database.js'),
      import('./src-server/models/Lead.js'),
      import('./src-server/models/Customer.js'),
      import('./src/lib/catalog.js'),
    ]);

    Lead = leadModule.default;
    Customer = customerModule.default;
    stone = catalogModule.getAllStones()[0];
    if (!stone) throw new Error('The Phase 5.5 E2E test requires at least one real catalog stone.');

    await connectDB();
    assertConnectedToDisposableDatabase();
    await mongoose.connection.db.dropDatabase();

    await new Promise((resolve, reject) => {
      appServer = app.listen(0, '127.0.0.1');
      appServer.once('listening', resolve);
      appServer.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;
  }, 30_000);

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

  it('persists one planner lead, manages it in CRM, converts it, and publishes only safe availability', async () => {
    const submissionId = crypto.randomUUID();
    const firstSubmission = await request('/api/leads', {
      method: 'POST',
      body: plannerSubmission(submissionId),
    });
    expect(firstSubmission.response.status).toBe(201);
    expect(firstSubmission.body).toEqual({
      message: 'Request received successfully.',
      reference: expect.stringMatching(/^LD-\d{4}-\d{4}$/),
    });

    const leadReference = firstSubmission.body.reference;
    const retrySubmission = await request('/api/leads', {
      method: 'POST',
      body: plannerSubmission(submissionId),
    });
    expect(retrySubmission.response.status).toBe(200);
    expect(retrySubmission.body.reference).toBe(leadReference);
    expect(await Lead.countDocuments({ submissionId })).toBe(1);
    expect(await Lead.countDocuments({})).toBe(1);

    const unauthorized = await request('/api/admin/leads');
    expect(unauthorized.response.status).toBe(401);

    const login = await request('/api/admin/login', jsonOptions('POST', null, {
      password: process.env.ADMIN_PASSWORD,
    }));
    expect(login.response.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
    const token = login.body.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const dashboard = await request('/api/admin/crm/dashboard', { headers: authHeaders });
    expect(dashboard.response.status).toBe(200);
    expect(dashboard.body.metrics.newLeads).toBe(1);
    expect(dashboard.body.recentLeads).toEqual(
      expect.arrayContaining([expect.objectContaining({ leadNumber: leadReference })]),
    );

    const search = await request(
      `/api/admin/leads?search=${encodeURIComponent(leadReference)}&page=1&limit=20`,
      { headers: authHeaders },
    );
    expect(search.response.status).toBe(200);
    expect(search.body.total).toBe(1);
    expect(search.body.leads).toHaveLength(1);
    const leadId = search.body.leads[0]._id;

    const initialDetail = await request(`/api/admin/leads/${leadId}`, { headers: authHeaders });
    expect(initialDetail.response.status).toBe(200);
    expect(initialDetail.body.lead).toEqual(expect.objectContaining({
      leadNumber: leadReference,
      source: 'PROJECT_PLANNER',
      stage: 'NEW',
      contact: expect.objectContaining({
        name: 'Phase 55 Synthetic Customer',
        company: 'Phase 55 Integration QA',
        phone: '+919999999998',
      }),
      project: expect.objectContaining({
        location: 'Synthetic Integration Site',
        enteredArea: '1,200 sq.ft',
      }),
      materialContext: expect.objectContaining({
        stoneId: stone.id,
        stoneSlug: stone.slug,
        stoneName: stone.name,
        finish: stone.finishes[0],
        thickness: stone.thicknesses[0],
        application: stone.applications[0],
        quantity: '1,320 sq.ft',
      }),
      estimatorContext: expect.objectContaining({
        projectAreaSqFt: 1200,
        planningAllowancePercent: 10,
        requiredAreaSqFt: 1320,
        estimatedSlabs: 12,
      }),
      notification: expect.objectContaining({ emailStatus: 'NOT_CONFIGURED' }),
    }));

    const contacted = await request(
      `/api/admin/leads/${leadId}`,
      jsonOptions('PATCH', token, { stage: 'CONTACTED', reason: '' }),
    );
    expect(contacted.response.status).toBe(200);
    expect(contacted.body.lead.stage).toBe('CONTACTED');

    const qualified = await request(
      `/api/admin/leads/${leadId}`,
      jsonOptions('PATCH', token, { stage: 'QUALIFIED', reason: '' }),
    );
    expect(qualified.response.status).toBe(200);
    expect(qualified.body.lead.stage).toBe('QUALIFIED');

    const stagedDetail = await request(`/api/admin/leads/${leadId}`, { headers: authHeaders });
    expect(stagedDetail.response.status).toBe(200);
    expect(stagedDetail.body.lead.stageHistory.map(({ from, to }) => `${from || ''}->${to}`)).toEqual([
      '->NEW',
      'NEW->CONTACTED',
      'CONTACTED->QUALIFIED',
    ]);
    expect(stagedDetail.body.lead.activities.filter(({ type }) => type === 'STAGE_CHANGE')).toHaveLength(2);

    const conversion = await request(
      `/api/admin/leads/${leadId}/convert-to-customer`,
      jsonOptions('POST', token),
    );
    expect(conversion.response.status).toBe(201);
    expect(conversion.body.converted).toBe(true);
    const customerId = conversion.body.customer._id;

    const conversionRetry = await request(
      `/api/admin/leads/${leadId}/convert-to-customer`,
      jsonOptions('POST', token),
    );
    expect(conversionRetry.response.status).toBe(200);
    expect(conversionRetry.body.converted).toBe(false);
    expect(conversionRetry.body.customer._id).toBe(customerId);
    expect(await Customer.countDocuments({ sourceLead: leadId })).toBe(1);

    const customerDetail = await request(`/api/admin/customers/${customerId}`, { headers: authHeaders });
    expect(customerDetail.response.status).toBe(200);
    expect(customerDetail.body.customer.sourceLead).toEqual(expect.objectContaining({
      _id: leadId,
      leadNumber: leadReference,
      stage: 'QUALIFIED',
    }));

    const inventoryCreate = await request('/api/admin/inventory/batches', jsonOptions('POST', token, {
      stoneSlug: stone.slug,
      inventoryMode: 'BATCH',
      receivedDate: '2026-10-18',
      receivedCount: 10,
      receivedSqFt: 500,
      finish: stone.finishes[0],
      source: { supplier: 'Phase 55 Synthetic Supplier' },
      cost: { costPerSqFt: 321.45, currency: 'INR' },
      location: { warehouse: 'Phase 55 Private Test Yard', zone: 'E2E', rack: 'A1' },
      publicAvailabilityVisible: false,
    }));
    expect(inventoryCreate.response.status).toBe(201);
    expect(inventoryCreate.body.batch).toEqual(expect.objectContaining({
      publicAvailabilityVisible: false,
      stoneRef: expect.objectContaining({ stoneId: stone.id, slug: stone.slug, name: stone.name }),
    }));
    const batchId = inventoryCreate.body.batch._id;

    const hiddenAvailability = await request(`/api/stones/${encodeURIComponent(stone.slug)}/availability`);
    expect(hiddenAvailability.response.status).toBe(200);
    expectSafePublicAvailability(hiddenAvailability.body, 'CONFIRM_DURING_QUOTATION');

    const publishAvailability = await request(
      `/api/admin/inventory/batches/${batchId}`,
      jsonOptions('PATCH', token, { publicAvailabilityVisible: true }),
    );
    expect(publishAvailability.response.status).toBe(200);
    expect(publishAvailability.body.batch.publicAvailabilityVisible).toBe(true);

    const visibleAvailability = await request(`/api/stones/${encodeURIComponent(stone.slug)}/availability`);
    expect(visibleAvailability.response.status).toBe(200);
    expectSafePublicAvailability(visibleAvailability.body, 'AVAILABLE_FOR_ENQUIRY');

    const invoices = await request('/api/invoices?page=1&limit=1', { headers: authHeaders });
    expect(invoices.response.status).toBe(200);
    expect(invoices.body.invoices).toEqual([]);
  }, 60_000);
});
