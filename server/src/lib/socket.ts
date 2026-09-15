import type { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config';

let ioInstance: IOServer | null = null;

interface AuthSocket extends Socket {
  data: {
    authenticated: boolean;
    role?: string;
    authTimer?: NodeJS.Timeout;
  };
}

// Grace window for a client to present a valid token after connecting
// (covers reconnects that raced ahead of a token refresh).
const AUTH_TIMEOUT_MS = parseInt(
  process.env.SOCKET_AUTH_TIMEOUT_MS || '10000',
  10
);

/**
 * Verify a JWT using the same secret as the HTTP API.
 * Returns the decoded payload, or null if missing/invalid/expired.
 */
export function verifySocketToken(token: unknown): { id: string; role: string } | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id?: string; role?: string };
    if (!decoded.id || !decoded.role) return null;
    return { id: decoded.id, role: decoded.role };
  } catch {
    return null;
  }
}

/**
 * Mark a socket as authenticated for a role and grant it membership of
 * exactly that role's room. Idempotent; leaves any stale room.
 */
function applyAuth(socket: AuthSocket, payload: { id: string; role: string }) {
  if (socket.data.authTimer) {
    clearTimeout(socket.data.authTimer);
    socket.data.authTimer = undefined;
  }
  if (socket.data.role && socket.data.role !== payload.role) {
    socket.leave(socket.data.role);
  }
  socket.data.authenticated = true;
  socket.data.role = payload.role;
  socket.join(payload.role);
  socket.emit('auth:ok', { role: payload.role });
}

/**
 * Present a token to an already-open socket (late/refreshed auth).
 * Invalid tokens do NOT disconnect immediately — the client may be holding
 * a stale access token and about to refresh; the grace timer below is the
 * backstop.
 */
function attemptAuth(socket: AuthSocket, token: unknown) {
  const payload = verifySocketToken(token);
  if (payload) {
    applyAuth(socket, payload);
    return;
  }
  if (socket.data.authenticated && socket.data.role) {
    socket.leave(socket.data.role);
  }
  socket.data.authenticated = false;
  socket.data.role = undefined;
  scheduleAuthTimeout(socket);
  socket.emit('auth:rejected', { reason: 'invalid' });
}

function scheduleAuthTimeout(socket: AuthSocket) {
  if (socket.data.authenticated || socket.data.authTimer) return;
  socket.data.authTimer = setTimeout(() => {
    socket.data.authTimer = undefined;
    if (!socket.data.authenticated) {
      socket.emit('auth:rejected', { reason: 'timeout' });
      socket.disconnect(true);
    }
  }, AUTH_TIMEOUT_MS);
  socket.data.authTimer.unref?.();
}

/**
 * Initialise socket.io on the HTTP server. Call once in index.ts.
 * Idempotent — returns the existing instance if already created.
 *
 * Security model:
 *  - A socket is useless until it presents a valid API access token, via
 *    the handshake (`auth.token`) or a `socket:auth` event.
 *  - Until authenticated it cannot join any room and is disconnected after
 *    a short grace window (`auth:rejected { reason: 'timeout' }`).
 *  - Once authenticated it may only ever join the room matching the role
 *    encoded in its token; `join-role` with anything else is ignored.
 */
export function initSocket(httpServer: HttpServer, corsOrigin?: string): IOServer {
  if (ioInstance) return ioInstance;
  ioInstance = new IOServer(httpServer, {
    cors: corsOrigin ? { origin: corsOrigin } : undefined,
  });

  ioInstance.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthSocket;
    socket.data.authenticated = false;

    const handshakeToken = socket.handshake.auth?.token;
    if (typeof handshakeToken === 'string' && handshakeToken) {
      const payload = verifySocketToken(handshakeToken);
      if (payload) {
        applyAuth(socket, payload);
      } else {
        scheduleAuthTimeout(socket);
        socket.emit('auth:rejected', { reason: 'invalid' });
      }
    } else {
      scheduleAuthTimeout(socket);
    }

    socket.on('socket:auth', (token: unknown) => {
      attemptAuth(socket, token);
    });

    // Only grant room membership that matches the authenticated role.
    socket.on('join-role', (role: unknown) => {
      if (
        socket.data.authenticated &&
        typeof role === 'string' &&
        role === socket.data.role
      ) {
        socket.join(role);
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.authTimer) clearTimeout(socket.data.authTimer);
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
  return { to: () => ({ emit: noop }), emit: noop } as never;
}
