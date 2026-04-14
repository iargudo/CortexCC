import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { buildApiRouter } from "./routes/api.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  const api = buildApiRouter(app);
  app.use(env.API_PREFIX, api);
  app.use(errorHandler);
  return app;
}
