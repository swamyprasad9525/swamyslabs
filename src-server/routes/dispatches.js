import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  cancelDispatchRecord,
  confirmDispatchRecord,
  createDispatchDraftRecord,
  getDispatchRecord,
  getDispatchSummaryMetricsRecord,
  getEligibleReservationsRecord,
  listDispatchRecords,
  markDispatchReadyRecord,
  updateDispatchDraftRecord,
} from '../controllers/dispatchController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/dispatches/summary', getDispatchSummaryMetricsRecord);
router.get('/dispatches/eligible-reservations/:salesOrderId', getEligibleReservationsRecord);
router.get('/dispatches', listDispatchRecords);
router.post('/dispatches/drafts', createDispatchDraftRecord);
router.get('/dispatches/:id', getDispatchRecord);
router.patch('/dispatches/:id/draft', updateDispatchDraftRecord);
router.post('/dispatches/:id/ready', markDispatchReadyRecord);
router.post('/dispatches/:id/confirm', confirmDispatchRecord);
router.post('/dispatches/:id/cancel', cancelDispatchRecord);

export default router;

