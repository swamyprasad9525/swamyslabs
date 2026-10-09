import nodemailer from 'nodemailer';
import { escapeHtml } from '../utils/security.js';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

function row(label, value) {
  if (value === '' || value === null || value === undefined) return '';
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

export async function sendLeadNotification({ lead, attachment }) {
  const values = typeof lead.toObject === 'function' ? lead.toObject() : lead;
  const contact = values.contact || {};
  const project = values.project || {};
  const material = values.materialContext || {};
  const estimate = values.estimatorContext || {};
  const selections = values.materialSelections || [];

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #000; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">New website lead</h2>
      ${row('Reference', values.leadNumber)}
      ${row('Source', values.source)}
      ${row('Customer', contact.name)}
      ${row('Company', contact.company)}
      ${row('Email', contact.email)}
      ${row('Phone', contact.phone)}
      ${row('Project location', project.location)}
      ${row('Preferred contact time', project.preferredContactTime)}
      ${row('Stone', material.stoneName)}
      ${row('Stone ID', material.stoneId)}
      ${row('Stone slug', material.stoneSlug)}
      ${row('Material', material.materialFamily)}
      ${row('Finish', material.finish)}
      ${row('Thickness', material.thickness)}
      ${row('Application', material.application)}
      ${row('Quantity', material.quantity)}
      ${row('Entered project size', project.enteredArea)}
      ${row('Project area (sq.ft)', estimate.projectAreaSqFt)}
      ${row('Planning allowance (%)', estimate.planningAllowancePercent)}
      ${row('Required area (sq.ft)', estimate.requiredAreaSqFt)}
      ${row('Estimated slabs', estimate.estimatedSlabs)}
      ${row('Indicative material estimate', estimate.indicativeMaterialEstimate)}
      ${row('Source page', project.sourcePage)}
      ${selections.length ? `<p><strong>Selected materials:</strong></p><ul>${selections.map((item) => `<li>${escapeHtml(item.stoneName)}${item.quantity ? ` — quantity ${escapeHtml(item.quantity)}` : ''}${item.finish ? ` — ${escapeHtml(item.finish)}` : ''}${item.thickness ? ` — ${escapeHtml(item.thickness)}` : ''}</li>`).join('')}</ul>` : ''}
      ${project.message ? `<p><strong>Project notes:</strong></p><p style="background:#f9f9f9;padding:10px;white-space:pre-line;">${escapeHtml(project.message)}</p>` : ''}
      ${attachment ? '<p><strong>Attachment included.</strong></p>' : ''}
      <p style="font-size:12px;color:#888;">The CRM record was saved before this notification was attempted.</p>
    </div>`;

  return getTransporter().sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `New website lead ${values.leadNumber}`,
    html,
    attachments: attachment ? [{
      filename: attachment.originalname,
      content: attachment.buffer,
      contentType: attachment.mimetype,
    }] : [],
  });
}
