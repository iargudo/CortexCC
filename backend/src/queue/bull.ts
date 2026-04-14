import { Queue, Worker, type JobsOptions } from "bullmq";
import { env } from "../config/env.js";

const connection = { url: env.REDIS_URL };

export const routingQueue = new Queue("routing", { connection });
export const slaCheckQueue = new Queue("sla-check", { connection });
export const outboundMessagesQueue = new Queue("outbound-messages", { connection });

export async function enqueueRouting(
  data: { conversationId: string },
  opts?: JobsOptions
): Promise<void> {
  await routingQueue.add("route", data, { attempts: 3, backoff: { type: "exponential", delay: 2000 }, ...opts });
}

export async function enqueueSlaCheck(
  data: { conversationId: string; queueId: string },
  opts?: JobsOptions
): Promise<void> {
  await slaCheckQueue.add(
    "check",
    data,
    { delay: 10_000, attempts: 5, backoff: { type: "fixed", delay: 10_000 }, ...opts }
  );
}

export async function enqueueOutbound(data: { messageId: string }, opts?: JobsOptions): Promise<void> {
  await outboundMessagesQueue.add("send", data, {
    attempts: 4,
    backoff: { type: "exponential", delay: 3000 },
    ...opts,
  });
}

export { connection };

export type WorkerProcessor = (job: { data: Record<string, unknown> }) => Promise<void>;

export function createRoutingWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "routing",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: env.QUEUE_CONCURRENCY }
  );
}

export function createSlaWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "sla-check",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: env.QUEUE_CONCURRENCY }
  );
}

export function createOutboundWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "outbound-messages",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: env.QUEUE_CONCURRENCY }
  );
}
