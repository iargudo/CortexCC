#!/usr/bin/env node
/**
 * UI smoke — lab voice (Playwright).
 * Usage: node scripts/ui-smoke-voice-lab.mjs
 */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.FRONTEND_URL || "http://localhost:8080";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3030";
const ARI_URL = process.env.ARI_URL || "http://localhost:8074";
const ARI_USER = process.env.ARI_USER || "cortexcc";
const ARI_PASS = process.env.ARI_PASS || "Admin123!";
const WSS_ORIGIN = process.env.WSS_URL?.replace(/\/ws$/, "") || "https://localhost:8089";
const READY_FILE = process.env.SIP_READY_FILE || "/tmp/cortexcc-sip-ready-ui";

const results = [];
let sipProc = null;

function pass(name) {
  results.push({ name, status: "PASS" });
  console.log(`PASS  ${name}`);
}
function fail(name, detail) {
  results.push({ name, status: "FAIL", detail });
  console.log(`FAIL  ${name} — ${detail}`);
}

function loginToken(email, password) {
  const res = execSync(
    `curl -s -X POST "${BACKEND}/api/auth/login" -H "Content-Type: application/json" -d '{"email":"${email}","password":"${password}"}'`,
    { encoding: "utf8" }
  );
  return JSON.parse(res).token;
}

function cleanupAriChannels() {
  try {
    const raw = execSync(`curl -s -u "${ARI_USER}:${ARI_PASS}" "${ARI_URL}/ari/channels"`, { encoding: "utf8" });
    for (const ch of JSON.parse(raw || "[]")) {
      if (ch?.id) {
        execSync(`curl -s -u "${ARI_USER}:${ARI_PASS}" -X DELETE "${ARI_URL}/ari/channels/${encodeURIComponent(ch.id)}"`, {
          stdio: "ignore",
        });
      }
    }
  } catch {
    // ignore
  }
}

function simulateInbound() {
  cleanupAriChannels();
  const suffix = String(Date.now()).slice(-6);
  execSync(
    `curl -s -u "${ARI_USER}:${ARI_PASS}" -X POST "${ARI_URL}/ari/channels?endpoint=Local/1800${suffix}@from-trunk&app=cortexcc&appArgs=inbound,1800${suffix},5939912${suffix}&callerId=5939912${suffix}"`,
    { stdio: "ignore" }
  );
  return `5939912${suffix}`;
}

function startSipLab() {
  try {
    unlinkSync(READY_FILE);
  } catch {
    // ignore
  }
  sipProc = spawn("node", [join(ROOT, "scripts/sip-register-lab.mjs")], {
    cwd: join(ROOT, "frontend"),
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0", SIP_READY_FILE: READY_FILE },
    stdio: "ignore",
  });
  for (let i = 0; i < 45; i += 1) {
    if (existsSync(READY_FILE)) return true;
    execSync("sleep 1");
  }
  return false;
}

function stopSipLab() {
  if (sipProc && !sipProc.killed) {
    sipProc.kill("SIGTERM");
  }
  try {
    unlinkSync(READY_FILE);
  } catch {
    // ignore
  }
}

function findInboundConversationId(token, callerHint) {
  for (let i = 0; i < 15; i += 1) {
    try {
      const raw = execSync(
        `curl -s "${BACKEND}/api/conversations?channel=VOICE&tab=mine&limit=20" -H "Authorization: Bearer ${token}"`,
        { encoding: "utf8" }
      );
      const data = JSON.parse(raw || "{}").data ?? [];
      const hit = data.find((c) => String(c.contact?.phone ?? "") === callerHint);
      if (hit?.id) return hit.id;
      const rawQ = execSync(
        `curl -s "${BACKEND}/api/conversations?channel=VOICE&tab=queue&limit=20" -H "Authorization: Bearer ${token}"`,
        { encoding: "utf8" }
      );
      const dataQ = JSON.parse(rawQ || "{}").data ?? [];
      const hitQ = dataQ.find((c) => String(c.contact?.phone ?? "") === callerHint);
      if (hitQ?.id) return hitQ.id;
    } catch {
      // ignore
    }
    execSync("sleep 1");
  }
  return null;
}

function endpointHasContact() {
  try {
    const out = execSync('docker exec asterisk asterisk -rx "pjsip show endpoint 7001"', { encoding: "utf8" });
    return /Contact:/.test(out) && !/Unavailable\s+0 of inf/.test(out);
  } catch {
    return false;
  }
}

if (!startSipLab()) {
  fail("SIP lab register (7001)", "timeout");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "0",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  permissions: ["microphone"],
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

try {
  const token = loginToken("agent@cortex.local", "demo1234");
  execSync(
    `curl -s -X PUT "${BACKEND}/api/auth/status" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"status":"ONLINE"}'`,
    { stdio: "ignore" }
  );

  const certPage = await context.newPage();
  await certPage.goto(WSS_ORIGIN, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => undefined);
  await certPage.close();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#email", "agent@cortex.local");
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15000 });
  pass("Login → inbox/home");

  await page.waitForLoadState("networkidle");
  await page.getByTestId("header-softphone-toggle").waitFor({ timeout: 15000 });
  await page.getByTestId("header-softphone-toggle").click();
  await page.getByText(/7001|Softphone/i).first().waitFor({ timeout: 10000 });
  if (endpointHasContact()) {
    pass("Softphone lab registered (7001 en Asterisk)");
  } else {
    fail("Softphone lab registered", "endpoint 7001 sin contacto activo");
  }

  const callerHint = simulateInbound();
  const convId = findInboundConversationId(token, callerHint);
  if (convId) {
    await page.goto(`${BASE}/?conversation=${encodeURIComponent(convId)}`, { waitUntil: "networkidle" });
    pass("Inbox VOICE conversation visible after inbound");
  } else {
    fail("Inbox VOICE conversation", "not found after inbound simulation");
  }

  const bodyText = await page.locator("body").innerText();
  if (/Llamada entrante|\[Llamada entrante\]/i.test(bodyText)) {
    pass("Timeline [Llamada entrante]");
  } else {
    fail("Timeline [Llamada entrante]", "message not visible");
  }

  const contestar = page.getByRole("button", { name: /^Contestar$/i });
  const rechazar = page.getByRole("button", { name: /^Rechazar$/i });
  if ((await contestar.count()) && (await rechazar.count())) {
    pass("VoiceCallBar Contestar/Rechazar");
  } else {
    fail("VoiceCallBar", "Contestar/Rechazar not visible");
  }

  const llamar = page.getByRole("button", { name: /^Llamar$/i }).first();
  if (await llamar.count()) {
    cleanupAriChannels();
    await llamar.click();
    await page.getByText(/Llamada iniciada|Error al llamar/i).waitFor({ timeout: 15000 });
    pass("ContextPanel Llamar (toast visible)");
  } else {
    fail("ContextPanel Llamar", "button not found");
  }

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#email", "admin@cortex.local");
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15000 });

  await page.goto(`${BASE}/dialer`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Campañas de marcación/i }).waitFor({ timeout: 10000 });
  pass("/dialer page loads campaigns UI");

  const activar = page.getByRole("button", { name: /^Activar$/i }).first();
  if (await activar.count()) {
    await activar.click();
    await page.waitForTimeout(1000);
    const pausar = page.getByRole("button", { name: /^Pausar$/i }).first();
    if (await pausar.count()) {
      await pausar.click();
      pass("Dialer Activar/Pausar campaign");
    } else {
      fail("Dialer Pausar", "button not visible after activate");
    }
  } else {
    const pausarExisting = page.getByRole("button", { name: /^Pausar$/i }).first();
    if (await pausarExisting.count()) {
      pass("Dialer Activar/Pausar campaign (already active)");
    } else {
      fail("Dialer Activar", "no campaign to activate");
    }
  }
} catch (err) {
  fail("UI smoke runner", err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  stopSipLab();
}

const fails = results.filter((r) => r.status === "FAIL").length;
const passes = results.filter((r) => r.status === "PASS").length;
console.log(`\n=== UI Resumen ===\nPASS: ${passes}  FAIL: ${fails}`);
process.exit(fails > 0 ? 1 : 0);
