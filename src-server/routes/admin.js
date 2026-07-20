import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * POST /api/admin/login
 * Body: { password: string }
 * Returns: { token: string }  (JWT valid for 24 hours)
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD env var is not set!');
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token });
});

export default router;
