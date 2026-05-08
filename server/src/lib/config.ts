// Central config — validates required env vars at startup so misconfiguration
// fails immediately with a clear error rather than silently misbehaving at runtime.

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. ' +
    'Add it to your .env file. See .env.example for reference.'
  );
}

export const JWT_SECRET = process.env.JWT_SECRET;

export const PORT = parseInt(process.env.PORT || '3000', 10);

export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

export const NODE_ENV = process.env.NODE_ENV || 'development';

// JWT token expiry — 7 days gives shift workers a comfortable window
// without forcing them to re-login mid-shift.
export const JWT_EXPIRES_IN = '7d';
