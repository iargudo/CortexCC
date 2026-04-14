import { io, type Socket } from "socket.io-client";
import { ACCESS_TOKEN_KEY, getSocketPath, getWsOrigin } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;
  if (!socket || socket.disconnected) {
    socket = io(getWsOrigin(), {
      path: getSocketPath(),
      auth: { token },
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function reconnectSocket(): void {
  disconnectSocket();
  getSocket();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
