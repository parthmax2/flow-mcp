import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJob, type Outcome } from "./jobs.js";

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

type Handler = (...args: unknown[]) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;

/** Makes the listed tools run as jobs, adding jobId to each result and a reason and fix to errors. */
export function trackTools(server: McpServer): void {
  const register = server.registerTool.bind(server) as (name: string, def: unknown, handler: Handler) => unknown;
  (server as unknown as { registerTool: typeof register }).registerTool = (name, def, handler) => {
    if (!TRACKED.has(name)) return register(name, def, handler);
    const wrapped: Handler = async (...args) => {
      const input = (args[0] ?? {}) as Result;
      try {
        const { result, job } = await runJob(
          name,
          titleOf(name, input),
          () => handler(...args),
          (res) => {
            try {
              return outcomeOf(JSON.parse(res.content[0]?.text ?? "{}") as Result);
            } catch {
              return { state: "done" };
            }
          },
        );
        const text = result.content[0]?.text;
        if (text?.startsWith("{")) result.content[0].text = `{\n  "jobId": "${job.id}",${text.slice(1)}`;
        return result;
      } catch (err) {
        const e = err as Error & { jobId?: string };
        const { getJob } = await import("./jobs.js");
        const job = e.jobId ? getJob(e.jobId) : undefined;
        const body = { error: e.message.split("\n")[0], jobId: job?.id, reason: job?.reason, fix: job?.fix };
        return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
      }
    };
    return register(name, def, wrapped);
  };
}
