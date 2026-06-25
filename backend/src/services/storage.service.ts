import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async upload(key: string, data: Buffer, _contentType: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return `/api/files/${encodeURIComponent(key)}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/api/files/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.unlink(filePath).catch(() => undefined);
  }

  resolvePath(key: string): string {
    return path.join(this.baseDir, key);
  }
}

class S3StorageProvider implements StorageProvider {
  async upload(_key: string, _data: Buffer, _contentType: string): Promise<string> {
    throw new Error("S3 storage provider requires @aws-sdk/client-s3. Install it and configure AWS_S3_BUCKET.");
  }
  async getSignedUrl(_key: string): Promise<string> {
    throw new Error("S3 storage provider not configured");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("S3 storage provider not configured");
  }
}

class AzureStorageProvider implements StorageProvider {
  async upload(_key: string, _data: Buffer, _contentType: string): Promise<string> {
    throw new Error("Azure storage provider requires @azure/storage-blob. Install it and configure AZURE_STORAGE_CONNECTION_STRING.");
  }
  async getSignedUrl(_key: string): Promise<string> {
    throw new Error("Azure storage provider not configured");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("Azure storage provider not configured");
  }
}

let _instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (_instance) return _instance;

  switch (env.STORAGE_PROVIDER) {
    case "s3":
      _instance = new S3StorageProvider();
      break;
    case "azure":
      _instance = new AzureStorageProvider();
      break;
    case "local":
    default:
      _instance = new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
      break;
  }
  return _instance;
}

export function getLocalStorage(): LocalStorageProvider | null {
  const provider = getStorage();
  if (provider instanceof LocalStorageProvider) return provider;
  return null;
}
