import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server;
let baseUrl;

beforeAll(async () => {
  process.env.VERCEL = '1';
  const { default: app } = await import('./server.js');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('backend smoke checks', () => {
  it('returns a minimal health response', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('rejects an unknown browser origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
    expect(response.status).toBe(403);
  });

  it('validates login bodies and disables response caching', async () => {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rate limits repeated admin login attempts', async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: `incorrect-${attempt}` }),
      });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });

  it('rejects SVG content before attempting email delivery', async () => {
    const form = new FormData();
    form.set('customerName', 'Test Customer');
    form.set('email', 'test@example.com');
    form.set('phoneNumber', '+919999999999');
    form.set('productName', 'Test Stone');
    form.set('quantity', '10 sq.ft');
    form.set('file', new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'test.svg');

    const response = await fetch(`${baseUrl}/api/send-enquiry`, { method: 'POST', body: form });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Invalid file type/);
  });

  it('requires authentication before CRM database access', async () => {
    const leads = await fetch(`${baseUrl}/api/admin/leads`);
    const customers = await fetch(`${baseUrl}/api/admin/customers`);
    expect(leads.status).toBe(401);
    expect(customers.status).toBe(401);
    expect(leads.headers.get('cache-control')).toBe('no-store');
  });

  it('requires authentication before inventory reads and writes', async () => {
    const summary = await fetch(`${baseUrl}/api/admin/inventory/summary`);
    const create = await fetch(`${baseUrl}/api/admin/inventory/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(summary.status).toBe(401);
    expect(create.status).toBe(401);
    expect(summary.headers.get('cache-control')).toBe('no-store');
    expect(create.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects public attempts to set administrative lead fields before database access', async () => {
    const form = new FormData();
    form.set('submissionId', '5ad4a789-5f5e-4e6b-8921-ecf42d39a84a');
    form.set('source', 'STONE_ENQUIRY');
    form.set('customerName', 'Test Customer');
    form.set('email', 'test@example.com');
    form.set('phoneNumber', '+919999999999');
    form.set('productName', 'Test Stone');
    form.set('quantity', '10 sq.ft');
    form.set('stage', 'QUALIFIED');

    const response = await fetch(`${baseUrl}/api/leads`, { method: 'POST', body: form });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unsupported public submission field.' });
  });
});
