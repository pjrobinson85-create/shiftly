import 'dotenv/config';
// Config is imported first — it throws immediately if required env vars are missing
import { PORT, CLIENT_URL, NODE_ENV } from './lib/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import recurringTasksRouter from './routes/recurring-tasks';
import shoppingRouter from './routes/shopping';
import taskRoutes from './routes/tasks';
import shiftRoutes from './routes/shifts';
import incidentRoutes from './routes/incidents';
import calendarRoutes from './routes/calendar';
import uploadRoutes from './routes/uploads';
import exportRoutes from './routes/export';
import userRoutes from './routes/users';
import careProfileRoutes from './routes/care-profile';
import { initSocket } from './lib/socket';

const app = express();
const httpServer = createServer(app);

const corsOptions = { origin: CLIENT_URL };
const io = initSocket(httpServer, CLIENT_URL);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Rate limiting (disabled in test so the suite isn't throttled)
const isTest = NODE_ENV === 'test';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Only guard the credential endpoints (login/register/refresh). The session
  // check (GET /me) runs on every navigation and must never be throttled —
  // 429-ing it makes the client drop the token and log the user out.
  skip: (req) => isTest || req.method !== 'POST',
  message: { error: 'Too many attempts, please try again later' },
});
app.use('/api/auth', authLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many requests, slow down a little' },
});
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recurring-tasks', recurringTasksRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/shopping', shoppingRouter);
app.use('/api/incidents', incidentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/care-profile', careProfileRoutes);

// Uploaded photos — served statically (uploaded dir is 0700 + authed upload route)
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler — must be the last middleware registered.
// Catches any error passed via next(err) or thrown in async routes
// that aren't caught by their own try/catch.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export for testing
export { app, io };

// Only listen when run directly (not when imported by tests)
if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
