import { masterPrisma } from "../../lib/masterPrisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { hashRefreshToken, refreshTokenExpiresAt, signRefreshToken } from "../../lib/jwt.js";
import { signPlatformAccessToken, verifyPlatformAccessToken } from "../../lib/platformJwt.js";
import { HttpError } from "../../middleware/errorHandler.js";

export function toPlatformAdminResponse(admin: {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: admin.id,
    email: admin.email,
    first_name: admin.first_name,
    last_name: admin.last_name,
    name: `${admin.first_name} ${admin.last_name}`.trim(),
    role: "admin" as const,
    is_active: admin.is_active,
    created_at: admin.created_at,
    updated_at: admin.updated_at,
  };
}

export async function platformLogin(email: string, password: string) {
  const admin = await masterPrisma.platformAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!admin || !admin.is_active) throw new HttpError(401, "Invalid credentials");
  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  const token = signPlatformAccessToken({ sub: admin.id, email: admin.email });
  const refreshPlain = signRefreshToken();
  const refreshHash = hashRefreshToken(refreshPlain);

  await masterPrisma.platformRefreshToken.create({
    data: {
      admin_id: admin.id,
      token_hash: refreshHash,
      expires_at: refreshTokenExpiresAt(),
    },
  });

  return {
    token,
    refreshToken: refreshPlain,
    user: toPlatformAdminResponse(admin),
  };
}

export async function platformRefresh(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  const row = await masterPrisma.platformRefreshToken.findUnique({
    where: { token_hash: hash },
    include: { admin: true },
  });
  if (!row || row.expires_at < new Date() || !row.admin.is_active) {
    throw new HttpError(401, "Invalid refresh token");
  }
  const token = signPlatformAccessToken({ sub: row.admin_id, email: row.admin.email });
  return { token, user: toPlatformAdminResponse(row.admin) };
}

export async function platformLogout(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  await masterPrisma.platformRefreshToken.deleteMany({ where: { token_hash: hash } });
}

export async function getPlatformAdminById(id: string) {
  const admin = await masterPrisma.platformAdmin.findUnique({ where: { id } });
  if (!admin || !admin.is_active) throw new HttpError(404, "Admin not found");
  return toPlatformAdminResponse(admin);
}

export function verifyPlatformToken(token: string) {
  return verifyPlatformAccessToken(token);
}

export async function listPlatformAdmins() {
  const admins = await masterPrisma.platformAdmin.findMany({ orderBy: { email: "asc" } });
  return admins.map(toPlatformAdminResponse);
}

export async function createPlatformAdmin(input: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new HttpError(400, "Email required");
  if (input.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const exists = await masterPrisma.platformAdmin.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "Email already registered");

  const admin = await masterPrisma.platformAdmin.create({
    data: {
      email,
      password_hash: await hashPassword(input.password),
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
    },
  });
  return toPlatformAdminResponse(admin);
}

export async function updatePlatformAdmin(
  id: string,
  input: {
    email?: string;
    first_name?: string;
    last_name?: string;
    is_active?: boolean;
    new_password?: string | null;
  }
) {
  const existing = await masterPrisma.platformAdmin.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Admin not found");

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new HttpError(400, "Email required");
    const clash = await masterPrisma.platformAdmin.findFirst({
      where: { email, NOT: { id } },
    });
    if (clash) throw new HttpError(409, "Email already in use");
  }

  if (input.new_password != null && input.new_password !== "" && input.new_password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  const admin = await masterPrisma.platformAdmin.update({
    where: { id },
    data: {
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.first_name !== undefined ? { first_name: input.first_name.trim() } : {}),
      ...(input.last_name !== undefined ? { last_name: input.last_name.trim() } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      ...(input.new_password != null && input.new_password !== ""
        ? { password_hash: await hashPassword(input.new_password) }
        : {}),
    },
  });

  if (input.new_password != null && input.new_password !== "") {
    await masterPrisma.platformRefreshToken.deleteMany({ where: { admin_id: id } });
  }

  return toPlatformAdminResponse(admin);
}

export async function deletePlatformAdmin(id: string) {
  const count = await masterPrisma.platformAdmin.count({ where: { is_active: true } });
  const existing = await masterPrisma.platformAdmin.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Admin not found");
  if (existing.is_active && count <= 1) {
    throw new HttpError(400, "Cannot delete the last active platform admin");
  }
  await masterPrisma.platformAdmin.delete({ where: { id } });
  return { deleted: id };
}
