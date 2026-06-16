export function userRoom(tenantKey: string, userId: string): string {
  return `tenant:${tenantKey}:user:${userId}`;
}

export function conversationRoom(tenantKey: string, conversationId: string): string {
  return `tenant:${tenantKey}:conversation:${conversationId}`;
}

export function queueRoom(tenantKey: string, queueId: string): string {
  return `tenant:${tenantKey}:queue:${queueId}`;
}

/** Todos los usuarios autenticados del tenant (p. ej. cambios de estado de agente). */
export function tenantLiveRoom(tenantKey: string): string {
  return `tenant:${tenantKey}:live`;
}

/** Supervisores y admins del tenant (monitor en vivo, asignaciones). */
export function supervisorRoom(tenantKey: string): string {
  return `tenant:${tenantKey}:supervisors`;
}

export function emitTenantLiveEvent(
  io: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } | null | undefined,
  tenantKey: string,
  event: string,
  payload: Record<string, unknown>
): void {
  io?.to(tenantLiveRoom(tenantKey)).emit(event, { ...payload, tenantKey });
}
