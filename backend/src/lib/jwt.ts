import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { env } from "../config/env.js";

export interface AccessPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: AccessPayload): string {
  const opts = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessPayload;
  return decoded;
}

export function signRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
