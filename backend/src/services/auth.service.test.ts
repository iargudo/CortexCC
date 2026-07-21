import { describe, expect, it } from "vitest";
import { toAuthUserResponse } from "./auth.service.js";

describe("toAuthUserResponse", () => {
  it("maps admin user with merged permissions", () => {
    const out = toAuthUserResponse({
      id: "u1",
      first_name: "Admin",
      last_name: "User",
      email: "admin@test.local",
      avatar_url: null,
      status: "ONLINE",
      max_concurrent: 5,
      roles: [
        {
          role: {
            name: "admin",
            permissions: { inbox: true, settings: true, supervisor: true },
          },
        },
      ],
    });

    expect(out.role).toBe("admin");
    expect(out.name).toBe("Admin User");
    expect(out.permissions).toEqual({
      inbox: true,
      dashboard: true,
      supervisor: true,
      quality: true,
      reports: true,
      contacts: true,
      settings: true,
    });
  });

  it("picks supervisor over agent when multiple roles exist", () => {
    const out = toAuthUserResponse({
      id: "u2",
      first_name: "Sup",
      last_name: "Ervisor",
      email: "sup@test.local",
      avatar_url: "https://cdn/avatar.png",
      status: "BUSY",
      max_concurrent: 3,
      roles: [
        { role: { name: "agent", permissions: { inbox: true } } },
        { role: { name: "supervisor", permissions: { supervisor: true, reports: true } } },
      ],
    });

    expect(out.role).toBe("supervisor");
    expect(out.avatar).toBe("https://cdn/avatar.png");
    expect(out.permissions).toEqual({
      inbox: true,
      dashboard: true,
      contacts: true,
      supervisor: true,
      quality: true,
      reports: true,
    });
  });

  it("defaults to agent role when no elevated role is present", () => {
    const out = toAuthUserResponse({
      id: "u3",
      first_name: "Agent",
      last_name: "One",
      email: "agent@test.local",
      avatar_url: null,
      status: "OFFLINE",
      max_concurrent: 2,
      roles: [{ role: { name: "agent", permissions: { inbox: true } } }],
    });

    expect(out.role).toBe("agent");
    expect(out.permissions).toEqual({
      inbox: true,
      dashboard: true,
      contacts: true,
    });
  });
});
