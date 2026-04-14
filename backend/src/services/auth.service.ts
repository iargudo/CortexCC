import type { AgentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { hashRefreshToken, signAccessToken, signRefreshToken, verifyAccessToken } from "../lib/jwt.js";
import { HttpError } from "../middleware/errorHandler.js";

function primaryRole(roles: { name: string }[]): "admin" | "supervisor" | "agent" {
  if (roles.some((r) => r.name === "admin")) return "admin";
  if (roles.some((r) => r.name === "supervisor")) return "supervisor";
  return "agent";
}

export function toAuthUserResponse(user: {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  status: string;
  max_concurrent: number;
  roles: { role: { name: string } }[];
}) {
  return {
    id: user.id,
    name: `${user.first_name} ${user.last_name}`.trim(),
    email: user.email,
    avatar: user.avatar_url ?? undefined,
    role: primaryRole(user.roles.map((r) => ({ name: r.role.name }))),
    status: user.status,
    max_concurrent: user.max_concurrent,
  };
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new HttpError(401, "Invalid credentials");
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshPlain = signRefreshToken();
  const refreshHash = hashRefreshToken(refreshPlain);
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  await prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token_hash: refreshHash,
      expires_at: expires,
    },
  });

  return {
    token: accessToken,
    refreshToken: refreshPlain,
    user: toAuthUserResponse(user),
  };
}

export async function refreshSession(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  const row = await prisma.refreshToken.findUnique({
    where: { token_hash: hash },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!row || row.expires_at < new Date()) {
    throw new HttpError(401, "Invalid refresh token");
  }
  const accessToken = signAccessToken({ sub: row.user_id, email: row.user.email });
  return { token: accessToken, user: toAuthUserResponse(row.user) };
}

export async function revokeRefreshToken(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.deleteMany({ where: { token_hash: hash } });
}

export async function logoutAll(userId: string) {
  await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
}

export async function changeProfile(
  userId: string,
  data: { name?: string; email?: string; max_concurrent?: number }
) {
  let first_name: string | undefined;
  let last_name: string | undefined;
  if (data.name) {
    const parts = data.name.trim().split(/\s+/);
    first_name = parts[0] ?? "";
    last_name = parts.slice(1).join(" ") || first_name;
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.email ? { email: data.email.toLowerCase() } : {}),
      ...(typeof data.max_concurrent === "number" ? { max_concurrent: data.max_concurrent } : {}),
      ...(first_name ? { first_name } : {}),
      ...(last_name ? { last_name } : {}),
    },
    include: { roles: { include: { role: true } } },
  });
  return toAuthUserResponse(user);
}

export async function setAgentStatus(userId: string, status: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: status as never, status_since: new Date() },
    include: { roles: { include: { role: true } } },
  });
  return toAuthUserResponse(user);
}

const AGENT_STATUSES: AgentStatus[] = ["ONLINE", "AWAY", "BUSY", "OFFLINE", "ON_BREAK"];

export type AdminUpdateUserInput = {
  email?: string;
  first_name?: string;
  last_name?: string;
  max_concurrent?: number;
  status?: string;
  roleNames?: string[];
  /** If set and non-empty, replaces password and revokes refresh tokens. */
  new_password?: string | null;
};

export async function adminUpdateUser(userId: string, body: AdminUpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new HttpError(404, "User not found");

  if (body.email !== undefined) {
    const lower = body.email.trim().toLowerCase();
    if (!lower) throw new HttpError(400, "Email required");
    const clash = await prisma.user.findFirst({ where: { email: lower, NOT: { id: userId } } });
    if (clash) throw new HttpError(409, "Email already in use");
  }

  if (body.new_password != null && body.new_password !== "" && body.new_password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  if (body.roleNames !== undefined) {
    if (!body.roleNames.length) throw new HttpError(400, "At least one role required");
    const uniqueNames = [...new Set(body.roleNames.map((n) => n.trim()).filter(Boolean))];
    const roles = await prisma.role.findMany({ where: { name: { in: uniqueNames } } });
    if (roles.length !== uniqueNames.length) throw new HttpError(400, "Unknown or duplicate role name");
  }

  if (body.status !== undefined && !AGENT_STATUSES.includes(body.status as AgentStatus)) {
    throw new HttpError(400, "Invalid status");
  }

  if (typeof body.max_concurrent === "number") {
    if (!Number.isFinite(body.max_concurrent) || body.max_concurrent < 1 || body.max_concurrent > 99) {
      throw new HttpError(400, "max_concurrent must be between 1 and 99");
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (body.email !== undefined) data.email = body.email.trim().toLowerCase();
  if (body.first_name !== undefined) data.first_name = body.first_name.trim();
  if (body.last_name !== undefined) data.last_name = body.last_name.trim();
  if (typeof body.max_concurrent === "number") data.max_concurrent = body.max_concurrent;
  if (body.status !== undefined) {
    data.status = body.status as AgentStatus;
    data.status_since = new Date();
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id: userId }, data });
    }
    if (body.roleNames !== undefined) {
      const uniqueNames = [...new Set(body.roleNames.map((n) => n.trim()).filter(Boolean))];
      const roles = await tx.role.findMany({ where: { name: { in: uniqueNames } } });
      await tx.userRole.deleteMany({ where: { user_id: userId } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ user_id: userId, role_id: r.id })),
      });
    }
    if (body.new_password != null && body.new_password !== "") {
      const password_hash = await hashPassword(body.new_password);
      await tx.user.update({ where: { id: userId }, data: { password_hash } });
      await tx.refreshToken.deleteMany({ where: { user_id: userId } });
    }
  });

  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: true } }, skills: { include: { skill: true } } },
  });
}

export async function registerUser(input: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  roleNames?: string[];
}) {
  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (exists) throw new HttpError(409, "Email already registered");
  const password_hash = await hashPassword(input.password);
  const roleNames = input.roleNames?.length ? input.roleNames : ["agent"];
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } } });
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      password_hash,
      first_name: input.first_name,
      last_name: input.last_name,
      roles: {
        create: roles.map((r) => ({ role_id: r.id })),
      },
    },
    include: { roles: { include: { role: true } } },
  });
  return toAuthUserResponse(user);
}

export function parseBearerPayload(token: string) {
  return verifyAccessToken(token);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) throw new HttpError(400, "Current password is incorrect");
  if (newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters");
  const password_hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password_hash } });
  await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
  return { ok: true };
}
