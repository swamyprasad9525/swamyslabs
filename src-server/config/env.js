const PRODUCTION_REQUIRED = [
  'MONGODB_URI',
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'EMAIL_USER',
  'EMAIL_PASS',
];

export function validateEnvironment(env = process.env) {
  const missing = PRODUCTION_REQUIRED.filter((key) => !env[key]?.trim());

  if (missing.length === 0) return;

  const messages = missing.map((key) => `Missing required environment variable: ${key}`);
  if (env.NODE_ENV === 'production') {
    throw new Error(messages.join('\n'));
  }

  messages.forEach((message) => console.warn(message));
}

export function getAllowedOrigins(env = process.env) {
  const configured = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '';
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.NODE_ENV !== 'production') {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  return new Set(origins);
}
