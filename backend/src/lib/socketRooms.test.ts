import { describe, expect, it } from "vitest";
import { emitTenantLiveEvent, supervisorRoom, tenantLiveRoom, userRoom } from "./socketRooms.js";

describe("socketRooms", () => {
  it("scopes live and supervisor rooms per tenant", () => {
    expect(tenantLiveRoom("acme")).toBe("tenant:acme:live");
    expect(supervisorRoom("acme")).toBe("tenant:acme:supervisors");
    expect(userRoom("acme", "u1")).toBe("tenant:acme:user:u1");
    expect(tenantLiveRoom("beta")).not.toBe(tenantLiveRoom("acme"));
  });

  it("emitTenantLiveEvent targets tenant live room", () => {
    const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
    };
    emitTenantLiveEvent(io, "acme", "voice:state", { state: "ringing" });
    expect(emitted).toEqual([
      {
        room: "tenant:acme:live",
        event: "voice:state",
        payload: { state: "ringing", tenantKey: "acme" },
      },
    ]);
  });
});
