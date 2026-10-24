/*
 * End-to-end test of the built MCP server, driven over stdio like a real AI client.
 * Uses only free actions: reads, a trash preview (never confirmed), settings read, and one
 * image generation (images cost no credits). Skip the generation with --no-generate.
 *
 *   npm run build && npm run e2e [-- --project <id>] [-- --no-generate]
 *
 * Without --project it reuses (or creates, through a free image) a project titled "flow-mcp e2e".
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const generate = !args.includes("--no-generate");
let projectId = args.includes("--project") ? args[args.indexOf("--project") + 1] : undefined;

const EXPECTED_TOOLS = [
  "flow_status", "flow_credits", "flow_projects", "flow_assets", "flow_trash", "generate_image", "flow_upscale",
  "flow_settings", "flow_capabilities", "flow_chat", "flow_approve", "flow_wait", "flow_transcript", "generate_video",
];

const results: { name: string; ok: boolean; info: string; seconds: number }[] = [];
async function check(name: string, run: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    results.push({ name, ok: true, info: await run(), seconds: (Date.now() - t0) / 1000 });
  } catch (err) {
    results.push({ name, ok: false, info: err instanceof Error ? err.message.split("\n")[0] : String(err), seconds: (Date.now() - t0) / 1000 });
  }
  const r = results.at(-1)!;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${name} (${r.seconds.toFixed(0)}s)  ${r.info}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const entry = path.join(ROOT, "dist", "cli.js");
if (!existsSync(entry)) throw new Error("Build first: npm run build");
const client = new Client({ name: "flow-mcp-e2e", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "serve"], stderr: "inherit" }));

async function call(name: string, toolArgs: Record<string, unknown> = {}, timeoutSeconds = 300) {
  const res = await client.callTool({ name, arguments: toolArgs }, undefined, { timeout: timeoutSeconds * 1000 });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} returned an error: ${text}`);
  return JSON.parse(text);
}
async function callExpectingError(name: string, toolArgs: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: toolArgs });
  assert(res.isError, `${name} should have been refused`);
  return (res.content as { text: string }[])[0]?.text ?? "";
}

await check("server identifies itself with instructions", async () => {
  const info = client.getServerVersion();
  assert(info?.name === "flow-mcp", "unexpected server name");
  assert((client.getInstructions() ?? "").includes("flow_chat"), "instructions missing");
  return `flow-mcp ${info?.version}`;
});
await check("lists the expected tools", async () => {
  const names = (await client.listTools()).tools.map((t) => t.name);
  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  assert(missing.length === 0, `missing: ${missing.join(", ")}`);
  return `${names.length} tools`;
});
await check("refuses a creating call without a project", async () => {
  const text = await callExpectingError("generate_image", { prompt: "test" });
  assert(/project_id|new_project_title/.test(text), "refusal does not explain the project choice");
  return "refused before touching Flow";
});
await check("health check reports ready", async () => {
  const health = await call("flow_status");
  assert(health.state === "ready", `state ${health.state}: ${health.details}`);
  return health.details;
});
await check("reads the credit balance", async () => {
  const { credits } = await call("flow_credits");
  assert(typeof credits === "number", "no number");
  return `${credits} credits`;
});
await check("lists projects", async () => {
  const { projects } = await call("flow_projects");
  assert(Array.isArray(projects), "no project list");
  projectId ??= projects.find((p: { title: string }) => p.title === "flow-mcp e2e")?.id;
  return `${projects.length} projects${projectId ? `, using ${projectId}` : ", e2e project not found yet"}`;
});
await check("lists capabilities", async () => {
  const { capabilities } = await call("flow_capabilities");
  assert(capabilities.length > 10, "too few capabilities");
  return `${capabilities.length} features`;
});

if (generate) {
  await check("generates one free image and offers next steps", async () => {
    const target = projectId ? { project_id: projectId } : { new_project_title: "flow-mcp e2e", project_purpose: "End-to-end tests of flow-mcp" };
    const result = await call("generate_image", { prompt: "Make exactly one simple image: a blue square on a white background.", ...target }, 400);
    projectId = result.projectId;
    assert(result.files.length >= 1 && existsSync(result.files[0].file), "no downloaded file");
    assert(result.nextSteps?.some((s: string) => s.includes("flow_upscale")), "no upscale next step");
    assert(typeof result.reply === "string" && result.reply.length > 0, "agent reply missing");
    return `${result.files.length} file(s); agent said: "${result.reply.slice(0, 60)}..."`;
  });
}

if (projectId) {
  await check("reads project settings (approval must be 'always')", async () => {
    const { settings, instructions } = await call("flow_settings", { project_id: projectId });
    assert(settings.approval === "always", `approval is ${settings.approval}`);
    return `images x${settings.image.count} ${settings.image.model}, videos ${settings.video.model}, ${instructions.length} instructions`;
  });
  let someId: string | undefined;
  await check("lists project media", async () => {
    const { assets, duplicateUploads } = await call("flow_assets", { project_id: projectId });
    someId = assets[0]?.id;
    return `${assets.length} items, ${duplicateUploads.length} duplicate groups`;
  });
  await check("trash preview only (never confirmed)", async () => {
    if (!someId) return "skipped: project has no media";
    const preview = await call("flow_trash", { project_id: projectId, media_ids: [someId] });
    assert(preview.items?.length === 1, "preview lists no item");
    return preview.confirmation ? "preview with confirmation code; not confirmed" : `preview refused a code: ${preview.alsoAffected.length} other media affected`;
  });
  await check("trash refuses a wrong confirmation code", async () => {
    if (!someId) return "skipped: project has no media";
    const text = await callExpectingError("flow_trash", { project_id: projectId, media_ids: [someId], confirmation: "0000000000" });
    return text.slice(0, 60);
  });
  await check("reads the agent transcript", async () => {
    const { messages } = await call("flow_transcript", { project_id: projectId });
    return `${messages.length} messages`;
  });
  await check("flow_wait returns pending instead of hanging", async () => {
    const result = await call("flow_wait", { project_id: projectId, media_ids: ["00000000-0000-4000-8000-000000000000"], timeout_seconds: 15 }, 120);
    assert(result.status === "pending", `status ${result.status}`);
    return "pending";
  });
}

await client.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join("; ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
