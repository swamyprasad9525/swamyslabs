import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { validateAdminLogin } from '../utils/validation.js';

const router = Router();

/**
 * POST /api/admin/login
 * Body: { password: string }
 * Returns: { token: string }  (JWT valid for 24 hours)
 */
router.post('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const validated = validateAdminLogin(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { password } = validated.value;

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD env var is not set!');
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );

  res.json({ token });
});

export default router;
