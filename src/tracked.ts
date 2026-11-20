import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJob, runJob, type Job, type Notify, type Outcome } from "./jobs.js";

/*
 * Which tools run as jobs, and how a tool's JSON result maps to the job's final state. Tools
 * are wrapped where they are registered, so their own code stays as it is; anything they report
 * through progress (and deep code through jobs.step) lands in the job.
 */

type Result = Record<string, unknown>;

const TRACKED = new Set([
  "generate_image",
  "generate_images",
  "generate_video",
  "flow_chat",
  "flow_approve",
  "flow_wait",
  "flow_download",
  "flow_upscale",
  "flow_frame",
  "flow_assemble",
]);

function titleOf(tool: string, args: Result): string {
  const text = (args.prompt ?? args.message) as string | undefined;
  if (text) return text.replace(/\s+/g, " ").trim();
  if (Array.isArray(args.jobs)) return `${args.jobs.length} image request(s)`;
  if (Array.isArray(args.clips)) return `Join ${args.clips.length} clip(s)`;
  const ids = (args.media_ids as string[] | undefined) ?? (args.media_id ? [args.media_id as string] : []);
  if (ids.length) return `${tool.replace("flow_", "")} ${ids.length} item(s)`;
  if (args.video) return `Frame of ${String(args.video).slice(0, 40)}`;
  return tool;
}

function filesOf(r: Result): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object" && typeof (v as Result).file === "string") out.push((v as Result).file as string);
  };
  for (const f of (r.files as unknown[]) ?? []) add(f);
  if (typeof r.file === "string") add(r.file);
  for (const j of (r.results as Result[]) ?? []) {
    for (const f of (j.files as unknown[]) ?? []) add(f);
    if (typeof j.file === "string") add(j.file);
  }
  return out;
}

/** The job's final state from a tool result; exported for tests. */
export function outcomeOf(r: Result): Outcome {
  const files = filesOf(r);
  const credits = typeof r.credits === "number" ? r.credits : undefined;
  const projectId = typeof r.projectId === "string" ? r.projectId : undefined;
  const base = { files, projectId, ...(credits !== undefined ? { credits } : {}) };
  switch (r.status) {
    case "completed":
      return { state: "done", ...base };
    case "started":
      return { state: "rendering", ...base, fix: "Collect it with flow_wait (media ids or since)." };
    case "approved_elsewhere":
      return { state: "rendering", ...base, reason: "approved_elsewhere", fix: String(r.warning ?? "Approved outside this server.") };
    case "pending":
      return { state: "rendering", ...base, reason: "still_rendering", fix: "Still rendering; call flow_wait again, or flow_download once Flow shows it finished." };
    case "needs_answer":
      return { state: "needs_user", ...base, reason: "agent_question", fix: "Flow's agent asked something. Show the user its message and answer with flow_chat." };
    case "over_budget":
      return { state: "needs_user", ...base, credits: 0, reason: "over_budget", fix: `Flow quoted ${credits} credits, above the budget of ${r.maxCredits}; nothing was spent. Ask the user, or ask for a cheaper model (veo-3.1-lite).` };
    case "approval_expired":
      return { state: "needs_user", ...base, credits: 0, reason: "approval_expired", fix: "Flow cancelled its quote before it was answered; nothing was spent. Asking again is safe." };
    case "failed":
      return { state: "failed", ...base, reason: "render_failed", fix: "Flow reported the render as failed. Tell the user; check flow_credits for the refund. Do not retry without their OK." };
  }
  if (r.decision === "approved") return { state: "rendering", ...base, fix: "Collect it with flow_wait." };
  if (r.decision === "rejected_over_budget") return { state: "needs_user", ...base, credits: 0, reason: "over_budget", fix: "The quote was above max_credits and was rejected; nothing was spent." };
  if (r.pendingApproval) return { state: "needs_user", ...base, reason: "quote_waiting", fix: "Flow quoted a cost. Tell the user, then answer with flow_approve within their budget." };
  if (Array.isArray(r.results)) {
    const failed = (r.results as Result[]).filter((j) => j.ok === false);
    if (failed.length === r.results.length && failed.length) return { state: "failed", ...base, reason: "all_failed", fix: String(failed[0].error ?? "Every request failed.") };
    if (failed.length) return { state: "done", ...base, reason: "partly_failed", fix: `${failed.length} of ${r.results.length} failed: ${failed[0].error}` };
  }
  if (Array.isArray(r.notFound) && r.notFound.length) return { state: "done", ...base, reason: "some_not_found", fix: `Not in this project: ${(r.notFound as string[]).join(", ")}` };
  return { state: "done", ...base };
}

/**
 * The job's steps as short lines for the chat, e.g. "📤 Uploading boat.png" or
 * "🔁 Reopened the picker and attached it". The assistant shows these to the user.
 */
export function timeline(job: Job): string[] {
  return job.steps.map((st) => `${st.icon} ${st.text}${st.detail && st.kind && st.kind !== "info" ? ` (${st.detail})` : ""}`);
}

interface Extra {
  _meta?: { progressToken?: string | number };
  sendNotification?: (n: never) => Promise<void>;
}

/** Sends job steps as MCP progress, which clients show live under the running tool call. */
function chatProgress(extra?: Extra): Notify | undefined {
  const token = extra?._meta?.progressToken;
  if (token === undefined || !extra?.sendNotification) return undefined;
  let n = 0;
  return (message, percent) => {
    const params = { progressToken: token, progress: percent ?? ++n, ...(percent !== undefined ? { total: 100 } : {}), message };
    extra.sendNotification!({ method: "notifications/progress", params } as never).catch(() => {});
  };
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type Handler = (...args: unknown[]) => Promise<{ content: Content[]; isError?: boolean }>;

const IMAGE_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_500_000;

/**
 * The finished images as image content, so chat clients show them right in the conversation
 * instead of only a file path. At most four, each under 1.5 MB (a 2K upscale is skipped);
 * FLOW_RETURN_IMAGES=0 turns it off.
 */
export function imageBlocks(files: string[] = []): Content[] {
  if (process.env.FLOW_RETURN_IMAGES === "0") return [];
  const blocks: Content[] = [];
  for (const file of files) {
    const mimeType = IMAGE_TYPES[path.extname(file).toLowerCase()];
    if (!mimeType || blocks.length >= MAX_IMAGES) continue;
    try {
      if (statSync(file).size > MAX_IMAGE_BYTES) continue;
      blocks.push({ type: "image", data: readFileSync(file).toString("base64"), mimeType });
    } catch {
      // A file that cannot be read is simply not shown; its path is still in the result.
    }
  }
  return blocks;
}

/** Makes the listed tools run as jobs, adding jobId to each result and a reason and fix to errors. */
export function trackTools(server: McpServer): void {
  const register = server.registerTool.bind(server) as (name: string, def: unknown, handler: Handler) => unknown;
  (server as unknown as { registerTool: typeof register }).registerTool = (name, def, handler) => {
    if (!TRACKED.has(name)) return register(name, def, handler);
    const wrapped: Handler = async (...args) => {
      const input = (args[0] ?? {}) as Result;
      const notify = chatProgress(args[1] as Extra | undefined);
      try {
        const { result, job } = await runJob(
          name,
          titleOf(name, input),
          () => handler(...args),
          (res) => {
            try {
              const c = res.content[0];
              return outcomeOf(JSON.parse(c?.type === "text" ? c.text : "{}") as Result);
            } catch {
              return { state: "done" };
            }
          },
          notify,
        );
        const first = result.content[0];
        const text = first?.type === "text" ? first.text : undefined;
        try {
          const body = JSON.parse(text ?? "") as Result;
          if (body && typeof body === "object" && !Array.isArray(body) && first?.type === "text") {
            first.text = JSON.stringify({ jobId: job.id, progress: timeline(job), ...body }, null, 2);
            result.content.push(...imageBlocks(job.files));
          }
        } catch {
          // Not JSON: leave the result as the tool made it.
        }
        return result;
      } catch (err) {
        const e = err as Error & { jobId?: string };
        const job = e.jobId ? getJob(e.jobId) : undefined;
        const body = { error: e.message.split("\n")[0], jobId: job?.id, reason: job?.reason, fix: job?.fix, ...(job?.screenshot ? { screenshot: job.screenshot } : {}), ...(job ? { progress: timeline(job) } : {}) };
        return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
      }
    };
    return register(name, def, wrapped);
  };
}
