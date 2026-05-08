import 'dotenv/config';
// Config is imported first — it throws immediately if required env vars are missing
import { PORT, CLIENT_URL } from './lib/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import recurringTasksRouter from './routes/recurringTasks';
import shoppingRouter from './routes/shopping';
import taskRoutes from './routes/tasks';
import shiftRoutes from './routes/shifts';
import incidentRoutes from './routes/incidents';
import calendarRoutes from './routes/calendar';

const app = express();
const httpServer = createServer(app);

const corsOptions = { origin: CLIENT_URL };

const io = new Server(httpServer, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Rate limiting on auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
app.use('/api/auth', authLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recurring-tasks', recurringTasksRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/shopping', shoppingRouter);
app.use('/api/incidents', incidentRoutes);
app.use('/api/calendar', calendarRoutes);

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

// Socket.io — real-time task updates
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-role', (role: string) => {
    socket.join(role);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Export for testing
export { app, io };

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
