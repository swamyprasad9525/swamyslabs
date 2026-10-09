import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  adjustBatch,
  createBatch,
  createSlab,
  getBatch,
  inventorySummary,
  listBatches,
  listMovements,
  listSlabs,
  transferBatch,
  updateBatch,
  updateSlab,
} from '../controllers/inventoryController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/inventory/summary', inventorySummary);
router.get('/inventory/batches', listBatches);
router.post('/inventory/batches', createBatch);
router.get('/inventory/batches/:id', getBatch);
router.patch('/inventory/batches/:id', updateBatch);
router.post('/inventory/batches/:id/adjustments', adjustBatch);
router.post('/inventory/batches/:id/transfers', transferBatch);
router.get('/inventory/batches/:id/movements', listMovements);
router.post('/inventory/batches/:id/slabs', createSlab);
router.get('/inventory/batches/:id/slabs', listSlabs);
router.patch('/inventory/slabs/:id', updateSlab);

export default router;
