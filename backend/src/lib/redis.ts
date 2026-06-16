import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { getCurrentTenantKey } from "./tenantContext.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

function assignLockKey(conversationId: string): string {
  const tenantKey = getCurrentTenantKey();
  return `lock:assign:${tenantKey}:${conversationId}`;
}

export async function assignLock(conversationId: string, ttlSeconds = 5): Promise<boolean> {
  const r = getRedis();
  const key = assignLockKey(conversationId);
  const res = await r.set(key, "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}

export async function releaseAssignLock(conversationId: string): Promise<void> {
  await getRedis().del(assignLockKey(conversationId));
}
