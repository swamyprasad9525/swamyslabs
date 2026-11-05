import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  acceptQuotationRecord,
  cancelQuotationRecord,
  convertQuotationRecord,
  createQuotationRecord,
  expireQuotationRecord,
  getQuotationRecord,
  issueQuotationRecord,
  listQuotationRecords,
  quotationSummary,
  rejectQuotationRecord,
  reviseQuotationRecord,
  updateQuotationRecord,
} from '../controllers/quotationController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/quotations/summary', quotationSummary);
router.get('/quotations', listQuotationRecords);
router.post('/quotations', createQuotationRecord);
router.post('/quotations/:id/issue', issueQuotationRecord);
router.post('/quotations/:id/accept', acceptQuotationRecord);
router.post('/quotations/:id/reject', rejectQuotationRecord);
router.post('/quotations/:id/expire', expireQuotationRecord);
router.post('/quotations/:id/cancel', cancelQuotationRecord);
router.post('/quotations/:id/revise', reviseQuotationRecord);
router.post('/quotations/:id/convert-to-sales-order', convertQuotationRecord);
router.get('/quotations/:id', getQuotationRecord);
router.patch('/quotations/:id', updateQuotationRecord);

export default router;
