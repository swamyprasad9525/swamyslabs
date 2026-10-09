import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import { LEAD_SOURCES, LEAD_STAGES, TEMPORARY_ADMIN_ACTOR } from '../constants/crm.js';
import {
  CrmError,
  appendManualActivity,
  applyStageTransition,
  convertLeadToCustomer,
} from '../services/crmService.js';
import { escapeRegex } from '../utils/security.js';
import {
  parseCustomerListQuery,
  parseLeadListQuery,
  validateCustomerUpdate,
  validateLeadActivity,
  validateLeadStageUpdate,
} from '../utils/validation.js';

function dateFilter(from, to) {
  if (!from && !to) return undefined;
  const filter = {};
  if (from) filter.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const exclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    filter.$lt = exclusiveEnd;
  }
  return filter;
}

function buildLeadFilter({ search, stage, source, from, to }) {
  const filter = {};
  if (stage) filter.stage = stage;
  if (source) filter.source = source;
  const createdAt = dateFilter(from, to);
  if (createdAt) filter.createdAt = createdAt;
  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { leadNumber: { $regex: safeSearch, $options: 'i' } },
      { 'contact.name': { $regex: safeSearch, $options: 'i' } },
      { 'contact.company': { $regex: safeSearch, $options: 'i' } },
      { 'contact.email': { $regex: safeSearch, $options: 'i' } },
      { 'contact.phone': { $regex: safeSearch, $options: 'i' } },
      { 'materialContext.stoneName': { $regex: safeSearch, $options: 'i' } },
      { 'project.location': { $regex: safeSearch, $options: 'i' } },
    ];
  }
  return filter;
}

function zeroFilled(keys, groups) {
  const result = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const group of groups) {
    if (Object.hasOwn(result, group._id)) result[group._id] = group.count;
  }
  return result;
}

function handleControllerError(res, error, fallback) {
  if (error instanceof CrmError) return res.status(error.status).json({ error: error.message });
  if (error?.name === 'ValidationError') return res.status(400).json({ error: 'Invalid data.' });
  console.error(`${fallback}:`, error?.message || 'Unknown error');
  return res.status(500).json({ error: fallback });
}

export async function listLeads(req, res) {
  try {
    const parsed = parseLeadListQuery(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { page, limit, ...filters } = parsed.value;
    const filter = buildLeadFilter(filters);
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('leadNumber source stage contact.name contact.company project.location project.enteredArea materialContext estimatorContext.requiredAreaSqFt customer createdAt updatedAt'),
      Lead.countDocuments(filter),
    ]);
    return res.json({ leads, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch leads.');
  }
}

export async function getLeadSummary(req, res) {
  try {
    const [total, stages, sources] = await Promise.all([
      Lead.countDocuments({}),
      Lead.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
    ]);
    return res.json({
      summary: {
        total,
        byStage: zeroFilled(LEAD_STAGES, stages),
        bySource: zeroFilled(LEAD_SOURCES, sources),
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch CRM summary.');
  }
}

export async function getLead(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid lead ID.' });
    const lead = await Lead.findById(req.params.id)
      .select('-submissionId -__v')
      .populate('customer', 'customerNumber name company email phone');
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    return res.json({ lead });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch lead.');
  }
}

export async function updateLeadStage(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid lead ID.' });
    const validation = validateLeadStageUpdate(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    applyStageTransition(lead, validation.value.stage, {
      reason: validation.value.reason,
      actor: TEMPORARY_ADMIN_ACTOR,
    });
    await lead.save();
    return res.json({ lead });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to update lead.');
  }
}

export async function createLeadActivity(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid lead ID.' });
    const validation = validateLeadActivity(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    appendManualActivity(lead, validation.value.type, validation.value.note, {
      actor: TEMPORARY_ADMIN_ACTOR,
    });
    await lead.save();
    return res.status(201).json({ activity: lead.activities.at(-1), lead });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to record activity.');
  }
}

export async function convertLead(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid lead ID.' });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    const result = await convertLeadToCustomer({ lead });
    return res.status(result.duplicate ? 200 : 201).json({
      customer: result.customer,
      converted: !result.duplicate,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to convert lead.');
  }
}

export async function listCustomers(req, res) {
  try {
    const parsed = parseCustomerListQuery(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { page, limit, search } = parsed.value;
    const filter = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { customerNumber: { $regex: safeSearch, $options: 'i' } },
        { name: { $regex: safeSearch, $options: 'i' } },
        { company: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('customerNumber name company email phone sourceLead createdAt updatedAt'),
      Customer.countDocuments(filter),
    ]);
    return res.json({ customers, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch customers.');
  }
}

export async function getCustomer(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid customer ID.' });
    const customer = await Customer.findById(req.params.id)
      .select('-__v')
      .populate('sourceLead', 'leadNumber source stage project materialContext createdAt');
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    return res.json({ customer });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch customer.');
  }
}

export async function updateCustomer(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid customer ID.' });
    const validation = validateCustomerUpdate(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: validation.value },
      { new: true, runValidators: true },
    ).select('-__v');
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    return res.json({ customer });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to update customer.');
  }
}

export async function getCrmDashboard(req, res) {
  try {
    const [summary, sources, customers, invoices, recentLeads] = await Promise.all([
      Lead.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
      Customer.countDocuments({}),
      Invoice.countDocuments({}),
      Lead.find({})
        .sort({ updatedAt: -1 })
        .limit(6)
        .select('leadNumber source stage contact.name contact.company materialContext.stoneName createdAt updatedAt'),
    ]);
    const byStage = zeroFilled(LEAD_STAGES, summary);
    const totalLeads = Object.values(byStage).reduce((sum, count) => sum + count, 0);
    return res.json({
      metrics: {
        totalLeads,
        newLeads: byStage.NEW,
        qualifiedLeads: byStage.QUALIFIED + byStage.READY_FOR_QUOTATION,
        customers,
        invoices,
      },
      byStage,
      bySource: zeroFilled(LEAD_SOURCES, sources),
      recentLeads,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch dashboard.');
  }
}
