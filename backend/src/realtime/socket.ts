import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { ensureConnection } from "../lib/tenantConnectionManager.js";
import { runWithTenant } from "../lib/tenantContext.js";
import { getPrisma } from "../lib/prisma.js";
import { supervisorRoom, tenantLiveRoom } from "../lib/socketRooms.js";

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    path: env.SOCKETIO_PATH,
    cors: {
      origin: env.SOCKETIO_CORS_ORIGIN ?? env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string; tenantKey?: string };
      const token =
        auth?.token ??
        (typeof socket.handshake.query.token === "string" ? socket.handshake.query.token : undefined);
      const tenantKey =
        auth?.tenantKey ??
        (typeof socket.handshake.query.tenantKey === "string" ? socket.handshake.query.tenantKey : undefined);
      if (!token || !tenantKey) {
        return next(new Error("Unauthorized"));
      }
      const payload = verifyAccessToken(token);
      if (payload.tenantKey !== tenantKey) {
        return next(new Error("Tenant mismatch"));
      }
      const info = await ensureConnection(tenantKey);
      await runWithTenant(info.key, info.name, async () => {
        const user = await getPrisma().user.findUnique({
          where: { id: payload.sub },
          include: { roles: { include: { role: true } } },
        });
        if (!user) return next(new Error("Unauthorized"));
        // admin/supervisor (jefatura) y coordinator reciben eventos de supervisión;
        // el alcance por equipo se aplica al refetch en cada endpoint.
        const isSupervisor = user.roles.some(
          (ur) =>
            ur.role.name === "admin" || ur.role.name === "supervisor" || ur.role.name === "coordinator"
        );
        socket.data.userId = user.id;
        socket.data.tenantKey = tenantKey;
        socket.data.tenantName = info.name;
        socket.data.isSupervisor = isSupervisor;
        return next();
      });
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const tenantKey = socket.data.tenantKey as string;
    const tenantName = (socket.data.tenantName as string) || tenantKey;
    const isSupervisor = Boolean(socket.data.isSupervisor);
    socket.join(`tenant:${tenantKey}:user:${userId}`);
    socket.join(tenantLiveRoom(tenantKey));
    if (isSupervisor) {
      socket.join(supervisorRoom(tenantKey));
    }

    socket.on("agent:set_status", async (payload: { status: string }) => {
      await runWithTenant(tenantKey, tenantName, async () => {
        await ensureConnection(tenantKey);
        await getPrisma().user.update({
          where: { id: userId },
          data: { status: payload.status as never, status_since: new Date() },
        });
        io.to(tenantLiveRoom(tenantKey)).emit("agent:status_changed", {
          userId,
          status: payload.status,
          tenantKey,
        });
      });
    });

    socket.on("conversation:join", (payload: { conversationId: string }) => {
      socket.join(`tenant:${tenantKey}:conversation:${payload.conversationId}`);
    });

    socket.on("conversation:leave", (payload: { conversationId: string }) => {
      socket.leave(`tenant:${tenantKey}:conversation:${payload.conversationId}`);
    });

    socket.on("agent:join_queues", (payload: { queueIds: string[] }) => {
      for (const q of payload.queueIds ?? []) {
        socket.join(`tenant:${tenantKey}:queue:${q}`);
      }
    });
  });

  const webchat = io.of("/webchat");
  webchat.on("connection", (socket) => {
    socket.emit("webchat:ready", { socketId: socket.id });
  });

  return io;
}
