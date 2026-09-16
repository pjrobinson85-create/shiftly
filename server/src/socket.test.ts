import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './lib/config';
import { initSocket, verifySocketToken } from './lib/socket';

// The singleton server-side IO instance (created by initSocket above).
import type { Server as IOServer } from 'socket.io';
let io: IOServer;

function clientRooms(clientId: string): Set<string> {
  return new Set(
    [...(io.sockets.sockets.get(clientId)?.rooms ?? [])].filter((r) => r !== clientId)
  );
}

function makeToken(role: 'FAMILY' | 'WORKER', id = 'test-user') {
  return jwt.sign({ id, username: role.toLowerCase(), role }, JWT_SECRET, {
    expiresIn: '6h',
  });
}

function connect(port: number, opts: { auth?: { token?: string } } = {}): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
    ...opts,
  });
}

function waitFor<T = unknown>(socket: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

describe('Socket auth', () => {
  let httpServer: HttpServer;
  let port = 0;
  const clients: ClientSocket[] = [];

  function track(s: ClientSocket) {
    clients.push(s);
    return s;
  }

  beforeAll(async () => {
    // Do NOT import ./index here: this test worker's module graph is
    // isolated, so the initSocket call below creates a fresh instance
    // bound to our own (listening) http server.
    httpServer = createServer();
    io = initSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('verifySocketToken rejects missing/invalid tokens', () => {
    expect(verifySocketToken(undefined)).toBeNull();
    expect(verifySocketToken('')).toBeNull();
    expect(verifySocketToken('not-a-jwt')).toBeNull();
    expect(verifySocketToken('a.b.c')).toBeNull();
  });

  it('verifySocketToken accepts a valid token and returns id+role', () => {
    const t = makeToken('FAMILY', 'u42');
    expect(verifySocketToken(t)).toEqual({ id: 'u42', role: 'FAMILY' });
  });

  it('authenticates on handshake token and grants the role room', async () => {
    const c = track(connect(port, { auth: { token: makeToken('FAMILY', 'u1') } }));
    // auth:ok is emitted during the connection handshake — register before connect resolves.
    const okP = waitFor<{ role: string }>(c, 'auth:ok');
    await connected(c);
    const ok = await okP;
    expect(ok.role).toBe('FAMILY');
    expect(clientRooms(c.id!).has('FAMILY')).toBe(true);
    c.disconnect();
  });

  it('rejects an invalid handshake token (auth:rejected invalid)', async () => {
    const c = track(connect(port, { auth: { token: 'garbage' } }));
    const rejP = waitFor<{ reason: string }>(c, 'auth:rejected');
    await connected(c);
    const rej = await rejP;
    expect(rej.reason).toBe('invalid');
    c.disconnect();
  });

  it('lets an untokened socket auth later via socket:auth', async () => {
    const c = track(connect(port));
    const okP = waitFor<{ role: string }>(c, 'auth:ok');
    await connected(c);
    c.emit('socket:auth', makeToken('WORKER', 'u2'));
    const ok = await okP;
    expect(ok.role).toBe('WORKER');
    expect(clientRooms(c.id!).has('WORKER')).toBe(true);
    c.disconnect();
  });

  it('does NOT let a WORKER join the FAMILY room via join-role', async () => {
    const c = track(connect(port, { auth: { token: makeToken('WORKER', 'u3') } }));
    const okP = waitFor<{ role: string }>(c, 'auth:ok');
    await connected(c);
    await okP;
    c.emit('join-role', 'FAMILY'); // must be ignored
    await new Promise((r) => setTimeout(r, 100));
    expect(clientRooms(c.id!).has('FAMILY')).toBe(false);
    expect(clientRooms(c.id!).has('WORKER')).toBe(true);
    c.disconnect();
  });

  it('lets an authenticated socket re-join its own role room', async () => {
    const c = track(connect(port, { auth: { token: makeToken('FAMILY', 'u4') } }));
    const okP = waitFor<{ role: string }>(c, 'auth:ok');
    await connected(c);
    await okP;
    c.emit('join-role', 'FAMILY');
    await new Promise((r) => setTimeout(r, 100));
    expect(clientRooms(c.id!).has('FAMILY')).toBe(true);
    c.disconnect();
  });
});
