/*
 * Live test of the tools the basic e2e leaves out, through the built MCP server: the parallel
 * image batch, image content in results, flow_download, flow_upscale (one and several),
 * flow_frame and flow_assemble on local clips, flow_job and flow_characters. Free actions
 * only (images cost no credits; no video is generated). It works in its own project titled
 * "flow-mcp e2e tools".
 *
 *   npm run build && npm run e2e:tools [-- --clips <a.mp4> <b.mp4>]
 *
 * flow_frame and flow_assemble need two local videos; without --clips it looks in the output
 * folder for any two .mp4 files and skips those checks if there are none.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const entry = path.join(ROOT, "dist", "cli.js");
if (!existsSync(entry)) throw new Error("Build first: npm run build");

function findClips(dir: string, found: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findClips(p, found);
    else if (/\.mp4$/i.test(e.name) && statSync(p).size > 100_000) found.push(p);
    if (found.length >= 2) break;
  }
  return found;
}
const clips = args.includes("--clips") ? args.slice(args.indexOf("--clips") + 1, args.indexOf("--clips") + 3) : existsSync(path.join(ROOT, "output")) ? findClips(path.join(ROOT, "output")) : [];

const client = new Client({ name: "flow-mcp-e2e-tools", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "serve"], stderr: "inherit" }));

async function call(name: string, toolArgs: Record<string, unknown> = {}, seconds = 400) {
  const res = await client.callTool({ name, arguments: toolArgs }, undefined, { timeout: seconds * 1000, resetTimeoutOnProgress: true });
  const content = res.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  if (res.isError) throw new Error(`${name} returned an error: ${text.replace(/\s+/g, " ").slice(0, 1500)}`);
  return { body: JSON.parse(text), images: content.filter((c) => c.type === "image").length };
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
let ids: string[] = [];

await check("batch: three images in parallel, full size, shown in the result", async () => {
  const t0 = Date.now();
  const { body, images } = await call("generate_images", {
    new_project_title: "flow-mcp e2e tools",
    count: 1,
    jobs: ["A red paper boat on a pond.", "A bowl of ramen with rising steam.", "A lighthouse on a rocky coast at dusk."].map((prompt) => ({ prompt })),
  });
  projectId = body.projectId ?? "";
  const ok = (body.results as { ok: boolean; files?: { id: string; file: string }[]; error?: string }[]).filter((r) => r.ok);
  assert(ok.length === 3, `${ok.length} of 3 jobs succeeded: ${JSON.stringify(body.results.filter((r: { ok: boolean }) => !r.ok))}`);
  ids = ok.flatMap((r) => r.files!.map((f) => f.id));
  const smallest = Math.min(...ok.flatMap((r) => r.files!.map((f) => statSync(f.file).size)));
  assert(smallest > 90_000, `an image is only ${smallest} bytes: a preview, not the original`);
  assert(images === 3, `${images} images in the result, wanted 3`);
  assert(Array.isArray(body.progress) && body.progress.length > 3 && typeof body.jobId === "string", "no progress timeline or jobId");
  if (!projectId) projectId = (await call("flow_projects")).body.projects.find((p: { title?: string }) => p.title === "flow-mcp e2e tools")?.id;
  return `${((Date.now() - t0) / 1000).toFixed(0)}s, smallest ${Math.round(smallest / 1024)} KB, ${images} images in the result`;
});

await check("flow_job: reads the batch job with its steps", async () => {
  const { body } = await call("flow_job", {});
  const job = body.jobs.find((j: { tool: string }) => j.tool === "generate_images");
  assert(job && job.state === "done", `batch job state: ${job?.state}`);
  const detail = (await call("flow_job", { job_id: job.id })).body;
  assert(detail.steps.some((s: { text: string }) => /Sending the prompt/.test(s.text)), "no 'Sending the prompt' step");
  assert(detail.steps.some((s: { text: string }) => /^Saved /.test(s.text)), "no 'Saved' step");
  return `${detail.steps.length} steps`;
});

await check("flow_job: an unknown job id is refused", async () => {
  try {
    await call("flow_job", { job_id: "job-does-not-exist" });
  } catch (e) {
    assert(/No job/.test(String(e)), `unexpected error: ${e}`);
    return "refused";
  }
  throw new Error("should have been refused");
});

await check("flow_download: an image by id, with not-found reported", async () => {
  const { body } = await call("flow_download", { project_id: projectId, media_ids: [ids[0], "00000000-0000-4000-8000-000000000000"] });
  assert(body.files.length === 1, `${body.files.length} files`);
  assert(body.notFound.length === 1, "the unknown id was not reported");
  return `${Math.round(statSync(body.files[0].file).size / 1024)} KB`;
});

await check("flow_assets: short form, filters and limit", async () => {
  const { body } = await call("flow_assets", { project_id: projectId, kind: "image", limit: 2 });
  assert(body.shown === 2 && body.total >= 3, `shown ${body.shown} of ${body.total}`);
  assert(!("prompt" in body.assets[0]), "the short form carries prompts");
  return `${body.shown} of ${body.total}`;
});

await check("flow_upscale: 2K for one image, then two at once", async () => {
  const one = await call("flow_upscale", { project_id: projectId, media_id: ids[0], size: "2k" });
  assert(one.body.file && statSync(one.body.file).size > 200_000, "2K file missing or small");
  const many = await call("flow_upscale", { project_id: projectId, media_ids: [ids[1], ids[2]], size: "2k" });
  const done = (many.body.results as { ok: boolean }[]).filter((r) => r.ok).length;
  assert(done === 2, `${done} of 2 upscaled: ${JSON.stringify(many.body.results)}`);
  return `${Math.round(statSync(one.body.file).size / 1024)} KB, 2 more in one call`;
});

await check("flow_characters: create one, list it, list the voices", async () => {
  // Flow shows its voices on a character's page, so a character is needed first (free; reused on later runs).
  const name = "E2E Tester";
  let list = (await call("flow_characters", { project_id: projectId })).body;
  if (!JSON.stringify(list).includes(name)) {
    await call("flow_characters", { project_id: projectId, action: "create", image_id: ids[0], name, info: "A test character for the e2e suite.", voice: "Aoede" });
    list = (await call("flow_characters", { project_id: projectId })).body;
  }
  assert(JSON.stringify(list).includes(name), `character not listed: ${JSON.stringify(list).slice(0, 200)}`);
  const voices = (await call("flow_characters", { project_id: projectId, action: "voices" })).body;
  assert(JSON.stringify(voices).includes("Aoede"), "voices list has no Aoede");
  return "created or reused, listed, voices read";
});

if (clips.length >= 2) {
  await check("flow_frame: last frame of a local clip", async () => {
    const { body } = await call("flow_frame", { video: clips[0], at: "last" });
    assert(body.file && existsSync(body.file), `no frame file: ${JSON.stringify(body).slice(0, 200)}`);
    return path.basename(body.file);
  });
  await check("flow_assemble: join two clips with a fade", async () => {
    const out = path.join(ROOT, "output", "assembled", "e2e-tools.mp4");
    const { body } = await call("flow_assemble", { clips, output: out, fade: 0.3 });
    assert(body.clips === 2 && body.seconds > 3, `unexpected result: ${JSON.stringify(body)}`);
    return `${body.seconds}s ${body.width}x${body.height}`;
  });
} else {
  console.log("SKIP  flow_frame / flow_assemble: no two local .mp4 files found (pass --clips a.mp4 b.mp4)");
}

await check("an error comes back with a reason and a fix", async () => {
  try {
    await call("flow_download", { project_id: "11111111-1111-4111-8111-111111111111", media_ids: [ids[0]] });
  } catch (e) {
    const text = String(e);
    assert(/reason/.test(text) && /fix/.test(text), `no reason/fix in: ${text.slice(0, 200)}`);
    return "reason and fix present";
  }
  throw new Error("a project that is not in this account should be refused");
});

await client.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
