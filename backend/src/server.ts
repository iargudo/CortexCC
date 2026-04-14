import http from "http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./realtime/socket.js";

const app = createApp();
const server = http.createServer(app);
const io = initSocket(server);
app.set("io", io);

if (env.ENABLE_JOBS) {
  const { startWorkers } = await import("./workers/index.js");
  startWorkers(io);
}

server.listen(env.PORT, () => {
  console.log(`API ${env.API_PREFIX} on port ${env.PORT}`);
});
