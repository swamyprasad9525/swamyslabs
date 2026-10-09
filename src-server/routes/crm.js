import { Router } from 'express';
import { requireDatabase } from '../config/database.js';
import {
  createLeadActivity,
  convertLead,
  getCrmDashboard,
  getCustomer,
  getLead,
  getLeadSummary,
  listCustomers,
  listLeads,
  updateCustomer,
  updateLeadStage,
} from '../controllers/crmController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verifyAdmin, requireDatabase);

router.get('/crm/dashboard', getCrmDashboard);
router.get('/leads/summary', getLeadSummary);
router.get('/leads', listLeads);
router.get('/leads/:id', getLead);
router.patch('/leads/:id', updateLeadStage);
router.post('/leads/:id/activities', createLeadActivity);
router.post('/leads/:id/convert-to-customer', convertLead);

router.get('/customers', listCustomers);
router.get('/customers/:id', getCustomer);
router.patch('/customers/:id', updateCustomer);

export default router;

