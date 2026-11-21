/*
 * Live test of the agent settings and Memory (standing instructions) against a real Flow
 * account, through the built MCP server. It only touches a project it owns: one titled
 * "flow-mcp e2e settings", created here if missing. Free actions only (one image request to
 * create the project). Everything it changes is put back at the end.
 *
 *   npm run build && npm run e2e:settings
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TITLE = "flow-mcp e2e settings";
const entry = path.join(ROOT, "dist", "cli.js");
if (!existsSync(entry)) throw new Error("Build first: npm run build");

const client = new Client({ name: "flow-mcp-e2e-settings", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "serve"], stderr: "inherit" }));

async function call(name: string, args: Record<string, unknown> = {}, seconds = 300) {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: seconds * 1000 });
  const text = (res.content as { type: string; text: string }[]).find((c) => c.type === "text")?.text ?? "";
  if (res.isError) throw new Error(`${name} returned an error: ${text}`);
  return JSON.parse(text);
}

let failed = 0;
async function check(name: string, run: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    const info = await run();
    console.log(`PASS  ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)  ${info}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)  ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let projectId = "";
let otherProject = "";
let original: any;

await check("find or create the test project", async () => {
  const list = await call("flow_projects");
  const projects = (list.projects ?? list) as { id: string; title?: string }[];
  projectId = projects.find((p) => p.title === TITLE)?.id ?? "";
  otherProject = projects.find((p) => p.id !== projectId)?.id ?? "";
  if (!projectId) {
    const made = await call("generate_image", { prompt: "A small red paper boat on a calm pond.", count: 1, new_project_title: TITLE, project_purpose: "live test of agent settings and Memory" });
    projectId = made.projectId;
  }
  assert(projectId, "no project id");
  return projectId;
});

await check("reads the approval mode, defaults and model lists", async () => {
  const r = await call("flow_settings", { project_id: projectId });
  original = r;
  assert(r.settings.approval === "always", `approval is ${r.settings.approval}`);
  assert(r.settings.image.aspect && r.settings.image.count && r.settings.image.model, `image defaults incomplete: ${JSON.stringify(r.settings.image)}`);
  assert(r.settings.video.aspect && r.settings.video.model, `video defaults incomplete: ${JSON.stringify(r.settings.video)}`);
  assert(r.settings.imageModels?.length > 1 && r.settings.videoModels?.length > 1, "model lists are empty");
  assert(r.settings.videoModels.some((m: string) => /Veo 3\.1 - Lite/.test(m)), "Veo 3.1 - Lite is not offered");
  return `image ${JSON.stringify(r.settings.image)} video ${JSON.stringify(r.settings.video)}`;
});

await check("changes image count, aspect and the video model, and they stay saved", async () => {
  const want = original.settings.image.count === 1 ? 3 : 1;
  const aspect = original.settings.image.aspect === "1:1" ? "4:3" : "1:1";
  const r = await call("flow_settings", { project_id: projectId, image: { count: want, aspect }, video: { model: "Veo 3.1 - Lite" } });
  assert(r.settings.image.count === want, `count is ${r.settings.image.count}, wanted ${want}`);
  assert(r.settings.image.aspect === aspect, `aspect is ${r.settings.image.aspect}, wanted ${aspect}`);
  assert(/Veo 3\.1 - Lite/.test(r.settings.video.model), `video model is ${r.settings.video.model}`);
  // Leave the project and come back: a fresh page load proves the change reached Flow.
  if (otherProject) await call("flow_transcript", { project_id: otherProject });
  const again = await call("flow_settings", { project_id: projectId });
  assert(again.settings.image.count === want && again.settings.image.aspect === aspect, "image defaults did not survive a reload");
  assert(/Veo 3\.1 - Lite/.test(again.settings.video.model), "video model did not survive a reload");
  return `count ${want}, aspect ${aspect}, video ${again.settings.video.model}`;
});

await check("Memory: add two instructions, read them back after a reload", async () => {
  const items = [
    { title: "Test rule", text: "Always say 'e2e test' in replies." },
    { title: "Second", text: "Keep it short." },
  ];
  const r = await call("flow_settings", { project_id: projectId, instructions: items });
  assert(r.instructions.length === 2, `got ${r.instructions.length} instructions`);
  if (otherProject) await call("flow_transcript", { project_id: otherProject });
  const again = await call("flow_settings", { project_id: projectId });
  assert(again.instructions.length === 2 && again.instructions[0].title === "Test rule" && again.instructions[1].text === "Keep it short.", `after reload: ${JSON.stringify(again.instructions)}`);
  return "2 instructions saved";
});

await check("Memory: replacing and clearing", async () => {
  const one = await call("flow_settings", { project_id: projectId, instructions: [{ title: "Only one", text: "Single rule." }] });
  assert(one.instructions.length === 1 && one.instructions[0].title === "Only one", `got ${JSON.stringify(one.instructions)}`);
  const none = await call("flow_settings", { project_id: projectId, instructions: [] });
  assert(none.instructions.length === 0, `still ${none.instructions.length} left`);
  return "replaced, then cleared";
});

await check("puts the defaults back", async () => {
  const r = await call("flow_settings", {
    project_id: projectId,
    image: { count: original.settings.image.count, aspect: original.settings.image.aspect, model: original.settings.image.model },
    video: { model: original.settings.video.model },
  });
  assert(r.settings.image.count === original.settings.image.count && r.settings.image.aspect === original.settings.image.aspect, "image defaults not restored");
  assert(r.settings.video.model === original.settings.video.model, "video model not restored");
  return "restored";
});

await check("the credit guard still sees the approval mode", async () => {
  const r = await call("flow_settings", { project_id: projectId });
  assert(r.settings.approval === "always", "approval changed");
  return "approval: always";
});

await client.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
