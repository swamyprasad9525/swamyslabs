import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const DATABASE_PREFIX = 'swamyslabs_phase6_';
const E2E_URI = String(process.env.PHASE6_E2E_MONGODB_URI || '').trim();

function isolatedMongoConfiguration(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('PHASE6_E2E_MONGODB_URI must be a valid MongoDB URI.');
  }

  if (parsed.protocol !== 'mongodb:') {
    throw new Error('PHASE6_E2E_MONGODB_URI must use mongodb:// on localhost.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('PHASE6_E2E_MONGODB_URI is restricted to localhost or 127.0.0.1.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.startsWith(DATABASE_PREFIX) || databaseName.includes('/')) {
    throw new Error(`The Phase 6 E2E database name must start with ${DATABASE_PREFIX}.`);
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

function futureDate(days = 7) {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

describeWithIsolatedMongo('Phase 6 real inventory-to-processing acceptance journeys', () => {
  let appServer;
  let baseUrl;
  let token;
  let stone;
  let mongoose;
  let InventoryBatch;
  let InventoryMovement;
  let ProcessingEvent;
  let ProcessingJob;
  let Slab;
  let startProcessingJob;
  let completeProcessingJob;
  let originalEnvironment;
  let unauthorizedEvidence;
  let loginEvidence;

  function assertConnectedToDisposableDatabase() {
    const databaseName = mongoose?.connection?.db?.databaseName;
    const hostname = String(mongoose?.connection?.host || '').toLowerCase();

    if (databaseName !== isolatedMongo.databaseName || !databaseName.startsWith(DATABASE_PREFIX)) {
      throw new Error('Refusing to use or clean a MongoDB database outside the Phase 6 test namespace.');
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

  async function createBatch({
    inventoryMode = 'BATCH',
    receivedCount = 1,
    receivedSqFt = 100,
    suffix = 'batch',
  } = {}) {
    const body = {
      stoneSlug: stone.slug,
      inventoryMode,
      receivedDate: '2026-10-19',
      finish: stone.finishes?.[0] || 'Raw',
      thicknessMm: 20,
      source: { supplier: `Synthetic Phase 6 ${suffix}` },
      notes: 'Disposable Phase 6 integration fixture. Do not use as business data.',
      publicAvailabilityVisible: false,
      ...(inventoryMode === 'BATCH'
        ? {
          receivedCount,
          receivedSqFt,
          location: { warehouse: 'Phase 6 Test Yard', zone: 'E2E', rack: suffix },
        }
        : {}),
    };
    const created = await request('/api/admin/inventory/batches', jsonOptions('POST', body));
    expectStatus(created, 201);
    return created.body.batch;
  }

  async function createSlab(batchId, suffix) {
    const created = await request(
      `/api/admin/inventory/batches/${batchId}/slabs`,
      jsonOptions('POST', {
        dimensions: { lengthMm: 1000, widthMm: 929.0304, thicknessMm: 20 },
        usableAreaSqFt: 10,
        location: { warehouse: 'Phase 6 Test Yard', zone: 'E2E', rack: suffix },
        notes: 'Disposable Phase 6 slab fixture.',
      }),
    );
    expectStatus(created, 201);
    return created.body.slab;
  }

  async function createJob({
    batchId,
    inventoryMode = 'BATCH',
    slabIds,
    operations = ['CUTTING', 'POLISHING'],
    targetFinish = 'Polished',
    notes = 'Disposable Phase 6 processing fixture.',
  }) {
    const created = await request('/api/admin/processing/jobs', jsonOptions('POST', {
      inventoryMode,
      input: {
        batchId,
        ...(inventoryMode === 'INDIVIDUAL_SLAB' ? { slabIds } : {}),
      },
      target: { finish: targetFinish, thicknessMm: 18 },
      routing: operations.map((operation) => ({ operation })),
      expectedCompletionDate: futureDate(),
      notes,
    }));
    expectStatus(created, 201);
    return created.body.job;
  }

  async function planJob(jobId) {
    const planned = await request(
      `/api/admin/processing/jobs/${jobId}/plan`,
      jsonOptions('POST', {}),
    );
    expectStatus(planned, 200);
    expect(planned.body.job.status).toBe('PLANNED');
    return planned.body.job;
  }

  async function createPlannedJob(options) {
    const job = await createJob(options);
    return planJob(job._id);
  }

  async function completeRouting(job) {
    let current = job;
    for (const operation of current.routing) {
      const started = await request(
        `/api/admin/processing/jobs/${current._id}/operations/${operation._id}/start`,
        jsonOptions('POST', { machineLabel: `Synthetic ${operation.operation} station` }),
      );
      expectStatus(started, 200);
      expect(started.body.job.routing.find(({ _id }) => _id === operation._id)?.status).toBe('IN_PROGRESS');

      const completed = await request(
        `/api/admin/processing/jobs/${current._id}/operations/${operation._id}/complete`,
        jsonOptions('POST', { notes: `${operation.operation} completed in the isolated test.` }),
      );
      expectStatus(completed, 200);
      current = completed.body.job;
    }
    expect(current.status).toBe('QC_PENDING');
    return current;
  }

  async function processingMovements(jobId, type) {
    return InventoryMovement.find({ relatedProcessingJobId: jobId, ...(type ? { type } : {}) })
      .sort({ occurredAt: 1, _id: 1 })
      .lean();
  }

  beforeAll(async () => {
    originalEnvironment = Object.fromEntries(
      TEST_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
    );

    process.env.MONGODB_URI = isolatedMongo.uri;
    process.env.JWT_SECRET = 'phase6-local-e2e-jwt-secret-that-is-never-used-outside-tests';
    process.env.ADMIN_PASSWORD = 'phase6-local-e2e-admin-password';
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
      throw new Error('The Phase 6 E2E test requires a clean Mongoose connection.');
    }

    const [
      { default: app },
      { connectDB },
      inventoryBatchModule,
      inventoryMovementModule,
      processingEventModule,
      processingJobModule,
      slabModule,
      processingServiceModule,
      catalogModule,
    ] = await Promise.all([
      import('./server.js'),
      import('./src-server/config/database.js'),
      import('./src-server/models/InventoryBatch.js'),
      import('./src-server/models/InventoryMovement.js'),
      import('./src-server/models/ProcessingEvent.js'),
      import('./src-server/models/ProcessingJob.js'),
      import('./src-server/models/Slab.js'),
      import('./src-server/services/processingService.js'),
      import('./src/lib/catalog.js'),
    ]);

    InventoryBatch = inventoryBatchModule.default;
    InventoryMovement = inventoryMovementModule.default;
    ProcessingEvent = processingEventModule.default;
    ProcessingJob = processingJobModule.default;
    Slab = slabModule.default;
    startProcessingJob = processingServiceModule.startProcessingJob;
    completeProcessingJob = processingServiceModule.completeProcessingJob;
    stone = catalogModule.getAllStones()[0];
    if (!stone) throw new Error('The Phase 6 E2E test requires at least one real catalog stone.');

    await connectDB();
    assertConnectedToDisposableDatabase();
    await mongoose.connection.db.dropDatabase();

    await new Promise((resolve, reject) => {
      appServer = app.listen(0, '127.0.0.1');
      appServer.once('listening', resolve);
      appServer.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;

    unauthorizedEvidence = await request('/api/admin/processing/summary');
    loginEvidence = await request('/api/admin/login', jsonOptions('POST', {
      password: process.env.ADMIN_PASSWORD,
    }, false));
    if (loginEvidence.response.status !== 200 || !loginEvidence.body?.token) {
      throw new Error(`Phase 6 E2E admin login failed with status ${loginEvidence.response.status}.`);
    }
    token = loginEvidence.body.token;
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

  it('runs one concurrent batch winner through HOLD, FAIL, area-safe cutting PASS, return, genealogy and dashboards', async () => {
    expect(unauthorizedEvidence.response.status).toBe(401);
    expect(unauthorizedEvidence.body).toEqual({ error: 'Authentication required.' });
    expect(loginEvidence.response.status).toBe(200);
    expect(loginEvidence.body.token).toEqual(expect.any(String));

    const batch = await createBatch({ receivedCount: 1, receivedSqFt: 100, suffix: 'batch-concurrency' });
    const first = await createPlannedJob({ batchId: batch._id, notes: 'First competing batch job.' });
    const second = await createPlannedJob({ batchId: batch._id, notes: 'Second competing batch job.' });

    const starts = await Promise.all([
      request(`/api/admin/processing/jobs/${first._id}/start`, jsonOptions('POST', {})),
      request(`/api/admin/processing/jobs/${second._id}/start`, jsonOptions('POST', {})),
    ]);
    expect(starts.map(({ response }) => response.status).sort((left, right) => left - right)).toEqual([200, 409]);

    const winner = starts.find(({ response }) => response.status === 200).body.job;
    const loserId = winner._id === first._id ? second._id : first._id;
    expect(winner.status).toBe('IN_PROGRESS');
    expect((await ProcessingJob.findById(loserId).lean()).status).toBe('PLANNED');

    const duplicateStart = await request(
      `/api/admin/processing/jobs/${winner._id}/start`,
      jsonOptions('POST', {}),
    );
    expectStatus(duplicateStart, 409);

    const issuedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(issuedBatch).toMatchObject({
      status: 'IN_PROCESSING',
      quantity: { receivedCount: 1, currentCount: 0 },
      area: { receivedSqFt: 100, availableSqFt: 0 },
    });
    expect(String(issuedBatch.activeProcessingJob)).toBe(winner._id);

    const issues = await processingMovements(winner._id, 'PROCESSING_ISSUE');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ quantityDelta: -1, areaDeltaSqFt: -100 });
    expect(await processingMovements(loserId, 'PROCESSING_ISSUE')).toHaveLength(0);

    const activeSummary = await request('/api/admin/processing/summary', { headers: authHeaders() });
    expectStatus(activeSummary, 200);
    expect(activeSummary.body.summary).toMatchObject({
      plannedJobs: 1,
      inProgressJobs: 1,
      qcPendingJobs: 0,
      materialInProcessing: {
        jobs: 1,
        quantity: 1,
        areaSqFt: 100,
        areaTrackedJobs: 1,
      },
    });

    const secondOperation = winner.routing[1];
    const outOfOrder = await request(
      `/api/admin/processing/jobs/${winner._id}/operations/${secondOperation._id}/start`,
      jsonOptions('POST', {}),
    );
    expectStatus(outOfOrder, 409);

    await completeRouting(winner);

    const impossibleOutput = await request(
      `/api/admin/processing/jobs/${winner._id}/qc`,
      jsonOptions('POST', {
        result: 'PASS',
        verifiedOutput: { quantity: 4, areaSqFt: 101, finish: 'Polished', thicknessMm: 18 },
      }),
    );
    expectStatus(impossibleOutput, 400);

    const hold = await request(
      `/api/admin/processing/jobs/${winner._id}/qc`,
      jsonOptions('POST', { result: 'HOLD', notes: 'Synthetic dimensional review hold.' }),
    );
    expectStatus(hold, 200);
    expect(hold.body.job).toMatchObject({ status: 'QC_PENDING', qualityCheck: { result: 'HOLD' } });
    expect(await processingMovements(winner._id, 'PROCESSING_RETURN')).toHaveLength(0);
    expect((await InventoryBatch.findById(batch._id).lean()).status).toBe('IN_PROCESSING');

    const failed = await request(
      `/api/admin/processing/jobs/${winner._id}/qc`,
      jsonOptions('POST', { result: 'FAIL', notes: 'Synthetic failed inspection before rework.' }),
    );
    expectStatus(failed, 200);
    expect(failed.body.job).toMatchObject({ status: 'QC_PENDING', qualityCheck: { result: 'FAIL' } });
    expect(await processingMovements(winner._id, 'PROCESSING_RETURN')).toHaveLength(0);
    expect(String((await InventoryBatch.findById(batch._id).lean()).activeProcessingJob)).toBe(winner._id);

    // Cutting can increase piece count. For area-tracked material, conservation,
    // waste and yield are therefore proved by verified area rather than piece count.
    const passed = await request(
      `/api/admin/processing/jobs/${winner._id}/qc`,
      jsonOptions('POST', {
        result: 'PASS',
        notes: 'Synthetic rework passed inspection.',
        verifiedOutput: {
          quantity: 4,
          areaSqFt: 90,
          finish: 'Polished',
          thicknessMm: 18,
        },
      }),
    );
    expectStatus(passed, 200);
    expect(passed.body.job).toMatchObject({ status: 'QC_PENDING', qualityCheck: { result: 'PASS' } });
    expect(await processingMovements(winner._id, 'PROCESSING_RETURN')).toHaveLength(0);

    const completedResponse = await request(
      `/api/admin/processing/jobs/${winner._id}/complete`,
      jsonOptions('POST', {}),
    );
    expectStatus(completedResponse, 200);
    expect(completedResponse.body.job.status).toBe('COMPLETED');

    const duplicateCompletion = await request(
      `/api/admin/processing/jobs/${winner._id}/complete`,
      jsonOptions('POST', {}),
    );
    expectStatus(duplicateCompletion, 409);

    const completedJob = await ProcessingJob.findById(winner._id).lean();
    expect(completedJob).toMatchObject({
      status: 'COMPLETED',
      input: {
        batchNumber: batch.batchNumber,
        quantity: 1,
        areaSqFt: 100,
      },
      output: { quantity: 4, areaSqFt: 90, finish: 'Polished', thicknessMm: 18 },
      waste: { areaSqFt: 10 },
      yieldBasis: 'AREA',
      yieldPercent: 90,
    });
    expect(String(completedJob.input.batchId)).toBe(batch._id);
    expect(completedJob.waste).not.toHaveProperty('quantity');

    const returnedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(returnedBatch).toMatchObject({
      status: 'AVAILABLE',
      finish: 'Polished',
      thicknessMm: 18,
      quantity: { receivedCount: 1, currentCount: 4 },
      area: { receivedSqFt: 100, availableSqFt: 90 },
    });
    expect(returnedBatch.activeProcessingJob).toBeNull();

    const processingLedger = await processingMovements(winner._id);
    expect(processingLedger.map(({ type }) => type)).toEqual(['PROCESSING_ISSUE', 'PROCESSING_RETURN']);
    expect(processingLedger[1]).toMatchObject({ quantityDelta: 4, areaDeltaSqFt: 90 });
    expect(1 + processingLedger.reduce((sum, movement) => sum + movement.quantityDelta, 0)).toBe(4);
    expect(100 + processingLedger.reduce((sum, movement) => sum + movement.areaDeltaSqFt, 0)).toBe(90);
    expect(processingLedger.every((movement) => String(movement.batch) === batch._id)).toBe(true);

    const persistedEvents = await ProcessingEvent.find({ job: winner._id }).sort({ occurredAt: 1, _id: 1 }).lean();
    const eventTypes = persistedEvents.map(({ type }) => type);
    expect(eventTypes.filter((type) => type === 'JOB_STARTED')).toHaveLength(1);
    expect(eventTypes.filter((type) => type === 'QC_RECORDED')).toHaveLength(3);
    expect(eventTypes.filter((type) => type === 'JOB_COMPLETED')).toHaveLength(1);
    expect(persistedEvents.find(({ type }) => type === 'JOB_COMPLETED')?.details?.verifiedOutput)
      .toMatchObject({ quantity: 4, areaSqFt: 90, finish: 'Polished', thicknessMm: 18 });
    expect(eventTypes).toEqual(expect.arrayContaining([
      'JOB_CREATED',
      'JOB_PLANNED',
      'OPERATION_STARTED',
      'OPERATION_COMPLETED',
    ]));

    const eventApi = await request(
      `/api/admin/processing/jobs/${winner._id}/events?page=1&limit=50`,
      { headers: authHeaders() },
    );
    expectStatus(eventApi, 200);
    expect(eventApi.body.total).toBe(persistedEvents.length);
    expect(eventApi.body.events.every((event) => event.job === winner._id)).toBe(true);

    const batchMovementApi = await request(
      `/api/admin/inventory/batches/${batch._id}/movements?page=1&limit=50`,
      { headers: authHeaders() },
    );
    expectStatus(batchMovementApi, 200);
    expect(batchMovementApi.body.movements.filter(({ type }) => type === 'PROCESSING_ISSUE')).toHaveLength(1);
    expect(batchMovementApi.body.movements.filter(({ type }) => type === 'PROCESSING_RETURN')).toHaveLength(1);

    const jobMovementApi = await request(
      `/api/admin/processing/jobs/${winner._id}/movements?page=1&limit=50`,
      { headers: authHeaders() },
    );
    expectStatus(jobMovementApi, 200);
    expect(jobMovementApi.body.total).toBe(2);
    expect(jobMovementApi.body.movements.map(({ type }) => type)).toEqual([
      'PROCESSING_ISSUE',
      'PROCESSING_RETURN',
    ]);
    expect(jobMovementApi.body.movements.every(
      (movement) => movement.relatedProcessingJobId === winner._id,
    )).toBe(true);
    expect(jobMovementApi.body.movements.every(
      (movement) => movement.batch?.batchNumber === batch.batchNumber,
    )).toBe(true);

    const unauthorizedMovements = await request(
      `/api/admin/processing/jobs/${winner._id}/movements`,
    );
    expectStatus(unauthorizedMovements, 401);
    const missingJobMovements = await request(
      '/api/admin/processing/jobs/507f1f77bcf86cd799439088/movements',
      { headers: authHeaders() },
    );
    expectStatus(missingJobMovements, 404);

    const finalSummary = await request('/api/admin/processing/summary', { headers: authHeaders() });
    expectStatus(finalSummary, 200);
    expect(finalSummary.body.summary).toMatchObject({
      plannedJobs: 1,
      inProgressJobs: 0,
      qcPendingJobs: 0,
      completedRecently: 1,
      materialInProcessing: { jobs: 0, quantity: 0, areaSqFt: null, areaTrackedJobs: 0 },
    });

    const inventorySummary = await request('/api/admin/inventory/summary', { headers: authHeaders() });
    expectStatus(inventorySummary, 200);
    const crmSummary = await request('/api/admin/crm/dashboard', { headers: authHeaders() });
    expectStatus(crmSummary, 200);
    const invoices = await request('/api/invoices?page=1&limit=1', { headers: authHeaders() });
    expectStatus(invoices, 200);
  }, 90_000);

  it('locks competing individual-slab jobs and returns only the QC-approved slab subset', async () => {
    const batch = await createBatch({ inventoryMode: 'INDIVIDUAL_SLAB', suffix: 'slab-concurrency' });
    const firstSlab = await createSlab(batch._id, 'SLAB-A');
    const secondSlab = await createSlab(batch._id, 'SLAB-B');
    const slabIds = [firstSlab._id, secondSlab._id];

    const first = await createPlannedJob({
      batchId: batch._id,
      inventoryMode: 'INDIVIDUAL_SLAB',
      slabIds,
      operations: ['HONING'],
      targetFinish: 'Honed',
      notes: 'First competing individual-slab job.',
    });
    const second = await createPlannedJob({
      batchId: batch._id,
      inventoryMode: 'INDIVIDUAL_SLAB',
      slabIds,
      operations: ['HONING'],
      targetFinish: 'Honed',
      notes: 'Second competing individual-slab job.',
    });

    const starts = await Promise.all([
      request(`/api/admin/processing/jobs/${first._id}/start`, jsonOptions('POST', {})),
      request(`/api/admin/processing/jobs/${second._id}/start`, jsonOptions('POST', {})),
    ]);
    expect(starts.map(({ response }) => response.status).sort((left, right) => left - right)).toEqual([200, 409]);
    const winner = starts.find(({ response }) => response.status === 200).body.job;
    const loserId = winner._id === first._id ? second._id : first._id;

    const lockedSlabs = await Slab.find({ _id: { $in: slabIds } }).sort({ slabNumber: 1 }).lean();
    expect(lockedSlabs).toHaveLength(2);
    expect(lockedSlabs.every((slab) => slab.status === 'IN_PROCESSING')).toBe(true);
    expect(lockedSlabs.every((slab) => String(slab.activeProcessingJob) === winner._id)).toBe(true);
    expect(await processingMovements(loserId, 'PROCESSING_ISSUE')).toHaveLength(0);

    const qcPending = await completeRouting(winner);
    const pass = await request(
      `/api/admin/processing/jobs/${winner._id}/qc`,
      jsonOptions('POST', {
        result: 'PASS',
        verifiedOutput: {
          quantity: 1,
          areaSqFt: 9,
          finish: 'Honed',
          thicknessMm: 18,
          slabOutputs: [{
            slabId: firstSlab._id,
            usableAreaSqFt: 9,
            dimensions: { lengthMm: 1000, widthMm: 929.0304 },
          }],
        },
      }),
    );
    expectStatus(pass, 200);
    expect(pass.body.job.status).toBe(qcPending.status);

    const completed = await request(
      `/api/admin/processing/jobs/${winner._id}/complete`,
      jsonOptions('POST', {}),
    );
    expectStatus(completed, 200);

    const returnedSlab = await Slab.findById(firstSlab._id).lean();
    const omittedSlab = await Slab.findById(secondSlab._id).lean();
    expect(returnedSlab).toMatchObject({
      status: 'AVAILABLE',
      finish: 'Honed',
      usableAreaSqFt: 9,
      dimensions: { lengthMm: 1000, widthMm: 929.0304, thicknessMm: 18 },
    });
    expect(returnedSlab.activeProcessingJob).toBeNull();
    expect(omittedSlab.status).toBe('DEPLETED');
    expect(omittedSlab.activeProcessingJob).toBeNull();

    const returnedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(returnedBatch).toMatchObject({
      inventoryMode: 'INDIVIDUAL_SLAB',
      status: 'AVAILABLE',
      quantity: { receivedCount: 2, currentCount: 1 },
      area: { availableSqFt: 9 },
    });

    const completedJob = await ProcessingJob.findById(winner._id).lean();
    expect(completedJob.input.slabSnapshots).toHaveLength(2);
    expect(completedJob.output.slabOutputs).toHaveLength(1);
    const outputSlab = completedJob.output.slabOutputs[0];
    expect(String(outputSlab.slabId)).toBe(firstSlab._id);
    expect(String(outputSlab.sourceSlabId)).toBe(firstSlab._id);
    expect(outputSlab).toMatchObject({
      slabNumber: firstSlab.slabNumber,
      grossAreaSqFt: 10,
      usableAreaSqFt: 9,
      finish: 'Honed',
      dimensions: { lengthMm: 1000, widthMm: 929.0304, thicknessMm: 18 },
      location: { warehouse: 'Phase 6 Test Yard', zone: 'E2E', rack: 'SLAB-A' },
    });
    expect(completedJob.waste).toMatchObject({ areaSqFt: 11 });
    expect(completedJob.waste).not.toHaveProperty('quantity');

    const completionEvent = await ProcessingEvent.findOne({
      job: winner._id,
      type: 'JOB_COMPLETED',
    }).lean();
    expect(completionEvent.details.verifiedOutput.slabOutputs[0]).toMatchObject({
      slabNumber: firstSlab.slabNumber,
      grossAreaSqFt: 10,
      usableAreaSqFt: 9,
      finish: 'Honed',
    });
    expect(String(completionEvent.details.verifiedOutput.slabOutputs[0].sourceSlabId))
      .toBe(firstSlab._id);

    const movements = await processingMovements(winner._id);
    expect(movements.filter(({ type }) => type === 'PROCESSING_ISSUE')).toHaveLength(2);
    expect(movements.filter(({ type }) => type === 'PROCESSING_RETURN')).toHaveLength(1);
    expect(movements.every((movement) => movement.slab && String(movement.batch) === batch._id)).toBe(true);
  }, 60_000);

  it('rolls back real start writes when the final processing event write fails', async () => {
    const batch = await createBatch({ receivedCount: 3, receivedSqFt: 30, suffix: 'start-rollback' });
    const job = await createPlannedJob({
      batchId: batch._id,
      operations: ['CALIBRATION'],
      notes: 'Start rollback fixture.',
    });
    const eventFailure = new Error('synthetic processing event failure');
    const faultingEventModel = { create: vi.fn().mockRejectedValue(eventFailure) };

    await expect(startProcessingJob({
      jobId: job._id,
      actor: 'authenticated-admin',
      connection: mongoose.connection,
      models: { ProcessingEventModel: faultingEventModel },
    })).rejects.toBe(eventFailure);
    expect(faultingEventModel.create).toHaveBeenCalledTimes(1);

    const persistedJob = await ProcessingJob.findById(job._id).lean();
    const persistedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(persistedJob.status).toBe('PLANNED');
    expect(persistedJob.startedAt).toBeUndefined();
    expect(persistedBatch).toMatchObject({
      status: 'AVAILABLE',
      quantity: { receivedCount: 3, currentCount: 3 },
      area: { receivedSqFt: 30, availableSqFt: 30 },
    });
    expect(persistedBatch.activeProcessingJob).toBeNull();
    expect(await processingMovements(job._id, 'PROCESSING_ISSUE')).toHaveLength(0);
    expect(await ProcessingEvent.countDocuments({ job: job._id, type: 'JOB_STARTED' })).toBe(0);
    expect(await ProcessingEvent.countDocuments({ job: job._id })).toBe(2);
  }, 60_000);

  it('rolls back real inventory return and job completion when the final event write fails', async () => {
    const batch = await createBatch({ receivedCount: 2, receivedSqFt: 20, suffix: 'completion-rollback' });
    const job = await createPlannedJob({
      batchId: batch._id,
      operations: ['EDGE_FINISH'],
      notes: 'Completion rollback fixture.',
    });
    const started = await request(`/api/admin/processing/jobs/${job._id}/start`, jsonOptions('POST', {}));
    expectStatus(started, 200);
    await completeRouting(started.body.job);
    const pass = await request(
      `/api/admin/processing/jobs/${job._id}/qc`,
      jsonOptions('POST', {
        result: 'PASS',
        verifiedOutput: { quantity: 2, areaSqFt: 18, finish: 'Edge finished', thicknessMm: 18 },
      }),
    );
    expectStatus(pass, 200);

    const eventFailure = new Error('synthetic completion event failure');
    const faultingEventModel = { create: vi.fn().mockRejectedValue(eventFailure) };
    await expect(completeProcessingJob({
      jobId: job._id,
      actor: 'authenticated-admin',
      connection: mongoose.connection,
      models: { ProcessingEventModel: faultingEventModel },
    })).rejects.toBe(eventFailure);
    expect(faultingEventModel.create).toHaveBeenCalledTimes(1);

    const persistedJob = await ProcessingJob.findById(job._id).lean();
    const persistedBatch = await InventoryBatch.findById(batch._id).lean();
    expect(persistedJob).toMatchObject({ status: 'QC_PENDING', qualityCheck: { result: 'PASS' } });
    expect(persistedJob.output).toBeUndefined();
    expect(persistedJob.completedAt).toBeUndefined();
    expect(persistedBatch).toMatchObject({
      status: 'IN_PROCESSING',
      quantity: { receivedCount: 2, currentCount: 0 },
      area: { receivedSqFt: 20, availableSqFt: 0 },
    });
    expect(String(persistedBatch.activeProcessingJob)).toBe(job._id);
    expect(await processingMovements(job._id, 'PROCESSING_ISSUE')).toHaveLength(1);
    expect(await processingMovements(job._id, 'PROCESSING_RETURN')).toHaveLength(0);
    expect(await ProcessingEvent.countDocuments({ job: job._id, type: 'JOB_COMPLETED' })).toBe(0);
  }, 60_000);
});
