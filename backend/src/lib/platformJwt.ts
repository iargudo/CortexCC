import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface PlatformAccessPayload {
  sub: string;
  email: string;
  scope: "platform";
}

export function signPlatformAccessToken(payload: Omit<PlatformAccessPayload, "scope">): string {
  const opts = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign({ ...payload, scope: "platform" }, env.PLATFORM_JWT_SECRET, opts);
}

export function verifyPlatformAccessToken(token: string): PlatformAccessPayload {
  const decoded = jwt.verify(token, env.PLATFORM_JWT_SECRET) as PlatformAccessPayload;
  if (decoded.scope !== "platform") {
    throw new Error("Invalid platform token scope");
  }
  return decoded;
}
