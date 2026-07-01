#!/usr/bin/env node
/**
 * Smoke test: launches the built stdio server and runs a real MCP handshake
 * (initialize -> initialized -> tools/list). No Lemlist API key needed to list tools.
 *
 * Usage: node scripts/smoke-test.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "dist", "index.js");

const child = spawn(process.execPath, [entry], {
  env: { ...process.env, MODE: "stdio", LEMLIST_API_KEY: "smoke-test-key" },
  stdio: ["pipe", "pipe", "inherit"],
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
const responses = new Map();
let buffer = "";

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) responses.set(msg.id, msg);
    } catch {
      /* ignore non-JSON lines */
    }
  }
});

function waitFor(id, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (responses.has(id)) return resolve(responses.get(id));
      if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for response id=${id}`));
      setTimeout(tick, 25);
    };
    tick();
  });
}

function fail(message) {
  console.error(`❌ ${message}`);
  child.kill();
  process.exit(1);
}

const EXPECTED_TOOLS = [
  "lemlist_get_team",
  "lemlist_list_campaigns",
  "lemlist_get_campaign",
  "lemlist_start_campaign_export",
  "lemlist_get_campaign_export_status",
  "lemlist_export_campaign_leads",
  "lemlist_add_lead_to_campaign",
  "lemlist_update_lead_in_campaign",
  "lemlist_unsubscribe_lead_from_campaign",
  "lemlist_delete_lead_from_campaign",
  "lemlist_mark_lead_interested_in_campaign",
  "lemlist_mark_lead_not_interested_in_campaign",
  "lemlist_get_lead",
  "lemlist_pause_lead",
  "lemlist_resume_lead",
  "lemlist_mark_lead_interested",
  "lemlist_mark_lead_not_interested",
  "lemlist_get_activities",
  "lemlist_list_unsubscribes",
  "lemlist_add_unsubscribe",
  "lemlist_delete_unsubscribe",
  "lemlist_list_hooks",
  "lemlist_add_hook",
  "lemlist_delete_hook",
];

async function run() {
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0.0" },
    },
  });
  const init = await waitFor(1);
  if (init.error) fail(`initialize failed: ${JSON.stringify(init.error)}`);
  if (!init.result?.serverInfo?.name) fail("initialize response missing serverInfo.name");
  console.log(`✅ initialize -> ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);

  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const list = await waitFor(2);
  if (list.error) fail(`tools/list failed: ${JSON.stringify(list.error)}`);
  const tools = list.result?.tools ?? [];
  const names = tools.map((t) => t.name).sort();
  console.log(`✅ tools/list -> ${tools.length} tools`);

  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  const extra = names.filter((t) => !EXPECTED_TOOLS.includes(t));
  if (missing.length) fail(`Missing expected tools: ${missing.join(", ")}`);
  if (extra.length) fail(`Unexpected tools present: ${extra.join(", ")}`);

  // Every tool must have a description; input schemas must be objects.
  for (const t of tools) {
    if (!t.description) fail(`Tool ${t.name} is missing a description`);
    if (t.inputSchema && t.inputSchema.type !== "object") fail(`Tool ${t.name} has a non-object input schema`);
  }
  console.log(`✅ all ${EXPECTED_TOOLS.length} expected tools present, described, and well-formed`);

  console.log("\n🎉 Smoke test passed.");
  child.kill();
  process.exit(0);
}

run().catch((err) => fail(err.message));
