import { Redis } from "ioredis";
import { env } from "../config/env.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

export async function assignLock(conversationId: string, ttlSeconds = 5): Promise<boolean> {
  const r = getRedis();
  const key = `lock:assign:${conversationId}`;
  const res = await r.set(key, "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}

export async function releaseAssignLock(conversationId: string): Promise<void> {
  await getRedis().del(`lock:assign:${conversationId}`);
}
