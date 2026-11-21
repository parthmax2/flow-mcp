/*
 * Timing of every tool, N runs each, through the built MCP server the way an AI client uses it.
 * Free tools run first; video (paid: 10 credits per Veo 3.1 Lite clip) runs last and only a few
 * times. For the tools that make something it also records the lag between "Flow has it" and
 * "the tool returned", which should be close to zero.
 *
 *   npm run build && npm run benchmark [-- --runs 20] [-- --video-runs 5] [-- --only generate_image,flow_credits] [-- --skip-video]
 *
 * Video spends credits: --video-runs 5 is 50 credits. It never retries, passes model veo-3.1-lite and
 * max_credits 10, and stops at the first surprise. Images are free but count against Flow's daily
 * agent limit; a feature stops when that is reached and the rest carry on.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { summarize, type Summary } from "../src/stats.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const RUNS = Number(opt("--runs") ?? 20);
const VIDEO_RUNS = Number(opt("--video-runs") ?? 5);
const ONLY = opt("--only")?.split(",");
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

const client = new Client({ name: "flow-mcp-benchmark", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "serve"], stderr: "inherit" }));

interface Reply {
  isError: boolean;
  body: any;
  images: number;
}
async function call(name: string, toolArgs: Record<string, unknown> = {}, seconds = 900): Promise<Reply> {
  const res = await client.callTool({ name, arguments: toolArgs }, undefined, { timeout: seconds * 1000, resetTimeoutOnProgress: true });
  const content = res.content as { type: string; text?: string }[];
  let body: any = {};
  try {
    body = JSON.parse(content.find((c) => c.type === "text")?.text ?? "{}");
  } catch {
    body = {};
  }
  return { isError: !!res.isError, body, images: content.filter((c) => c.type === "image").length };
}

const stepAt = (job: any, test: RegExp): number | undefined => {
  const s = (job.steps as { at: string; text: string }[]).find((x) => test.test(x.text));
  return s ? Date.parse(s.at) : undefined;
};
async function jobOf(id?: string): Promise<any | undefined> {
  if (!id) return undefined;
  const r = await call("flow_job", { job_id: id });
  return r.isError ? undefined : r.body;
}

interface Sample {
  ok: boolean;
  seconds: number;
  /** Seconds from "Flow has it" to the tool returning. */
  lag?: number;
  note?: string;
}
interface Feature {
  name: string;
  tool: string;
  runs: number;
  note?: string;
  samples: Sample[];
  stopped?: string;
}
const features: Feature[] = [];

/** Runs one feature N times; `once` returns a Sample's extras. A daily-limit error stops the feature. */
async function bench(name: string, tool: string, runs: number, once: (n: number) => Promise<{ lag?: number; note?: string } | void>, note?: string): Promise<void> {
  if (ONLY && !ONLY.includes(tool) && !ONLY.includes(name)) return;
  const f: Feature = { name, tool, runs, note, samples: [] };
  features.push(f);
  process.stdout.write(`\n${name} (${runs}×) `);
  for (let n = 1; n <= runs; n++) {
    const t0 = Date.now();
    try {
      const extra = await once(n);
      f.samples.push({ ok: true, seconds: (Date.now() - t0) / 1000, ...(extra || {}) });
      process.stdout.write(".");
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      f.samples.push({ ok: false, seconds: (Date.now() - t0) / 1000, note: msg.slice(0, 160) });
      process.stdout.write("x");
      if (/agent_quota|daily agent limit/i.test(msg)) {
        f.stopped = "daily agent limit reached";
        break;
      }
      if (/credit|budget|approved_elsewhere/i.test(msg) && tool === "generate_video") {
        f.stopped = "stopped at the first surprise";
        break;
      }
    }
  }
  const okSamples = f.samples.filter((s) => s.ok);
  const s = okSamples.length ? summarize(okSamples.map((x) => x.seconds)) : undefined;
  process.stdout.write(`  ${okSamples.length}/${f.samples.length} ok${s ? `, median ${s.p50.toFixed(1)}s` : ""}${f.stopped ? ` (${f.stopped})` : ""}\n`);
}
function expectOk(r: Reply, what: string): any {
  if (r.isError) throw new Error(`${what}: ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}

// ---- setup: a project of our own, two local clips, and a few images to work on
const TITLE = "flow-mcp benchmark";
let projectId = "";
const images: { id: string; file: string }[] = [];
const clips = existsSync(path.join(ROOT, "output")) ? findClips(path.join(ROOT, "output")) : [];

console.log(`Benchmark: ${RUNS} runs per tool, video ${VIDEO_RUNS}×. Project "${TITLE}".`);
{
  const list = expectOk(await call("flow_projects"), "flow_projects");
  projectId = (list.projects as { id: string; title?: string }[]).find((p) => p.title === TITLE)?.id ?? "";
  const first = expectOk(
    await call("generate_images", {
      ...(projectId ? { project_id: projectId } : { new_project_title: TITLE, project_purpose: "timing of every tool" }),
      count: 1,
      jobs: ["A red paper boat on a calm pond.", "A bowl of ramen with steam.", "A lighthouse at dusk."].map((prompt) => ({ prompt })),
    }),
    "setup images",
  );
  // generate_images does not return the project id; find it by its title.
  projectId ||= first.projectId ?? ((expectOk(await call("flow_projects"), "flow_projects").projects as { id: string; title?: string }[]).find((p) => p.title === TITLE)?.id ?? "");
  for (const r of first.results as { ok: boolean; files?: { id: string; file: string }[] }[]) if (r.ok) images.push(...r.files!);
  if (!projectId || images.length === 0) throw new Error("setup failed: no project or images");
  console.log(`Setup done: project ${projectId}, ${images.length} images${clips.length >= 2 ? `, clips ${clips.map((c) => path.basename(c)).join(", ")}` : ", no local clips (frame/assemble skipped)"}`);
}

// ---- free tools that read or compute (fast first)
await bench("flow_credits", "flow_credits", RUNS, async () => void expectOk(await call("flow_credits"), "credits"));
await bench("flow_capabilities", "flow_capabilities", RUNS, async () => void expectOk(await call("flow_capabilities"), "capabilities"));
await bench("flow_sign_in (already signed in)", "flow_sign_in", RUNS, async () => void expectOk(await call("flow_sign_in"), "sign in"));
await bench("flow_job (list recent)", "flow_job", RUNS, async () => void expectOk(await call("flow_job", {}), "job list"));
await bench("flow_projects", "flow_projects", RUNS, async () => void expectOk(await call("flow_projects"), "projects"));
await bench("flow_assets (50, short form)", "flow_assets", RUNS, async () => void expectOk(await call("flow_assets", { project_id: projectId }), "assets"));
await bench("flow_transcript", "flow_transcript", RUNS, async () => void expectOk(await call("flow_transcript", { project_id: projectId }), "transcript"));
await bench("flow_characters (list)", "flow_characters", RUNS, async () => void expectOk(await call("flow_characters", { project_id: projectId }), "characters"));
await bench("flow_settings (read)", "flow_settings", RUNS, async () => void expectOk(await call("flow_settings", { project_id: projectId }), "settings"));
await bench("flow_trash (preview only)", "flow_trash", RUNS, async () => void expectOk(await call("flow_trash", { project_id: projectId, media_ids: [images[0].id] }), "trash preview"), "never confirmed");
await bench("flow_download (one image)", "flow_download", RUNS, async () => void expectOk(await call("flow_download", { project_id: projectId, media_ids: [images[0].id] }), "download"));
if (clips.length >= 2) {
  await bench("flow_frame (last frame of a clip)", "flow_frame", RUNS, async () => void expectOk(await call("flow_frame", { video: clips[0], at: "last" }), "frame"));
  await bench("flow_assemble (join 2 clips, fade)", "flow_assemble", RUNS, async () => void expectOk(await call("flow_assemble", { clips, output: path.join(ROOT, "output", "assembled", "benchmark.mp4"), fade: 0.3 }), "assemble"), "about 16 s of 720p video");
}
await bench("flow_status (full health check)", "flow_status", RUNS, async () => void expectOk(await call("flow_status"), "status"), "opens its own tab and checks 8 controls");

// ---- images (free; each is an agent request)
const made: { id: string; file: string }[] = [];
const PROMPTS = [
  "A red paper boat on a calm pond at sunrise.", "A steaming bowl of ramen on a wooden table.", "A lighthouse on a rocky coast at dusk.",
  "A small robot watering a plant on a windowsill.", "A bicycle leaning on a blue door.", "A cup of coffee with latte art, top-down.",
  "A fox sitting in fresh snow.", "A neon sign reflected in a rainy street.", "A stack of old books beside a glowing lamp.", "A hot air balloon over green hills.",
];
async function imageRun(n: number): Promise<{ lag?: number; note?: string }> {
  const r = await call("generate_image", { project_id: projectId, prompt: PROMPTS[(n - 1) % PROMPTS.length], count: 1, new_session: true });
  const body = expectOk(r, "generate_image");
  const files = (body.files ?? []) as { id: string; file: string }[];
  if (files.length !== 1) throw new Error(`${files.length} images`);
  if (statSync(files[0].file).size < 90_000) throw new Error("image is a preview, not the original");
  // Saved at once in a raw folder under a readable name, with its path in the result.
  if (!/[\\/]raw[\\/][a-z0-9-]+-[0-9a-f]{8}\.jpg$/.test(files[0].file)) throw new Error(`unexpected path ${files[0].file}`);
  made.push(files[0]);
  const job = await jobOf(body.jobId);
  const ready = job && stepAt(job, /Flow made/);
  return { lag: ready ? (Date.now() - ready) / 1000 : undefined, note: r.images ? "image in result" : "no image in result" };
}
await bench("generate_image (1 image)", "generate_image", RUNS, imageRun, "tool returns as soon as the image exists");
await bench(
  "generate_images (3 in parallel)",
  "generate_images",
  RUNS,
  async (n) => {
    const r = await call("generate_images", {
      project_id: projectId,
      count: 1,
      jobs: [0, 1, 2].map((i) => ({ prompt: PROMPTS[(n + i) % PROMPTS.length] })),
    });
    const body = expectOk(r, "generate_images");
    const ok = (body.results as { ok: boolean }[]).filter((x) => x.ok).length;
    if (ok !== 3) throw new Error(`${ok} of 3 jobs`);
    return { note: `${r.images} images in result` };
  },
  "3 images per run",
);
await bench(
  "flow_upscale (2K, a new image each run)",
  "flow_upscale",
  RUNS,
  async (n) => {
    const target = made[n - 1] ?? images[(n - 1) % images.length];
    const body = expectOk(await call("flow_upscale", { project_id: projectId, media_id: target.id, size: "2k" }), "upscale");
    if (!body.file || statSync(body.file).size < 200_000) throw new Error("2K file missing or small");
    return {};
  },
  "free 2K; each run a different image (a repeat is served from disk); runs before the edit step so edits cannot hide its images",
);
await bench(
  "generate_image (edit an image)",
  "generate_image",
  RUNS,
  async (n) => {
    const source = made[(n - 1) % Math.max(1, made.length)] ?? images[0];
    const body = expectOk(await call("generate_image", { project_id: projectId, media_ids: [source.id], prompt: "Make it black and white. Keep everything else the same.", count: 1, new_session: true }), "edit");
    if ((body.files ?? []).length !== 1) throw new Error("no edited image");
    return {};
  },
  "attaches a project image and changes it",
);
await bench("flow_chat (one short question)", "flow_chat", RUNS, async () => void expectOk(await call("flow_chat", { project_id: projectId, message: "Reply with the single word OK.", new_session: true }), "chat"), "an agent request without media");

// ---- video (paid: 10 credits each)
if (VIDEO_RUNS > 0 && (!ONLY || ONLY.includes("generate_video"))) {
  const credits = await call("flow_credits");
  console.log(`\nVideo: ${VIDEO_RUNS} runs, Veo 3.1 Lite, 10 credits each (${VIDEO_RUNS * 10} credits). ${JSON.stringify(credits.body).slice(0, 80)}`);
  const VIDEO_PROMPTS = [
    "Slow dolly-in on a small red paper boat floating on a calm pond at sunrise. Soft mist, gentle ripples. SFX: birdsong. No music.",
    "Slow orbit around a steaming bowl of ramen on a wooden table, warm light. Ambient noise: a quiet kitchen. No music.",
    "Locked-off shot of a lighthouse on a rocky coast at dusk, waves rolling in, the beam sweeping. Ambient noise: surf. No music.",
    "Close-up of a small robot watering a plant on a sunny windowsill, water droplets catching the light. SFX: soft water. No music.",
    "Slow pan across a stack of old books beside a glowing lamp, dust drifting in the light. Ambient noise: a quiet room. No music.",
  ];
  let spent = 0;
  await bench(
    "generate_video (Veo 3.1 Lite, 8 s)",
    "generate_video",
    VIDEO_RUNS,
    async (n) => {
      const t0 = Date.now();
      const viaWait = n <= 3; // runs 1-3 wait in the call; 4-5 start, then flow_wait
      const prompt = VIDEO_PROMPTS[(n - 1) % VIDEO_PROMPTS.length];
      const base = { project_id: projectId, prompt, model: "veo-3.1-lite", aspect_ratio: "16:9", max_credits: 10, new_session: true };
      let body = expectOk(await call("generate_video", { ...base, ...(viaWait ? { wait: true, wait_timeout_seconds: 900 } : {}) }, 1000), "generate_video");
      let startedAt = Date.now();
      if (typeof body.credits === "number") spent += body.credits;
      if (body.status === "approved_elsewhere" || body.status === "over_budget" || body.status === "needs_answer" || body.status === "approval_expired") throw new Error(`credits: status ${body.status}`);
      if (body.credits > 10) throw new Error(`credits: quoted ${body.credits}`);
      const jobId = body.jobId;
      if (!viaWait) {
        if (body.status !== "started") throw new Error(`status ${body.status}`);
        const startedSeconds = (Date.now() - t0) / 1000;
        startedAt = Date.now();
        const w = expectOk(await call("flow_wait", { project_id: projectId, media_ids: body.media.map((m: { id: string }) => m.id), timeout_seconds: 600 }, 900), "flow_wait");
        if (w.status !== "completed") throw new Error(`flow_wait ${w.status}`);
        const wjob = await jobOf(w.jobId);
        const found = wjob && stepAt(wjob, /Flow lists the finished video/);
        return { lag: found ? (Date.now() - found) / 1000 : undefined, note: `started in ${startedSeconds.toFixed(0)}s, then flow_wait ${((Date.now() - startedAt) / 1000).toFixed(0)}s; ${body.credits} credits` };
      }
      if (body.status !== "completed") throw new Error(`status ${body.status}`);
      const job = await jobOf(jobId);
      const found = job && stepAt(job, /Flow lists the finished video/);
      return { lag: found ? (Date.now() - found) / 1000 : undefined, note: `in one call (wait); ${body.credits} credits` };
    },
    "runs 1-3: one call with wait; runs 4-5: started, then flow_wait",
  );
  console.log(`Credits approved by these runs: ${spent}`);
}

// ---- report
const rows = features.map((f) => {
  const ok = f.samples.filter((s) => s.ok);
  const sum: Summary | undefined = ok.length ? summarize(ok.map((s) => s.seconds)) : undefined;
  const lags = ok.map((s) => s.lag).filter((v): v is number => v !== undefined);
  return { f, ok: ok.length, sum, lag: lags.length ? summarize(lags) : undefined };
});
const pad = (v: string, n: number) => v.padEnd(n);
const num = (v?: number) => (v === undefined || Number.isNaN(v) ? "-" : v.toFixed(v < 10 ? 2 : 1));
const lines = [
  "| Tool | Runs ok | Min | Median | p90 | Max | Mean | Lag after ready (median) |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.f.name} | ${r.ok}/${r.f.samples.length}${r.f.stopped ? ` (${r.f.stopped})` : ""} | ${num(r.sum?.min)} | ${num(r.sum?.p50)} | ${num(r.sum?.p90)} | ${num(r.sum?.max)} | ${num(r.sum?.mean)} | ${num(r.lag?.p50)} |`),
];
console.log("\nTimings in seconds\n" + lines.join("\n"));
const dir = path.join(ROOT, "output", "benchmark");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(path.join(dir, `benchmark-${stamp}.json`), JSON.stringify({ runs: RUNS, videoRuns: VIDEO_RUNS, features }, null, 2));
writeFileSync(path.join(dir, `benchmark-${stamp}.md`), lines.join("\n") + "\n");
console.log(`\nSaved output/benchmark/benchmark-${stamp}.{json,md}`);
void pad;
await client.close();
process.exit(0);
