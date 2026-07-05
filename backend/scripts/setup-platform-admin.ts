import "dotenv/config";
import { execSync } from "node:child_process";
import { masterPrisma } from "../src/lib/masterPrisma.js";
import { hashPassword } from "../src/lib/password.js";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  requireEnv("MASTER_DATABASE_URL");

  console.log("Pushing master schema (tenants + platform_admins)...");
  execSync("npx prisma db push --schema=prisma/master.schema.prisma --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
  execSync("npx prisma generate --schema=prisma/master.schema.prisma", {
    stdio: "inherit",
    env: process.env,
  });

  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "platform@cortex.local").trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "PlatformAdmin123!";
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME ?? "Platform";
  const lastName = process.env.PLATFORM_ADMIN_LAST_NAME ?? "Admin";

  const existing = await masterPrisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Platform admin already exists: ${email}`);
  } else {
    await masterPrisma.platformAdmin.create({
      data: {
        email,
        password_hash: await hashPassword(password),
        first_name: firstName,
        last_name: lastName,
        is_active: true,
      },
    });
    console.log(`Created platform admin: ${email}`);
  }

  console.log("\nPlatform admin console: http://localhost:8080/platform/login");
  console.log(`  Email:    ${email}`);
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    console.log(`  Password: ${password} (default — change in production)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
  });
