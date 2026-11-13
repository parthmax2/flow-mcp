import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/*
 * Every tool call that does real work becomes a job: a list of steps (what is happening, with
 * a time and an icon), a final state, and when it stops, a named reason and a fix. Jobs are
 * saved to disk so they survive a restart, and the current job is found through async context,
 * so deep code (an upload, a picker retry, a quote) can add a step without passing it around.
 * The assistant reads jobs with flow_job; a live view can follow them with onJobUpdate.
 */

export type JobState = "running" | "rendering" | "done" | "needs_user" | "failed";
export type StepKind = "info" | "heal" | "need" | "error" | "done";

export interface JobStep {
  at: string;
  icon: string;
  text: string;
  detail?: string;
  kind?: StepKind;
}

export interface Job {
  id: string;
  tool: string;
  title: string;
  projectId?: string;
  startedAt: string;
  updatedAt: string;
  state: JobState;
  percent?: number;
  steps: JobStep[];
  credits?: number;
  files?: string[];
  /** Why the job stopped or needs the user, as a short code (e.g. over_budget, signed_out). */
  reason?: string;
  /** What to do about it, in plain words for the user and the assistant. */
  fix?: string;
}

const context = new AsyncLocalStorage<Job>();
const recent = new Map<string, Job>();
const listeners = new Set<(job: Job) => void>();
const jobsDir = () => path.join(config.dataDir, "jobs");

function save(job: Job): void {
  job.updatedAt = new Date().toISOString();
  recent.set(job.id, job);
  try {
    mkdirSync(jobsDir(), { recursive: true });
    writeFileSync(path.join(jobsDir(), `${job.id}.json`), JSON.stringify(job, null, 2));
  } catch {
    // A job record is a convenience; failing to save it must never fail the tool.
  }
  for (const fn of listeners) {
    try {
      fn(job);
    } catch {
      // A broken listener must not break the job.
    }
  }
}

/** Picks a friendly icon from what a progress message says. */
export function iconFor(text: string): string {
  const t = text.toLowerCase();
  if (/upload/.test(t)) return "📤";
  if (/attach|picker/.test(t)) return "📎";
  if (/quot|credit|budget|approv|reject/.test(t)) return "💳";
  if (/render|rendering/.test(t)) return "🎬";
  if (/download|saved|\bfile/.test(t)) return "⬇️";
  if (/upscal/.test(t)) return "🔍";
  if (/repl(y|ied)|agent said|asked/.test(t)) return "💬";
  if (/prompt|asking|sending|writing/.test(t)) return "✍️";
  if (/image/.test(t)) return "🖼️";
  if (/sign/.test(t)) return "🔑";
  return "•";
}

/** Adds a step to the current job, if a tool call is running one; otherwise does nothing. */
export function step(text: string, options: { icon?: string; detail?: string; kind?: StepKind; percent?: number } = {}): void {
  const job = context.getStore();
  if (!job) return;
  const last = job.steps.at(-1);
  // Render polling repeats itself; keep one line per distinct message.
  if (last && last.text === text && last.detail === options.detail) return;
  job.steps.push({
    at: new Date().toISOString(),
    icon: options.icon ?? iconFor(text),
    text,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.kind && options.kind !== "info" ? { kind: options.kind } : {}),
  });
  if (options.percent !== undefined) job.percent = options.percent;
  save(job);
}

/** A step that records something going wrong and the server fixing it itself. */
export const healed = (text: string, detail?: string) => step(text, { icon: "🔁", kind: "heal", detail });

export function currentJob(): Job | undefined {
  return context.getStore();
}

export function onJobUpdate(fn: (job: Job) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let counter = 0;
const newId = () => `job-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface Outcome {
  state: JobState;
  reason?: string;
  fix?: string;
  credits?: number;
  files?: string[];
  projectId?: string;
}

/**
 * Runs a tool call as a job. `finish` maps the tool's result to the job's final state; a
 * thrown error ends it as failed, with a reason and fix from explain().
 */
export async function runJob<T>(tool: string, title: string, work: () => Promise<T>, finish: (result: T) => Outcome): Promise<{ result: T; job: Job }> {
  const now = new Date().toISOString();
  const job: Job = { id: newId(), tool, title: title.length > 120 ? `${title.slice(0, 119)}…` : title, startedAt: now, updatedAt: now, state: "running", steps: [] };
  save(job);
  return context.run(job, async () => {
    try {
      const result = await work();
      const outcome = finish(result);
      Object.assign(job, outcome);
      const icon = outcome.state === "done" ? "✅" : outcome.state === "rendering" ? "🎬" : outcome.state === "needs_user" ? "🛑" : outcome.state === "failed" ? "❌" : "•";
      const text =
        outcome.state === "done"
          ? `Done${outcome.files?.length ? `: ${outcome.files.length} file(s) saved` : ""}`
          : outcome.state === "rendering"
            ? "Rendering in Flow; flow_wait collects it"
            : outcome.state === "needs_user"
              ? `Needs you: ${outcome.reason ?? "a decision"}`
              : outcome.state === "failed"
                ? `Failed: ${outcome.reason ?? "see fix"}`
                : "Still working";
      job.steps.push({ at: new Date().toISOString(), icon, text, ...(outcome.fix ? { detail: outcome.fix } : {}), kind: outcome.state === "done" ? "done" : outcome.state === "needs_user" ? "need" : outcome.state === "failed" ? "error" : undefined });
      if (outcome.state === "done") job.percent = 100;
      save(job);
      return { result, job };
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      const why = explain(message);
      Object.assign(job, { state: why.needsUser ? "needs_user" : "failed", reason: why.reason, fix: why.fix });
      job.steps.push({ at: new Date().toISOString(), icon: why.needsUser ? "🛑" : "❌", text: message, detail: why.fix, kind: why.needsUser ? "need" : "error" });
      save(job);
      (err as Error & { jobId?: string }).jobId = job.id;
      throw err;
    }
  });
}

/*
 * Known ways a call gets stuck or fails, from the error text, with a reason code the assistant
 * can act on and a fix in plain words. Order matters: the first match wins.
 */
const CAUSES: { test: RegExp; reason: string; fix: string; needsUser?: boolean }[] = [
  { test: /agent quota|daily agent limit/i, reason: "agent_quota", fix: "Flow's daily agent limit is reached. Wait until tomorrow or switch Google accounts (see flow_status).", needsUser: true },
  { test: /sign(ed)? ?in|signed out|not signed/i, reason: "signed_out", fix: "Sign in to Google in the Flow window (flow_sign_in), then run flow_status.", needsUser: true },
  { test: /verification|captcha|challenge/i, reason: "challenge", fix: "Google wants a verification. Finish it in the Flow window, then try again.", needsUser: true },
  { test: /is not in the Google account signed in/i, reason: "project_not_in_account", fix: "That project belongs to a different Google account than the one signed in to Flow. Sign that account in again, or start a new project.", needsUser: true },
  { test: /locator\.(click|fill)|Timeout \d+ms exceeded.*(click|waiting for)/i, reason: "control_not_clickable", fix: "A Flow control could not be used: a dialog may be open, or the page is not what was expected. Look at the Flow window, or run flow_status." },
  { test: /not waiting for an approval/i, reason: "no_open_quote", fix: "There is no quote to answer. Read flow_transcript to see what the agent said." },
  { test: /could not read the cost/i, reason: "unreadable_quote", fix: "The quote's cost could not be read, so nothing was approved. Check the Flow window and approve or reject there only if the user agrees.", needsUser: true },
  { test: /asset picker|could not find .* in flow/i, reason: "asset_not_found", fix: "Flow's picker did not show that media. Try again, or attach the file itself with attachments." },
  { test: /is not in this project/i, reason: "unknown_media", fix: "That media id is not in this project. List the project's media with flow_assets." },
  { test: /did not finish its reply|timeout .*exceeded|timed out/i, reason: "agent_slow", fix: "Flow's agent did not finish in time. Look at the Flow window or flow_transcript; nothing is retried automatically." },
  { test: /target page, context or browser has been closed|browser has been closed|ECONNREFUSED|connect/i, reason: "browser_down", fix: "The Flow Chrome window closed or restarted. Run flow_status; it reopens Chrome when needed." },
  { test: /ffmpeg/i, reason: "ffmpeg_missing", fix: "Install ffmpeg or set FFMPEG_PATH (see docs/configuration.md).", needsUser: true },
  { test: /not found|no such file|ENOENT/i, reason: "file_missing", fix: "A file was not found. Check the path." },
  { test: /HTTP 4\d\d|HTTP 5\d\d|download/i, reason: "download_failed", fix: "The download failed. The media is still in Flow; flow_download fetches it again." },
  { test: /ui|button|locator|selector/i, reason: "ui_changed", fix: "A Flow page control was not found; Flow may have changed. Run flow_status, which lists missing controls." },
];

export function explain(message: string): { reason: string; fix: string; needsUser: boolean } {
  const hit = CAUSES.find((c) => c.test.test(message));
  return hit ? { reason: hit.reason, fix: hit.fix, needsUser: !!hit.needsUser } : { reason: "unexpected", fix: "Run flow_status and tell the user its fix.", needsUser: false };
}

export function getJob(id: string): Job | undefined {
  if (recent.has(id)) return recent.get(id);
  const file = path.join(jobsDir(), `${path.basename(id)}.json`);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Job;
  } catch {
    return undefined;
  }
}

/** The most recent jobs, newest first. */
export function listJobs(limit = 10): Job[] {
  const seen = new Map(recent);
  try {
    const files = readdirSync(jobsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f, t: statSync(path.join(jobsDir(), f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, limit * 2);
    for (const { f } of files) {
      const id = f.replace(/\.json$/, "");
      if (!seen.has(id)) {
        const job = getJob(id);
        if (job) seen.set(id, job);
      }
    }
  } catch {
    // No jobs folder yet.
  }
  return [...seen.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** Credits approved by jobs since local midnight. */
export function creditsToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return listJobs(200)
    .filter((j) => new Date(j.startedAt) >= start)
    .reduce((sum, j) => sum + (j.state !== "needs_user" && j.state !== "failed" ? (j.credits ?? 0) : 0), 0);
}
