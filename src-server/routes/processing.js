import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  addNote,
  cancelJob,
  completeJob,
  completeOperation,
  createJob,
  getJob,
  listEvents,
  listMovements,
  listJobs,
  planJob,
  processingSummary,
  recordQualityCheck,
  startJob,
  startOperation,
  updateJob,
} from '../controllers/processingController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/processing/summary', processingSummary);
router.get('/processing/jobs', listJobs);
router.post('/processing/jobs', createJob);
router.get('/processing/jobs/:id/events', listEvents);
router.get('/processing/jobs/:id/movements', listMovements);
router.post('/processing/jobs/:id/plan', planJob);
router.post('/processing/jobs/:id/start', startJob);
router.post('/processing/jobs/:id/cancel', cancelJob);
router.post('/processing/jobs/:id/notes', addNote);
router.post('/processing/jobs/:id/operations/:operationId/start', startOperation);
router.post('/processing/jobs/:id/operations/:operationId/complete', completeOperation);
router.post('/processing/jobs/:id/qc', recordQualityCheck);
router.post('/processing/jobs/:id/complete', completeJob);
router.get('/processing/jobs/:id', getJob);
router.patch('/processing/jobs/:id', updateJob);

export default router;
