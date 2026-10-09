import crypto from 'node:crypto';
import Counter from '../models/Counter.js';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import {
  MANUAL_ACTIVITY_TYPES,
  SYSTEM_ACTOR,
  TEMPORARY_ADMIN_ACTOR,
  isAllowedStageTransition,
} from '../constants/crm.js';

export class CrmError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CrmError';
    this.status = status;
  }
}

export function formatReferenceNumber(prefix, date, sequence) {
  const indiaTime = new Date(new Date(date).getTime() + (330 * 60 * 1000));
  const year = indiaTime.getUTCFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

export async function nextReferenceNumber(prefix, date = new Date(), CounterModel = Counter) {
  const indiaTime = new Date(new Date(date).getTime() + (330 * 60 * 1000));
  const year = indiaTime.getUTCFullYear();
  const key = `${prefix.toLowerCase()}_${year}`;
  const counter = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return formatReferenceNumber(prefix, date, counter.seq);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== '' && entry !== null && entry !== undefined),
  );
}

export function buildLeadDocument(payload, attachment, leadNumber, now = new Date()) {
  const attachmentMetadata = attachment ? {
    filename: attachment.originalname,
    mimeType: attachment.mimetype,
    size: attachment.size,
  } : undefined;

  return {
    leadNumber,
    submissionId: payload.submissionId || crypto.randomUUID(),
    source: payload.source,
    stage: 'NEW',
    contact: compactObject(payload.contact),
    project: compactObject(payload.project || {}),
    materialContext: compactObject(payload.materialContext || {}),
    materialSelections: payload.materialSelections?.length ? payload.materialSelections : undefined,
    estimatorContext: compactObject(payload.estimatorContext || {}),
    attachment: attachmentMetadata,
    notification: { emailStatus: 'PENDING' },
    stageHistory: [{ to: 'NEW', actor: SYSTEM_ACTOR, changedAt: now }],
    activities: [{
      type: 'SYSTEM',
      note: 'Lead created from a website submission.',
      actor: SYSTEM_ACTOR,
      createdAt: now,
    }],
  };
}

async function findExistingSubmission(LeadModel, submissionId) {
  if (!submissionId) return null;
  return LeadModel.findOne({ submissionId });
}

export async function persistLeadSubmission({
  payload,
  attachment,
  notify,
  now = new Date(),
  LeadModel = Lead,
  CounterModel = Counter,
}) {
  const existing = await findExistingSubmission(LeadModel, payload.submissionId);
  if (existing) return { lead: existing, duplicate: true, notificationFailed: false };

  const leadNumber = await nextReferenceNumber('LD', now, CounterModel);
  let lead;

  try {
    lead = await LeadModel.create(buildLeadDocument(payload, attachment, leadNumber, now));
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicate = await findExistingSubmission(LeadModel, payload.submissionId);
    if (!duplicate) throw error;
    return { lead: duplicate, duplicate: true, notificationFailed: false };
  }

  let emailStatus = 'SENT';
  let notificationFailed = false;
  try {
    if (typeof notify === 'function') await notify({ lead, attachment });
    else emailStatus = 'NOT_CONFIGURED';
  } catch {
    emailStatus = 'FAILED';
    notificationFailed = true;
  }

  try {
    await LeadModel.updateOne(
      { _id: lead._id },
      { $set: { notification: { emailStatus, attemptedAt: now } } },
    );
    lead.notification = { emailStatus, attemptedAt: now };
  } catch {
    // The lead is already durable. A notification-status write must never turn
    // a successfully persisted request into a failure response.
  }

  return { lead, duplicate: false, notificationFailed };
}

export function applyStageTransition(
  lead,
  nextStage,
  { reason = '', actor = TEMPORARY_ADMIN_ACTOR, now = new Date() } = {},
) {
  const currentStage = lead.stage;
  if (!isAllowedStageTransition(currentStage, nextStage)) {
    throw new CrmError(`Lead cannot move from ${currentStage} to ${nextStage}.`, 409);
  }
  if (nextStage === 'LOST' && !String(reason).trim()) {
    throw new CrmError('A reason is required when marking a lead as lost.', 400);
  }

  const cleanReason = String(reason).trim();
  lead.stage = nextStage;
  if (nextStage === 'LOST') lead.lostReason = cleanReason;
  lead.stageHistory.push({
    from: currentStage,
    to: nextStage,
    reason: cleanReason || undefined,
    actor,
    changedAt: now,
  });
  lead.activities.push({
    type: 'STAGE_CHANGE',
    note: cleanReason
      ? `Stage changed from ${currentStage} to ${nextStage}. Reason: ${cleanReason}`
      : `Stage changed from ${currentStage} to ${nextStage}.`,
    actor,
    createdAt: now,
  });
  return lead;
}

export function appendManualActivity(
  lead,
  type,
  note,
  { actor = TEMPORARY_ADMIN_ACTOR, now = new Date() } = {},
) {
  if (!MANUAL_ACTIVITY_TYPES.includes(type)) {
    throw new CrmError('Invalid activity type.', 400);
  }
  const cleanNote = String(note || '').trim();
  if (!cleanNote) throw new CrmError('Activity notes are required.', 400);
  lead.activities.push({ type, note: cleanNote, actor, createdAt: now });
  return lead;
}

export async function convertLeadToCustomer({
  lead,
  now = new Date(),
  CustomerModel = Customer,
  CounterModel = Counter,
  actor = TEMPORARY_ADMIN_ACTOR,
}) {
  if (lead.customer) {
    const existingById = await CustomerModel.findById(lead.customer);
    if (existingById) return { customer: existingById, duplicate: true };
  }

  const existing = await CustomerModel.findOne({ sourceLead: lead._id });
  if (existing) {
    if (!lead.customer) {
      lead.customer = existing._id;
      lead.convertedAt = lead.convertedAt || now;
      await lead.save();
    }
    return { customer: existing, duplicate: true };
  }

  if (!['QUALIFIED', 'READY_FOR_QUOTATION'].includes(lead.stage)) {
    throw new CrmError('Only qualified leads can be converted to customers.', 409);
  }
  if (!lead.contact?.name || !lead.contact?.phone) {
    throw new CrmError('A customer name and phone number are required before conversion.', 400);
  }

  const customerNumber = await nextReferenceNumber('CU', now, CounterModel);
  let customer;
  try {
    customer = await CustomerModel.create({
      customerNumber,
      name: lead.contact.name,
      company: lead.contact.company || undefined,
      email: lead.contact.email || undefined,
      phone: lead.contact.phone,
      sourceLead: lead._id,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    customer = await CustomerModel.findOne({ sourceLead: lead._id });
    if (!customer) throw error;
  }

  lead.customer = customer._id;
  lead.convertedAt = now;
  lead.activities.push({
    type: 'SYSTEM',
    note: `Converted to customer ${customer.customerNumber}.`,
    actor,
    createdAt: now,
  });
  await lead.save();

  return { customer, duplicate: false };
}

export function publicLeadResponse(lead) {
  return {
    message: 'Request received successfully.',
    reference: lead.leadNumber,
  };
}
