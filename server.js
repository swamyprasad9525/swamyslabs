import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import invoicesRouter from './src-server/routes/invoices.js';
import adminRouter from './src-server/routes/admin.js';
import crmRouter from './src-server/routes/crm.js';
import inventoryRouter from './src-server/routes/inventory.js';
import { validateEnvironment, getAllowedOrigins } from './src-server/config/env.js';
import { connectDB, databaseStatus } from './src-server/config/database.js';
import { submitCallbackLead, submitEnquiryLead } from './src-server/controllers/publicLeadController.js';

dotenv.config();
validateEnvironment();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());

const allowedOrigins = getAllowedOrigins();
app.use((req, res, next) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : req.protocol;
  const sameOrigin = `${protocol}://${req.get('host')}`;

  return cors({
    origin(origin, callback) {
      if (!origin || origin === sameOrigin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })(req, res, next);
});

app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// New canonical CRM submission route plus temporary compatibility adapters.
app.post('/api/leads', noStore, apiLimiter, upload.single('file'), submitEnquiryLead);
app.post('/api/send-enquiry', noStore, apiLimiter, upload.single('file'), submitEnquiryLead);
app.post('/api/request-callback', noStore, apiLimiter, submitCallbackLead);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: databaseStatus() });
});

app.use('/api/invoices', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, invoicesRouter);
app.use('/api/admin/login', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, adminLoginLimiter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', crmRouter);
app.use('/api/admin', inventoryRouter);

app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size too large. Maximum limit is 5MB.' });
    return res.status(400).json({ error: 'Invalid upload.' });
  }
  if (err?.message === 'Origin not allowed by CORS.') return res.status(403).json({ error: 'Origin not allowed.' });
  console.error('Unhandled Express error:', err?.message || 'Unknown error');
  return res.status(500).json({ error: 'An internal server error occurred.' });
});

if (!process.env.VERCEL) {
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch((error) => {
      console.error('Server startup failed:', error.message);
      process.exitCode = 1;
    });
}

export default app;
