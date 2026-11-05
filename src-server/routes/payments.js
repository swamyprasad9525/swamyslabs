import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  confirmPaymentRecord,
  createPaymentRecord,
  getPaymentRecord,
  getPaymentSummaryMetricsRecord,
  listPaymentRecords,
  rejectPaymentRecord,
  reversePaymentRecord,
} from '../controllers/paymentController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/payments/summary', getPaymentSummaryMetricsRecord);
router.get('/payments', listPaymentRecords);
router.post('/payments', createPaymentRecord);
router.get('/payments/:id', getPaymentRecord);
router.post('/payments/:id/confirm', confirmPaymentRecord);
router.post('/payments/:id/reject', rejectPaymentRecord);
router.post('/payments/:id/reverse', reversePaymentRecord);

export default router;

