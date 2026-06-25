import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3030),
  API_PREFIX: z.string().default("/api"),
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  MASTER_DATABASE_URL: z.string(),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  REDIS_URL: z.string().default("redis://localhost:6379/2"),
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
  ENABLE_JOBS: z
    .string()
    .optional()
    .transform((s) => s !== "false" && s !== "0"),
  SOCKETIO_PATH: z.string().default("/socket.io"),
  SOCKETIO_CORS_ORIGIN: z.string().optional(),
  INTEGRATION_API_KEY: z.string().min(8),
  BUSINESS_TIMEZONE: z.string().default("America/Guayaquil"),
  STORAGE_PROVIDER: z.enum(["local", "s3", "azure"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("uploads"),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default("attachments"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV !== "test") {
    process.exit(1);
  }
}

export const env = parsed.success
  ? parsed.data
  : {
      NODE_ENV: "test" as const,
      PORT: 3030,
      API_PREFIX: "/api",
      CORS_ORIGIN: "http://localhost:8080",
      MASTER_DATABASE_URL:
        process.env.MASTER_DATABASE_URL ?? "postgresql://test:test@localhost:5432/cortexcc_master",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "test-secret-32-chars-minimum-length!!",
      JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-minimum!!",
      JWT_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "30d",
      REDIS_URL: "redis://localhost:6379/15",
      QUEUE_CONCURRENCY: 1,
      ENABLE_JOBS: false,
      SOCKETIO_PATH: "/socket.io",
      SOCKETIO_CORS_ORIGIN: undefined,
      INTEGRATION_API_KEY: "test-integration-key-123456",
      BUSINESS_TIMEZONE: "America/Guayaquil",
      STORAGE_PROVIDER: "local" as const,
      STORAGE_LOCAL_DIR: "uploads",
      AWS_S3_BUCKET: undefined,
      AWS_S3_REGION: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      AZURE_STORAGE_CONNECTION_STRING: undefined,
      AZURE_STORAGE_CONTAINER: "attachments",
    };
