import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

export function attachRealtime(app: FastifyInstance): Server {
  const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const io = new Server(app.server, {
    cors: {
      origin: allowedOrigin,
    },
    transports: ["websocket"],
  });

  io.on("connection", (socket) => {
    socket.emit("server.ready", {
      connectionId: socket.id,
      timestamp: new Date().toISOString(),
    });
  });

  return io;
}
