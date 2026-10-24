import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getFlowPage } from "../browser/connect.js";
import { config } from "../config.js";
import { redactBody, redactUrl } from "./redact.js";

/**
 * Passive recorder for a run driven by another process: logs Flow's RPC traffic as JSON lines
 * and screenshots the tab every 20 s, writing as it goes. It never clicks and does not hook
 * the agent's chat stream, so it cannot disturb the run it observes.
 *
 * Stops after FLOW_WATCH_MINUTES (default 25) or when a file named STOP appears in its folder.
 */
const minutes = Number(process.env.FLOW_WATCH_MINUTES ?? 25);
const outDir = path.join(config.capturesDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.argv[2] ?? "watch"}`);
mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, "log.jsonl");
const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 1000);
const write = (entry: object) => appendFileSync(logFile, JSON.stringify({ t: secs(), ...entry }) + "\n");

const page = await getFlowPage();
page.on("request", (r) => {
  const u = new URL(r.url());
  if (r.method() !== "POST" || !u.host.endsWith("flow.google.com")) return;
  const rpc = u.searchParams.get("rpcids") ?? u.pathname.split("/").pop();
  if (rpc === "WuwhI") return;
  write({ dir: "->", rpc, url: redactUrl(r.url()), body: redactBody(r.postData() ?? undefined) });
});
page.on("response", async (r) => {
  const u = new URL(r.url());
  const rpc = u.searchParams.get("rpcids");
  if (!rpc || rpc === "WuwhI") return;
  let body: unknown;
  try {
    body = redactBody(await r.text());
  } catch {
    body = "<unavailable>";
  }
  write({ dir: "<-", rpc, status: r.status(), body });
});
page.on("requestfailed", (r) => {
  if (new URL(r.url()).host.endsWith("flow.google.com")) write({ dir: "x", url: redactUrl(r.url()), error: r.failure()?.errorText });
});
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) write({ dir: "nav", url: f.url() });
});

console.log(`Watching the Flow tab; writing to ${outDir}`);
let shot = 0;
while (Date.now() - t0 < minutes * 60_000 && !existsSync(path.join(outDir, "STOP"))) {
  await page.screenshot({ path: path.join(outDir, `shot-${String(++shot).padStart(3, "0")}-${secs()}s.png`) }).catch(() => {});
  await new Promise((r) => setTimeout(r, 20_000));
}
console.log(`Stopped after ${secs()}s, ${shot} screenshots`);
process.exit(0);
