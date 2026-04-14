import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

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
      const token =
        (socket.handshake.auth as { token?: string })?.token ??
        (typeof socket.handshake.query.token === "string" ? socket.handshake.query.token : undefined);
      if (!token) {
        return next(new Error("Unauthorized"));
      }
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("agent:set_status", async (payload: { status: string }) => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: payload.status as never, status_since: new Date() },
      });
      io.emit("agent:status_changed", { userId, status: payload.status });
    });

    socket.on("conversation:join", (payload: { conversationId: string }) => {
      socket.join(`conversation:${payload.conversationId}`);
    });

    socket.on("conversation:leave", (payload: { conversationId: string }) => {
      socket.leave(`conversation:${payload.conversationId}`);
    });

    socket.on("agent:join_queues", (payload: { queueIds: string[] }) => {
      for (const q of payload.queueIds ?? []) {
        socket.join(`queue:${q}`);
      }
    });
  });

  const webchat = io.of("/webchat");
  webchat.on("connection", (socket) => {
    socket.emit("webchat:ready", { socketId: socket.id });
  });

  return io;
}
