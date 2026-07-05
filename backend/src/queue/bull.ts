import { Queue, Worker, type JobsOptions } from "bullmq";
import { env } from "../config/env.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";

const connection = { url: env.REDIS_URL };

export const routingQueue = new Queue("routing", { connection });
export const slaCheckQueue = new Queue("sla-check", { connection });
export const overflowCheckQueue = new Queue("overflow-check", { connection });
export const outboundMessagesQueue = new Queue("outbound-messages", { connection });
export const dialerProgressiveQueue = new Queue("dialer-progressive", { connection });
export const dialerPredictiveQueue = new Queue("dialer-predictive", { connection });
export const recordingUploadQueue = new Queue("recording-upload", { connection });

function withTenantKey<T extends Record<string, unknown>>(data: T): T & { tenantKey: string } {
  return { ...data, tenantKey: getCurrentTenantKey() };
}

export async function enqueueRouting(
  data: { conversationId: string },
  opts?: JobsOptions
): Promise<void> {
  await routingQueue.add("route", withTenantKey(data), {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    ...opts,
  });
}

export async function enqueueSlaCheck(
  data: { conversationId: string; queueId: string },
  opts?: JobsOptions
): Promise<void> {
  await slaCheckQueue.add(
    "check",
    withTenantKey(data),
    { delay: 10_000, attempts: 5, backoff: { type: "fixed", delay: 10_000 }, ...opts }
  );
}

export async function enqueueOverflowCheck(
  data: { conversationId: string; queueId: string },
  opts?: JobsOptions
): Promise<void> {
  await overflowCheckQueue.add("check", withTenantKey(data), {
    delay: 10_000,
    attempts: 3,
    backoff: { type: "fixed", delay: 10_000 },
    ...opts,
  });
}

export async function enqueueOutbound(data: { messageId: string }, opts?: JobsOptions): Promise<void> {
  await outboundMessagesQueue.add("send", withTenantKey(data), {
    attempts: 4,
    backoff: { type: "exponential", delay: 3000 },
    ...opts,
  });
}

export async function enqueueDialerProgressive(
  data: { campaignId: string },
  opts?: JobsOptions
): Promise<void> {
  await dialerProgressiveQueue.add("tick", withTenantKey(data), {
    attempts: 2,
    ...opts,
  });
}

export async function enqueueDialerPredictive(
  data: { campaignId: string },
  opts?: JobsOptions
): Promise<void> {
  await dialerPredictiveQueue.add("tick", withTenantKey(data), {
    attempts: 2,
    ...opts,
  });
}

export async function enqueueRecordingUpload(
  data: { recordingName: string; conversationId?: string; channelConfigId?: string },
  opts?: JobsOptions
): Promise<void> {
  await recordingUploadQueue.add("upload", withTenantKey(data), {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    delay: 2000,
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

export function createOverflowWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "overflow-check",
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

export function createDialerProgressiveWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "dialer-progressive",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: 2 }
  );
}

export function createDialerPredictiveWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "dialer-predictive",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: 2 }
  );
}

export function createRecordingUploadWorker(process: WorkerProcessor): Worker {
  return new Worker(
    "recording-upload",
    async (job) => {
      await process(job as { data: Record<string, unknown> });
    },
    { connection, concurrency: 2 }
  );
}
