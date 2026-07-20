import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config, listCorsOrigins } from '../config/server';
import { sessionService } from './session.service';
import { organizationService } from './organization.service';
import logger from '../config/logger';

class RealtimeHub {
  private io: Server | null = null;

  initialize(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: listCorsOrigins(),
        credentials: true,
      },
      path: '/socket.io',
    });

    try {
      const pub = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      });
      const sub = pub.duplicate();
      this.io.adapter(createAdapter(pub, sub));
    } catch (err) {
      logger.warn('Socket.io Redis adapter unavailable, using in-memory', { err });
    }

    this.io.use(async (socket, next) => {
      try {
        const token =
          (socket.handshake.auth?.token as string) ||
          (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!token) return next(new Error('UNAUTHORIZED'));
        const session = await sessionService.getSessionWithUser(token);
        if (!session?.user) return next(new Error('UNAUTHORIZED'));
        (socket.data as any).userId = session.user.id;
        next();
      } catch (err) {
        next(err as Error);
      }
    });

    this.io.on('connection', (socket: Socket) => {
      socket.on('join_org', async (orgId: string) => {
        const userId = (socket.data as any).userId as string;
        const membership = await organizationService.getMembership(userId, orgId);
        if (!membership) return;
        socket.join(`org:${orgId}`);
      });
    });

    logger.info('Realtime hub initialized');
  }

  emitRequest(orgId: string, payload: Record<string, unknown>) {
    this.io?.to(`org:${orgId}`).emit('request:new', payload);
  }

  close() {
    this.io?.close();
    this.io = null;
  }
}

export const realtimeHub = new RealtimeHub();
