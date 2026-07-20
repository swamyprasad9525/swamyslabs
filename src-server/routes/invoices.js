import { Router } from 'express';
import { verifyAdmin } from '../middleware/auth.js';
import {
  createInvoice,
  listInvoices,
  getInvoice,
  exportInvoiceExcel,
} from '../controllers/invoiceController.js';

const router = Router();

// All invoice routes require admin auth
router.get('/',          verifyAdmin, listInvoices);
router.post('/',         verifyAdmin, createInvoice);
router.get('/:id/excel', verifyAdmin, exportInvoiceExcel);
router.get('/:id',       verifyAdmin, getInvoice);

export default router;
