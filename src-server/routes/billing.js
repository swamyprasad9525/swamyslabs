import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  createInvoiceDraftRecord,
  getEligibleSalesOrdersRecord,
  getInvoiceRecord,
  getSellerTaxProfileRecord,
  issueInvoiceRecord,
  listInvoiceRecordsV2,
  updateInvoiceDraftRecord,
  updateSellerTaxProfileRecord,
  voidInvoiceRecord,
} from '../controllers/invoiceController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/invoices/tax-profile', getSellerTaxProfileRecord);
router.patch('/invoices/tax-profile', updateSellerTaxProfileRecord);
router.get('/invoices/eligible-orders', getEligibleSalesOrdersRecord);
router.get('/invoices', listInvoiceRecordsV2);
router.post('/invoices/drafts', createInvoiceDraftRecord);
router.patch('/invoices/:id/draft', updateInvoiceDraftRecord);
router.post('/invoices/:id/issue', issueInvoiceRecord);
router.post('/invoices/:id/void', voidInvoiceRecord);
router.get('/invoices/:id', getInvoiceRecord);

export default router;

