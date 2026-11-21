import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { explain, getJob, healed, listJobs, runJob, statusLine, step, type Job } from "../src/jobs.js";
import { outcomeOf, timeline } from "../src/tracked.js";

describe("jobs", () => {
  beforeEach(() => {
    config.dataDir = mkdtempSync(path.join(tmpdir(), "flow-jobs-"));
  });

  it("records the steps deep code reports, and the final state", async () => {
    const { job } = await runJob(
      "generate_video",
      "a paper boat",
      async () => {
        step("Uploading boat.png");
        step("Uploading boat.png"); // repeated polling lines are kept once
        healed("Reopened the picker and attached it");
        return { status: "started", credits: 10 };
      },
      (r) => outcomeOf(r),
    );
    expect(job.state).toBe("rendering");
    expect(job.credits).toBe(10);
    expect(job.steps.map((s) => s.icon)).toEqual(["📤", "🔁", "🎬"]);
    expect(job.steps[1].kind).toBe("heal");
    expect(getJob(job.id)?.title).toBe("a paper boat");
    expect(listJobs()[0].id).toBe(job.id);
  });

  it("turns an error into a reason and a fix, and keeps the job", async () => {
    let id: string | undefined;
    await expect(
      runJob("flow_chat", "hi", async () => {
        throw new Error("page.evaluate: Target page, context or browser has been closed");
      }, () => ({ state: "done" })),
    ).rejects.toSatisfy((e: Error & { jobId?: string }) => !!(id = e.jobId));
    const job = getJob(id!);
    expect(job).toMatchObject({ state: "failed", reason: "browser_down" });
    expect(job?.fix).toMatch(/flow_status/);
  });

  it("sends each step to the chat as it happens, and lists them for the result", async () => {
    const sent: string[] = [];
    const { job } = await runJob(
      "flow_wait",
      "wait",
      async () => {
        step("Rendering 20%", { icon: "🎬", percent: 20 });
        step("Rendering 70%", { icon: "🎬", percent: 70 }); // replaces the line above
        healed("Found the file on the media's viewer page", "only a preview was listed");
        step("Saved a.mp4");
        return { status: "completed", files: [{ file: "a.mp4" }] };
      },
      (r) => outcomeOf(r),
      (message) => sent.push(message),
    );
    expect(sent).toEqual(["🎬 Rendering 20%", "🎬 Rendering 70%", "🔁 Found the file on the media's viewer page (only a preview was listed)", "⬇️ Saved a.mp4"]);
    expect(timeline(job)).toEqual(["🎬 Rendering 70%", "🔁 Found the file on the media's viewer page (only a preview was listed)", "⬇️ Saved a.mp4", "✅ Done: 1 file(s) saved"]);
  });

  it("does nothing outside a job", () => {
    expect(() => step("no job here")).not.toThrow();
  });
});

describe("why a call stopped", () => {
  it("names known causes and says who must act", () => {
    expect(explain("You've reached your Flow Agent quota limit")).toMatchObject({ reason: "agent_quota", needsUser: true });
    expect(explain('Could not find "x" (id) in Flow\'s asset picker.')).toMatchObject({ reason: "asset_not_found", needsUser: false });
    expect(explain("page.goto: net::ERR_INTERNET_DISCONNECTED at https://flow.google.com/")).toMatchObject({ reason: "offline", needsUser: true });
    expect(explain("something nobody expected").reason).toBe("unexpected");
    expect(explain("Project abc is not in the Google account signed in to Flow (a@b.c).")).toMatchObject({ reason: "project_not_in_account", needsUser: true });
    expect(explain("locator.click: Timeout 15000ms exceeded.").reason).toBe("control_not_clickable");
  });
});

describe("tool results to job states", () => {
  it("maps each status to a state and a fix", () => {
    expect(outcomeOf({ status: "completed", files: [{ file: "a.mp4" }] })).toMatchObject({ state: "done", files: ["a.mp4"] });
    expect(outcomeOf({ status: "over_budget", credits: 100, maxCredits: 10 })).toMatchObject({ state: "needs_user", reason: "over_budget", credits: 0 });
    expect(outcomeOf({ status: "approval_expired" })).toMatchObject({ state: "needs_user", reason: "approval_expired" });
    expect(outcomeOf({ status: "approved_elsewhere", credits: 10, warning: "w" })).toMatchObject({ state: "rendering", reason: "approved_elsewhere", credits: 10 });
    expect(outcomeOf({ results: [{ ok: true, files: [{ file: "x.jpg" }] }, { ok: false, error: "boom" }] })).toMatchObject({ state: "done", reason: "partly_failed", files: ["x.jpg"] });
    expect(outcomeOf({ decision: "rejected_over_budget" })).toMatchObject({ state: "needs_user", reason: "over_budget" });
  });
});

describe("status line", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const job = (o: Partial<Job>): Job => ({ id: "j", tool: "generate_video", title: "a paper boat at dawn", startedAt: "2026-11-20T11:59:00Z", updatedAt: "2026-11-20T11:59:50Z", state: "running", steps: [{ at: "", icon: "💳", text: "Approved 10 credits" }], ...o });

  it("shows the step while working, what is needed when stopped, and credits today", () => {
    expect(statusLine([job({})], 10, now)).toBe("flow-mcp · 💳 Approved 10 credits · a paper boat at dawn · 10 credits today");
    expect(statusLine([job({ state: "needs_user", reason: "over_budget" })], 0, now)).toBe("flow-mcp · 🛑 needs you: over_budget · a paper boat at dawn");
    expect(statusLine([job({ state: "done", steps: [{ at: "", icon: "✅", text: "Done: 1 file(s) saved" }] })], 0, now)).toBe("flow-mcp · ✅ 1 file(s) saved (just now) · a paper boat at dawn");
    expect(statusLine([], 0, now)).toBe("flow-mcp · idle");
  });
});
