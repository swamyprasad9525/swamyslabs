import { describe, expect, it, vi } from 'vitest';
import {
  CrmError,
  appendManualActivity,
  applyStageTransition,
  buildLeadDocument,
  convertLeadToCustomer,
  formatReferenceNumber,
  nextReferenceNumber,
  persistLeadSubmission,
  publicLeadResponse,
} from './crmService.js';
import {
  parseLeadListQuery,
  validateCustomerUpdate,
  validatePublicCallback,
  validatePublicEnquiry,
} from '../utils/validation.js';

const validEnquiry = (overrides = {}) => ({
  submissionId: '5ad4a789-5f5e-4e6b-8921-ecf42d39a84a',
  source: 'PROJECT_PLANNER',
  customerName: 'Ravi Kumar',
  email: 'ravi@example.com',
  phoneNumber: '+919876543210',
  productName: 'Example Stone',
  productId: 'SS-001',
  productSlug: 'example-stone',
  productUrl: '/project-planner?stone=example-stone',
  materialType: 'Limestone',
  selectedFinish: 'Honed',
  thickness: '20 mm',
  quantity: '1320 sq.ft',
  application: 'Outdoor flooring',
  projectAreaSqFt: '1200',
  planningAllowancePercent: '10',
  requiredAreaSqFt: '1320',
  estimatedSlabs: '12',
  indicativeMaterialEstimate: '250000',
  ...overrides,
});

const payload = {
  submissionId: '5ad4a789-5f5e-4e6b-8921-ecf42d39a84a',
  source: 'STONE_ENQUIRY',
  contact: { name: 'Ravi', email: 'ravi@example.com', phone: '+919876543210' },
  project: { message: 'Need samples' },
  materialContext: { stoneName: 'Example Stone', quantity: '100 sq.ft' },
  estimatorContext: {},
};

function fakeCounter(sequence = 1) {
  return { findOneAndUpdate: vi.fn().mockResolvedValue({ seq: sequence }) };
}

function fakeLead(overrides = {}) {
  return {
    _id: 'lead-1',
    stage: 'NEW',
    contact: { name: 'Ravi', phone: '+919876543210', email: 'ravi@example.com' },
    stageHistory: [],
    activities: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CRM reference numbering', () => {
  it('formats a padded lead reference', () => {
    expect(formatReferenceNumber('LD', new Date('2026-05-01T00:00:00Z'), 42)).toBe('LD-2026-0042');
  });

  it('uses the India business year at a UTC year boundary', () => {
    expect(formatReferenceNumber('LD', new Date('2025-12-31T20:00:00Z'), 1)).toBe('LD-2026-0001');
  });

  it('allocates a namespaced sequence atomically', async () => {
    const CounterModel = fakeCounter(17);
    const value = await nextReferenceNumber('CU', new Date('2026-08-01T00:00:00Z'), CounterModel);
    expect(value).toBe('CU-2026-0017');
    expect(CounterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'cu_2026' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
  });
});

describe('Lead snapshots and public response', () => {
  it('forces a new public lead into NEW regardless of extra payload fields', () => {
    const document = buildLeadDocument({ ...payload, stage: 'QUALIFIED', internalNotes: 'not allowed' }, null, 'LD-2026-0001');
    expect(document.stage).toBe('NEW');
    expect(document).not.toHaveProperty('internalNotes');
  });

  it('stores only attachment metadata, not bytes', () => {
    const document = buildLeadDocument(payload, {
      originalname: 'drawing.pdf', mimetype: 'application/pdf', size: 120, buffer: Buffer.from('private'),
    }, 'LD-2026-0001');
    expect(document.attachment).toEqual({ filename: 'drawing.pdf', mimeType: 'application/pdf', size: 120 });
    expect(document.attachment).not.toHaveProperty('buffer');
  });

  it('returns only a safe public message and human reference', () => {
    expect(publicLeadResponse({ leadNumber: 'LD-2026-0007', _id: 'secret', stage: 'NEW' })).toEqual({
      message: 'Request received successfully.',
      reference: 'LD-2026-0007',
    });
  });
});

describe('Lead persistence and idempotency', () => {
  it('returns an existing submission without sending another notification', async () => {
    const existing = { _id: 'lead-existing', leadNumber: 'LD-2026-0002' };
    const LeadModel = { findOne: vi.fn().mockResolvedValue(existing) };
    const notify = vi.fn();
    const result = await persistLeadSubmission({ payload, LeadModel, CounterModel: fakeCounter(), notify });
    expect(result).toMatchObject({ lead: existing, duplicate: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('persists before notification and records SENT', async () => {
    const events = [];
    const created = { _id: 'lead-new', leadNumber: 'LD-2026-0001' };
    const LeadModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(async () => { events.push('persist'); return created; }),
      updateOne: vi.fn(async () => { events.push('status'); }),
    };
    const notify = vi.fn(async () => { events.push('notify'); });
    const result = await persistLeadSubmission({ payload, LeadModel, CounterModel: fakeCounter(), notify });
    expect(events).toEqual(['persist', 'notify', 'status']);
    expect(result.duplicate).toBe(false);
    expect(created.notification.emailStatus).toBe('SENT');
  });

  it('keeps the durable lead successful when email delivery fails', async () => {
    const created = { _id: 'lead-new', leadNumber: 'LD-2026-0001' };
    const LeadModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
      updateOne: vi.fn().mockResolvedValue(undefined),
    };
    const result = await persistLeadSubmission({
      payload,
      LeadModel,
      CounterModel: fakeCounter(),
      notify: vi.fn().mockRejectedValue(new Error('SMTP unavailable')),
    });
    expect(result.notificationFailed).toBe(true);
    expect(result.lead).toBe(created);
    expect(created.notification.emailStatus).toBe('FAILED');
  });

  it('does not lose a persisted lead when notification status cannot be updated', async () => {
    const created = { _id: 'lead-new', leadNumber: 'LD-2026-0001' };
    const LeadModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
      updateOne: vi.fn().mockRejectedValue(new Error('write failed')),
    };
    await expect(persistLeadSubmission({
      payload, LeadModel, CounterModel: fakeCounter(), notify: vi.fn(),
    })).resolves.toMatchObject({ lead: created, duplicate: false });
  });

  it('recovers an idempotent duplicate-key race', async () => {
    const existing = { _id: 'lead-existing', leadNumber: 'LD-2026-0009' };
    const LeadModel = {
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      create: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
    };
    const result = await persistLeadSubmission({ payload, LeadModel, CounterModel: fakeCounter() });
    expect(result).toMatchObject({ lead: existing, duplicate: true });
  });
});

describe('CRM stage and activity rules', () => {
  it('records a valid sequential stage change', () => {
    const lead = fakeLead();
    applyStageTransition(lead, 'CONTACTED', { now: new Date('2026-01-01T00:00:00Z') });
    expect(lead.stage).toBe('CONTACTED');
    expect(lead.stageHistory[0]).toMatchObject({ from: 'NEW', to: 'CONTACTED' });
    expect(lead.activities[0].type).toBe('STAGE_CHANGE');
  });

  it('rejects skipping directly from NEW to QUALIFIED', () => {
    expect(() => applyStageTransition(fakeLead(), 'QUALIFIED')).toThrow(CrmError);
  });

  it('requires a reason when a lead is lost', () => {
    expect(() => applyStageTransition(fakeLead(), 'LOST')).toThrow(/reason is required/i);
  });

  it('records the lost reason in history and the lead', () => {
    const lead = fakeLead();
    applyStageTransition(lead, 'LOST', { reason: 'Project cancelled' });
    expect(lead.lostReason).toBe('Project cancelled');
    expect(lead.stageHistory[0].reason).toBe('Project cancelled');
  });

  it('adds a bounded manual CRM activity', () => {
    const lead = fakeLead();
    appendManualActivity(lead, 'CALL', 'Discussed sample requirements');
    expect(lead.activities[0]).toMatchObject({ type: 'CALL', note: 'Discussed sample requirements' });
  });

  it('prevents an admin from manually creating SYSTEM activity', () => {
    expect(() => appendManualActivity(fakeLead(), 'SYSTEM', 'Forged')).toThrow(/Invalid activity type/);
  });
});

describe('Lead to customer conversion', () => {
  it('rejects conversion before qualification', async () => {
    const CustomerModel = { findOne: vi.fn().mockResolvedValue(null) };
    await expect(convertLeadToCustomer({ lead: fakeLead(), CustomerModel })).rejects.toMatchObject({ status: 409 });
  });

  it('copies approved contact fields and links the lead', async () => {
    const lead = fakeLead({
      stage: 'QUALIFIED',
      contact: { name: 'Ravi', company: 'Example Projects', email: 'ravi@example.com', phone: '+919876543210' },
      project: { location: 'Project site, not a billing address' },
    });
    const customer = { _id: 'customer-1', customerNumber: 'CU-2026-0001' };
    const CustomerModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(customer),
    };
    const result = await convertLeadToCustomer({ lead, CustomerModel, CounterModel: fakeCounter() });
    expect(result.customer).toBe(customer);
    expect(CustomerModel.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ravi', company: 'Example Projects', email: 'ravi@example.com', phone: '+919876543210', sourceLead: 'lead-1',
    }));
    expect(CustomerModel.create.mock.calls[0][0]).not.toHaveProperty('billingAddress');
    expect(lead.customer).toBe('customer-1');
    expect(lead.save).toHaveBeenCalledOnce();
  });

  it('returns the already linked customer without creating a duplicate', async () => {
    const existing = { _id: 'customer-1', customerNumber: 'CU-2026-0001' };
    const CustomerModel = { findById: vi.fn().mockResolvedValue(existing), findOne: vi.fn() };
    const result = await convertLeadToCustomer({ lead: fakeLead({ stage: 'LOST', customer: 'customer-1' }), CustomerModel });
    expect(result).toEqual({ customer: existing, duplicate: true });
    expect(CustomerModel.findOne).not.toHaveBeenCalled();
  });
});

describe('CRM request validation', () => {
  it('normalizes structured planner numbers', () => {
    const result = validatePublicEnquiry(validEnquiry());
    expect(result.value.estimatorContext).toEqual({
      projectAreaSqFt: 1200,
      planningAllowancePercent: 10,
      requiredAreaSqFt: 1320,
      estimatedSlabs: 12,
      indicativeMaterialEstimate: 250000,
    });
    expect(result.value.materialContext.application).toBe('Outdoor flooring');
  });

  it('rejects public attempts to set internal lead state', () => {
    expect(validatePublicEnquiry(validEnquiry({ stage: 'QUALIFIED' })).error).toMatch(/Unsupported/);
  });

  it('validates and preserves a bounded Project Selection snapshot', () => {
    const result = validatePublicEnquiry(validEnquiry({
      source: 'PROJECT_SELECTION',
      materialSelections: JSON.stringify([{ stoneId: 'SS-1', stoneSlug: 'one', stoneName: 'Stone One', quantity: 2 }]),
    }));
    expect(result.value.materialSelections).toEqual([expect.objectContaining({ stoneName: 'Stone One', quantity: 2 })]);
  });

  it('requires email identity for a contact-form lead', () => {
    const result = validatePublicCallback({
      source: 'CONTACT', customerName: 'Ravi', phoneNumber: '+919876543210', productName: 'General Inquiry - Contact Form',
    });
    expect(result.error).toMatch(/email/);
  });

  it('enforces bounded lead pagination and controlled filters', () => {
    expect(parseLeadListQuery({ page: '1', limit: '100', stage: 'NEW', source: 'CONTACT' }).value.limit).toBe(100);
    expect(parseLeadListQuery({ page: '0', limit: '101' }).error).toMatch(/between 1 and 100/);
    expect(parseLeadListQuery({ stage: 'ARBITRARY' }).error).toBe('Invalid lead stage.');
  });

  it('prevents customer relationship fields from being patched', () => {
    expect(validateCustomerUpdate({ sourceLead: 'other-lead' }).error).toMatch(/Unsupported/);
  });
});

