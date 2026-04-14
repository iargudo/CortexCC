import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "./errorHandler.js";

export interface AuthUserPayload {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  status: string;
  max_concurrent: number;
  roles: { name: string; permissions: unknown }[];
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUserPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.authUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      status: user.status,
      max_concurrent: user.max_concurrent,
      roles: user.roles.map((ur) => ({ name: ur.role.name, permissions: ur.role.permissions })),
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (user) {
      req.authUser = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        status: user.status,
        max_concurrent: user.max_concurrent,
        roles: user.roles.map((ur) => ({ name: ur.role.name, permissions: ur.role.permissions })),
      };
    }
  } catch {
    /* ignore invalid optional token */
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser) {
    throw new HttpError(401, "Unauthorized");
  }
  next();
}
