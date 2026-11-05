import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import { publicStoneAvailability } from '../controllers/inventoryController.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/stones/:slug/availability', requireDatabase, publicStoneAvailability);

export default router;
