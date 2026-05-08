import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import recurringTaskRoutes from './routes/recurring-tasks';
import taskRoutes from './routes/tasks';
import shiftRoutes from './routes/shifts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recurring-tasks', recurringTaskRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/shifts', shiftRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io — real-time task updates
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join role-based room for targeted broadcasts
  socket.on('join-role', (role: string) => {
    socket.join(role);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Export io for use in route handlers
export { io };

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
