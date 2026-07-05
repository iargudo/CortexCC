import type { NextFunction, Request, Response } from "express";
import { getPlatformAdminById, verifyPlatformToken } from "../services/platform/platformAuth.service.js";
import { HttpError } from "./errorHandler.js";

export interface PlatformAdminPayload {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin";
}

declare global {
  namespace Express {
    interface Request {
      platformAdmin?: PlatformAdminPayload;
    }
  }
}

export async function platformAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    const payload = verifyPlatformToken(token);
    const admin = await getPlatformAdminById(payload.sub);
    req.platformAdmin = {
      id: admin.id,
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      role: "admin",
    };
    return next();
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.platformAdmin) {
    throw new HttpError(401, "Unauthorized");
  }
  next();
}
