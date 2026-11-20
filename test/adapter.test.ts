import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CONTROLS, controlsAt, PopupBlockingError } from "../src/flow/adapter.js";
import { config } from "../src/config.js";
import { getJob, runJob, setFailureProbe } from "../src/jobs.js";

describe("Flow adapter controls", () => {
  it("gives every control a label, a place and at least one way to find it", () => {
    const labels = new Set<string>();
    for (const def of Object.values(CONTROLS)) {
      expect(def.label.length).toBeGreaterThan(3);
      expect(["home", "project"]).toContain(def.where);
      expect(def.find.length).toBeGreaterThan(0);
      labels.add(def.label);
    }
    expect(labels.size).toBe(Object.keys(CONTROLS).length);
  });

  it("splits the controls the health check looks for by page", () => {
    expect(controlsAt("home").map((c) => c.key)).toEqual(["newProject"]);
    expect(controlsAt("project").map((c) => c.key)).toEqual(expect.arrayContaining(["promptBox", "sendButton", "agentSettings"]));
  });

  it("keeps the old and the new place of the agent settings button", () => {
    expect(CONTROLS.agentSettings.find.length).toBe(2);
  });
});

describe("failure probe", () => {
  beforeEach(() => {
    config.dataDir = mkdtempSync(path.join(tmpdir(), "flow-probe-"));
  });

  it("names a blocking pop-up and keeps the screenshot when a job fails", async () => {
    setFailureProbe(async (id) => ({ blocker: "A faster, easier-to-reach Flow Agent", screenshot: `${id}.png` }));
    let id = "";
    await runJob("generate_image", "a fox", async () => {
      throw new Error("locator.click: Timeout 15000ms exceeded.");
    }, () => ({ state: "done" })).catch((e) => (id = e.jobId));
    setFailureProbe(undefined);
    const job = getJob(id)!;
    expect(job).toMatchObject({ state: "needs_user", reason: "flow_popup", screenshot: `${id}.png` });
    expect(job.fix).toContain("A faster, easier-to-reach Flow Agent");
  });

  it("explains a refused pop-up the same way", async () => {
    let id = "";
    await runJob("flow_chat", "hi", async () => {
      throw new PopupBlockingError("What's new");
    }, () => ({ state: "done" })).catch((e) => (id = e.jobId));
    expect(getJob(id)).toMatchObject({ state: "needs_user", reason: "flow_popup" });
  });
});
