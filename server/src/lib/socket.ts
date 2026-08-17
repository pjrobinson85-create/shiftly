import type { Server as HttpServer } from 'http';
import { Server as IOServer } from 'socket.io';

let ioInstance: IOServer | null = null;

/**
 * Initialise socket.io on the HTTP server. Call once in index.ts.
 * Idempotent — returns the existing instance if already created.
 */
export function initSocket(httpServer: HttpServer, corsOrigin?: string): IOServer {
  if (ioInstance) return ioInstance;
  ioInstance = new IOServer(httpServer, {
    cors: corsOrigin ? { origin: corsOrigin } : undefined,
  });
  ioInstance.on('connection', (socket) => {
    socket.on('join-role', (role: string) => {
      socket.join(role);
    });
  });
  return ioInstance;
}

/**
 * Get the socket.io instance, or a no-op stub when it was never
 * initialised (e.g. unit tests that don't bring up the HTTP server).
 * Emissions on the stub are dropped silently.
 */
export function getSocket(): IOServer | { to: () => { emit: () => void }; emit: () => void } {
  if (ioInstance) return ioInstance;
  const noop = () => () => {};
  return { to: () => ({ emit: noop }), emit: noop };
}
