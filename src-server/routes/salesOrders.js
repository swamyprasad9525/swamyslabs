import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  cancelSalesOrderRecord,
  createSalesOrderReservation,
  getSalesOrderAvailability,
  getSalesOrderRecord,
  getSalesOrderReservableSlabs,
  linkProcessingJob,
  listSalesOrderRecords,
  releaseSalesOrderReservation,
  salesOrderSummary,
  unlinkProcessingJob,
  updateSalesOrderRecord,
} from '../controllers/salesOrderController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/sales-orders/summary', salesOrderSummary);
router.get('/sales-orders', listSalesOrderRecords);
router.post('/sales-orders/:id/cancel', cancelSalesOrderRecord);
router.get('/sales-orders/:id/availability', getSalesOrderAvailability);
router.get('/sales-orders/:id/availability/:batchId/slabs', getSalesOrderReservableSlabs);
router.post('/sales-orders/:id/reservations', createSalesOrderReservation);
router.post('/sales-orders/:id/reservations/:reservationId/release', releaseSalesOrderReservation);
router.post('/sales-orders/:id/processing-links', linkProcessingJob);
router.delete('/sales-orders/:id/processing-links/:processingJobId', unlinkProcessingJob);
router.get('/sales-orders/:id', getSalesOrderRecord);
router.patch('/sales-orders/:id', updateSalesOrderRecord);

export default router;
