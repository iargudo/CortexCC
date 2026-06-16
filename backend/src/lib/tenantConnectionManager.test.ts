import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDisconnect = vi.fn(async () => undefined);
const mockFindFirst = vi.fn();
const mockTenantClient = { $disconnect: mockDisconnect };

vi.mock("./masterPrisma.js", () => ({
  masterPrisma: {
    tenant: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => mockTenantClient),
}));

describe("tenantConnectionManager", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDisconnect.mockClear();
    mockFindFirst.mockReset();
  });

  it("evicts cached client when tenant is inactive", async () => {
    mockFindFirst.mockResolvedValueOnce({
      tenant_key: "local",
      display_name: "Local",
      database_host: "localhost",
      database_port: 5432,
      database_user: "u",
      database_password: "p",
      database_name: "db1",
      is_active: true,
    });
    const mod = await import("./tenantConnectionManager.js");
    await mod.ensureConnection("local");
    expect(mod.getTenantInfo("local")).toEqual({ key: "local", name: "Local" });

    mockFindFirst.mockResolvedValueOnce(null);
    await expect(mod.ensureConnection("local")).rejects.toMatchObject({ status: 404 });
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mod.getTenantInfo("local")).toBeNull();
  });

  it("recreates client when database credentials change", async () => {
    const baseTenant = {
      tenant_key: "local",
      display_name: "Local",
      database_host: "localhost",
      database_port: 5432,
      database_user: "u",
      database_password: "p",
      database_name: "db1",
      is_active: true,
    };
    mockFindFirst.mockResolvedValueOnce(baseTenant);
    const mod = await import("./tenantConnectionManager.js");
    await mod.ensureConnection("local");

    mockFindFirst.mockResolvedValueOnce({ ...baseTenant, database_name: "db2" });
    await mod.ensureConnection("local");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mod.getTenantInfo("local")).toEqual({ key: "local", name: "Local" });
  });
});
