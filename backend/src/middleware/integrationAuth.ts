import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export function integrationApiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"] ?? req.headers["X-Api-Key"];
  const value = Array.isArray(key) ? key[0] : key;
  if (!value || value !== env.INTEGRATION_API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
}
