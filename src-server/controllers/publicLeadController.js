import crypto from 'node:crypto';
import { connectDB } from '../config/database.js';
import { sendLeadNotification } from '../services/emailService.js';
import { persistLeadSubmission, publicLeadResponse } from '../services/crmService.js';
import { validateAndNormalizeUpload } from '../utils/security.js';
import { validatePublicCallback, validatePublicEnquiry } from '../utils/validation.js';

async function persistAndRespond(req, res, validation, attachment = null) {
  if (validation.error) return res.status(400).json({ error: validation.error });
  const payload = {
    ...validation.value,
    submissionId: validation.value.submissionId || crypto.randomUUID(),
  };

  try {
    await connectDB();
  } catch (error) {
    console.error('Database connection unavailable:', error?.message || 'Unknown error');
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const result = await persistLeadSubmission({
    payload,
    attachment,
    notify: sendLeadNotification,
  });

  if (result.notificationFailed) {
    console.warn(`Lead notification failed after persistence: ${result.lead.leadNumber}`);
  }

  return res.status(result.duplicate ? 200 : 201).json(publicLeadResponse(result.lead));
}

export async function submitEnquiryLead(req, res) {
  try {
    const validation = validatePublicEnquiry(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });

    const upload = validateAndNormalizeUpload(req.file);
    if (upload.error) return res.status(400).json({ error: upload.error });
    return await persistAndRespond(req, res, validation, upload.file);
  } catch (error) {
    console.error('Enquiry persistence error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: 'Failed to process enquiry.' });
  }
}

export async function submitCallbackLead(req, res) {
  try {
    return await persistAndRespond(req, res, validatePublicCallback(req.body));
  } catch (error) {
    console.error('Callback persistence error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: 'Failed to process request.' });
  }
}
