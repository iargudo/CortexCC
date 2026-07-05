import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { routeParam } from "../utils/routeParams.js";
import { HttpError } from "../middleware/errorHandler.js";
import { platformAuthMiddleware, requirePlatformAdmin } from "../middleware/platformAuth.js";
import * as platformAuth from "../services/platform/platformAuth.service.js";
import * as tenantProvisioning from "../services/platform/tenantProvisioning.service.js";

export function buildPlatformRouter(): Router {
  const r = Router();

  r.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) throw new HttpError(400, "email and password required");
      const out = await platformAuth.platformLogin(email, password);
      res.json(out);
    })
  );

  r.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const token = (req.body as { refreshToken?: string }).refreshToken;
      if (!token) throw new HttpError(400, "refreshToken required");
      const out = await platformAuth.platformRefresh(token);
      res.json(out);
    })
  );

  r.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const token = (req.body as { refreshToken?: string }).refreshToken;
      if (token) await platformAuth.platformLogout(token);
      res.json({ ok: true });
    })
  );

  r.use(platformAuthMiddleware);

  r.get(
    "/auth/me",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const admin = await platformAuth.getPlatformAdminById(req.platformAdmin!.id);
      res.json(admin);
    })
  );

  r.get(
    "/admins",
    requirePlatformAdmin,
    asyncHandler(async (_req, res) => {
      res.json(await platformAuth.listPlatformAdmins());
    })
  );

  r.post(
    "/admins",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        email?: string;
        password?: string;
        first_name?: string;
        last_name?: string;
      };
      if (!body.email || !body.password || !body.first_name || !body.last_name) {
        throw new HttpError(400, "email, password, first_name and last_name required");
      }
      const admin = await platformAuth.createPlatformAdmin({
        email: body.email,
        password: body.password,
        first_name: body.first_name,
        last_name: body.last_name,
      });
      res.status(201).json(admin);
    })
  );

  r.patch(
    "/admins/:id",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        email?: string;
        first_name?: string;
        last_name?: string;
        is_active?: boolean;
        new_password?: string | null;
      };
      const admin = await platformAuth.updatePlatformAdmin(routeParam(req, "id"), body);
      res.json(admin);
    })
  );

  r.delete(
    "/admins/:id",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      res.json(await platformAuth.deletePlatformAdmin(routeParam(req, "id")));
    })
  );

  r.get(
    "/tenants",
    requirePlatformAdmin,
    asyncHandler(async (_req, res) => {
      res.json(await tenantProvisioning.listTenants());
    })
  );

  r.get(
    "/tenants/:key",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      res.json(await tenantProvisioning.getTenant(routeParam(req, "key")));
    })
  );

  r.post(
    "/tenants",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        key?: string;
        name?: string;
        subdomain?: string | null;
        custom_domain?: string | null;
        skip_db_create?: boolean;
        skip_migrate?: boolean;
        seed?: boolean;
        database_host?: string;
        database_port?: number;
        database_user?: string;
        database_password?: string;
        database_name?: string;
      };
      if (!body.key || !body.name) throw new HttpError(400, "key and name required");

      const tenant = await tenantProvisioning.createTenant({
        key: body.key,
        name: body.name,
        subdomain: body.subdomain,
        customDomain: body.custom_domain,
        skipDbCreate: body.skip_db_create,
        skipMigrate: body.skip_migrate,
        seed: body.seed,
        db: {
          dbHost: body.database_host,
          dbPort: body.database_port,
          dbUser: body.database_user,
          dbPassword: body.database_password,
          dbName: body.database_name,
        },
      });
      res.status(201).json(tenant);
    })
  );

  r.patch(
    "/tenants/:key",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        display_name?: string;
        subdomain?: string | null;
        custom_domain?: string | null;
        is_active?: boolean;
        database_host?: string;
        database_port?: number;
        database_user?: string;
        database_password?: string;
        database_name?: string;
      };
      res.json(await tenantProvisioning.updateTenant(routeParam(req, "key"), body));
    })
  );

  r.delete(
    "/tenants/:key",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const dropDatabase = (req.query.drop_database as string | undefined) === "true";
      res.json(await tenantProvisioning.deleteTenant(routeParam(req, "key"), { dropDatabase }));
    })
  );

  r.post(
    "/tenants/:key/migrate",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      res.json(await tenantProvisioning.migrateTenantByKey(routeParam(req, "key")));
    })
  );

  r.post(
    "/tenants/:key/database/inspect",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as {
        database_host?: string;
        database_port?: number;
        database_user?: string;
        database_password?: string;
        database_name?: string;
      };
      res.json(
        await tenantProvisioning.inspectTenantDatabase(routeParam(req, "key"), {
          dbHost: body.database_host,
          dbPort: body.database_port,
          dbUser: body.database_user,
          dbPassword: body.database_password,
          dbName: body.database_name,
        })
      );
    })
  );

  r.post(
    "/tenants/:key/seed-baseline",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      res.json(await tenantProvisioning.seedBaselineForTenant(routeParam(req, "key")));
    })
  );

  r.post(
    "/tenants/:key/setup-puntonet",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { default_password?: string };
      res.json(
        await tenantProvisioning.setupPuntonetForTenant(routeParam(req, "key"), {
          defaultPassword: body.default_password,
        })
      );
    })
  );

  r.post(
    "/tenants/:key/clone",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        new_key?: string;
        new_name?: string;
        subdomain?: string | null;
        custom_domain?: string | null;
        database_name?: string;
        skip_migrate?: boolean;
      };
      if (!body.new_key || !body.new_name) {
        throw new HttpError(400, "new_key and new_name required");
      }
      const tenant = await tenantProvisioning.cloneTenant({
        sourceKey: routeParam(req, "key"),
        newKey: body.new_key,
        newName: body.new_name,
        subdomain: body.subdomain,
        customDomain: body.custom_domain,
        dbName: body.database_name,
        skipMigrate: body.skip_migrate,
      });
      res.status(201).json(tenant);
    })
  );

  r.post(
    "/migrate-all",
    requirePlatformAdmin,
    asyncHandler(async (req, res) => {
      const activeOnly = (req.body as { active_only?: boolean }).active_only !== false;
      const result = await tenantProvisioning.migrateAllTenants({ activeOnly });
      const status = result.failed_count > 0 ? 207 : 200;
      res.status(status).json(result);
    })
  );

  return r;
}
