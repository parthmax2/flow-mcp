/*
 * Latency of one image, end to end, through the built MCP server the way an AI client uses it:
 * from the moment the tool is called until the image files are saved and returned. Each run
 * is broken into phases from the job's own step times:
 *   prepare   tool call -> prompt sent   (open the project, attach, check the approval mode)
 *   flow      prompt sent -> Flow's agent replied and the image exists
 *   fetch     image exists -> files saved on this machine
 * It also records when the first progress line reached the client, and whether the result
 * carried the image itself (image content, which chat clients show) or only a file path.
 * Images are free; each run is one image request. It stops at the daily agent limit.
 *
 *   npm run build && npm run latency [-- --runs 20] [-- --project <id>]
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { summarize, type Summary } from "../src/stats.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const runs = Number(args.includes("--runs") ? args[args.indexOf("--runs") + 1] : 20);
let projectId = args.includes("--project") ? args[args.indexOf("--project") + 1] : undefined;
const TITLE = "flow-mcp latency";

const PROMPTS = [
  "A red paper boat on a calm pond at sunrise, soft mist.",
  "A steaming bowl of ramen on a wooden table, warm light.",
  "A lighthouse on a rocky coast at dusk, long exposure.",
  "A small robot watering a plant on a sunny windowsill.",
  "A bicycle leaning on a blue door in a quiet street.",
  "A cup of coffee with latte art, top-down, morning light.",
  "A fox sitting in fresh snow, shallow depth of field.",
  "A neon sign reflected in a rainy street at night.",
  "A stack of old books beside a glowing lamp.",
  "A hot air balloon over green hills, golden hour.",
];

const entry = path.join(ROOT, "dist", "cli.js");
const client = new Client({ name: "flow-mcp-latency", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "serve"], stderr: "inherit" }));

async function call(name: string, toolArgs: Record<string, unknown>, onprogress?: (message: string) => void) {
  const res = await client.callTool({ name, arguments: toolArgs }, undefined, {
    timeout: 600_000,
    resetTimeoutOnProgress: true,
    onprogress: onprogress ? (p) => onprogress(p.message ?? "") : undefined,
  });
  const content = res.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  return { isError: !!res.isError, body: JSON.parse(text), imageBlocks: content.filter((c) => c.type === "image").length };
}

interface Run {
  n: number;
  ok: boolean;
  error?: string;
  reason?: string;
  totalSeconds: number;
  prepareSeconds?: number;
  flowSeconds?: number;
  fetchSeconds?: number;
  firstProgressSeconds?: number;
  images?: number;
  imageBytes?: number;
  imageBlocks?: number;
  jobId?: string;
}

const results: Run[] = [];
const at = (job: any, test: RegExp): number | undefined => {
  const s = (job.steps as { at: string; text: string }[]).find((x) => test.test(x.text));
  return s ? Date.parse(s.at) : undefined;
};

console.log(`Latency test: ${runs} image request(s), one image each, through the built server.\n`);
for (let n = 1; n <= runs; n++) {
  const prompt = PROMPTS[(n - 1) % PROMPTS.length];
  const t0 = Date.now();
  let firstProgress: number | undefined;
  const toolArgs: Record<string, unknown> = { prompt, count: 1, new_session: true, ...(projectId ? { project_id: projectId } : { new_project_title: TITLE, project_purpose: "latency test of image requests" }) };
  const run: Run = { n, ok: false, totalSeconds: 0 };
  try {
    const { isError, body, imageBlocks } = await call("generate_image", toolArgs, () => (firstProgress ??= Date.now()));
    run.totalSeconds = (Date.now() - t0) / 1000;
    run.jobId = body.jobId;
    if (firstProgress) run.firstProgressSeconds = (firstProgress - t0) / 1000;
    if (isError) {
      run.error = body.error;
      run.reason = body.reason;
    } else {
      projectId ??= body.projectId;
      const files: { file: string }[] = body.files ?? [];
      run.ok = files.length > 0;
      run.images = files.length;
      run.imageBytes = files.reduce((sum, f) => sum + statSync(f.file).size, 0);
      run.imageBlocks = imageBlocks;
      const job = (await call("flow_job", { job_id: body.jobId })).body;
      const started = Date.parse(job.startedAt);
      const sent = at(job, /Sending the prompt/);
      const made = at(job, /Flow made/);
      const saved = job.steps.filter((s: { text: string }) => /^Saved /.test(s.text)).map((s: { at: string }) => Date.parse(s.at)).at(-1);
      if (sent) run.prepareSeconds = (sent - started) / 1000;
      if (sent && made) run.flowSeconds = (made - sent) / 1000;
      if (made && saved) run.fetchSeconds = Math.max(0, (saved - made) / 1000);
    }
  } catch (err) {
    run.totalSeconds = (Date.now() - t0) / 1000;
    run.error = err instanceof Error ? err.message.split("\n")[0] : String(err);
  }
  results.push(run);
  const f = (v?: number) => (v === undefined ? "  -  " : v.toFixed(1).padStart(5));
  console.log(
    `run ${String(n).padStart(2)}  ${run.ok ? "ok  " : "FAIL"}  total ${f(run.totalSeconds)}s   prepare ${f(run.prepareSeconds)}s  flow ${f(run.flowSeconds)}s  fetch ${f(run.fetchSeconds)}s   first progress ${f(run.firstProgressSeconds)}s   image in chat: ${run.imageBlocks ? "yes" : "no"}${run.error ? `   ${run.error.slice(0, 80)}` : ""}`,
  );
  if (run.reason === "agent_quota") {
    console.log("Stopped: Flow's daily agent limit was reached.");
    break;
  }
}

const ok = results.filter((r) => r.ok);
const phase = (pick: (r: Run) => number | undefined): Summary | undefined => {
  const v = ok.map(pick).filter((x): x is number => x !== undefined);
  return v.length ? summarize(v) : undefined;
};
const summary = {
  runs: results.length,
  succeeded: ok.length,
  failed: results.length - ok.length,
  totalSeconds: phase((r) => r.totalSeconds),
  prepareSeconds: phase((r) => r.prepareSeconds),
  flowSeconds: phase((r) => r.flowSeconds),
  fetchSeconds: phase((r) => r.fetchSeconds),
  firstProgressSeconds: phase((r) => r.firstProgressSeconds),
  imageKilobytes: phase((r) => (r.imageBytes === undefined ? undefined : r.imageBytes / 1024)),
  imageShownInChat: ok.filter((r) => (r.imageBlocks ?? 0) > 0).length,
};
const line = (label: string, s?: Summary) =>
  s ? `${label.padEnd(24)} min ${s.min.toFixed(1)}  median ${s.p50.toFixed(1)}  p90 ${s.p90.toFixed(1)}  max ${s.max.toFixed(1)}  mean ${s.mean.toFixed(1)}` : `${label.padEnd(24)} n/a`;
console.log("\nSummary (seconds)");
console.log(line("whole request", summary.totalSeconds));
console.log(line("  prepare", summary.prepareSeconds));
console.log(line("  Flow makes the image", summary.flowSeconds));
console.log(line("  fetch and save", summary.fetchSeconds));
console.log(line("first progress line", summary.firstProgressSeconds));
console.log(`succeeded ${summary.succeeded}/${summary.runs}; image delivered in the chat result: ${summary.imageShownInChat}/${summary.succeeded}`);

const dir = path.join(ROOT, "output", "latency");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `latency-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
console.log(`Saved ${file}`);
await client.close();
process.exit(0);
