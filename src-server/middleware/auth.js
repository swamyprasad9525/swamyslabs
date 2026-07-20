import jwt from 'jsonwebtoken';

/**
 * Express middleware — verifies the admin JWT.
 * Expects: Authorization: Bearer <token>
 * Attaches req.admin = { role: 'admin' } on success.
 */
export function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access only.' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
}
