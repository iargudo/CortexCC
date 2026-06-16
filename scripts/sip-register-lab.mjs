#!/usr/bin/env node
/**
 * Lab helper: keep extension 7001 registered against local Asterisk WSS.
 * Run in background during smoke tests. Writes /tmp/cortexcc-sip-ready when registered.
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { UserAgent, Registerer, RegistererState } = require(join(root, "frontend/node_modules/sip.js"));

const READY_FILE = process.env.SIP_READY_FILE || "/tmp/cortexcc-sip-ready";
const EXT = process.env.SIP_EXTENSION || "7001";
const PASS = process.env.SIP_PASSWORD || "7001pass";
const SERVER = process.env.SIP_SERVER || "wss://localhost:8089/ws";
const REALM = process.env.SIP_REALM || "localhost";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const uri = UserAgent.makeURI(`sip:${EXT}@${REALM}`);
if (!uri) {
  console.error("Invalid SIP URI");
  process.exit(1);
}

const ua = new UserAgent({
  uri,
  logLevel: "error",
  transportOptions: {
    server: SERVER,
    connectionTimeout: 15,
  },
  authorizationUsername: EXT,
  authorizationPassword: PASS,
  displayName: "Smoke Lab Agent",
  sessionDescriptionHandlerFactoryOptions: {
    peerConnectionConfiguration: {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    },
  },
});

const registerer = new Registerer(ua);

async function shutdown() {
  try {
    await registerer.unregister();
  } catch {
    // ignore
  }
  try {
    await ua.stop();
  } catch {
    // ignore
  }
  try {
    unlinkSync(READY_FILE);
  } catch {
    // ignore
  }
}

registerer.stateChange.addListener((state) => {
  if (state === RegistererState.Registered) {
    writeFileSync(READY_FILE, "ok");
    console.log(`[sip-lab] registered ${EXT}`);
  }
  if (state === RegistererState.Unregistered) {
    try {
      unlinkSync(READY_FILE);
    } catch {
      // ignore
    }
  }
});

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

await ua.start();
await registerer.register();

setInterval(() => {}, 60_000);
