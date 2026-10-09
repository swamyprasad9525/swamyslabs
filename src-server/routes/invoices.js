import { Router } from 'express';
import { verifyAdmin } from '../middleware/auth.js';
import { requireDatabase } from '../config/database.js';
import {
  createInvoice,
  listInvoices,
  getInvoice,
  exportInvoiceExcel,
} from '../controllers/invoiceController.js';

const router = Router();

// Authenticate before attempting a database connection.
router.use(verifyAdmin, requireDatabase);
router.get('/',          listInvoices);
router.post('/',         createInvoice);
router.get('/:id/excel', exportInvoiceExcel);
router.get('/:id',       getInvoice);

export default router;
