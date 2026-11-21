import { spawnSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { latestVersions, ViewerUnavailableError } from "../src/flow/upscale.js";
import { explain } from "../src/jobs.js";
import { localUpscale } from "../src/localUpscale.js";

describe("which version to suggest", () => {
  const img = (id: string, createdAt: number, references?: string[]) => ({ id, kind: "image", createdAt, references });
  it("suggests only the newest versions, not the edits that were edited again", () => {
    // a was edited into b and d; b was edited again into c, so b is blank too.
    const assets = [img("a", 1), img("b", 2, ["a"]), img("c", 5, ["b"]), img("d", 3, ["a"]), img("x", 6)];
    expect(latestVersions(assets, "a")).toEqual(["c", "d"]);
    expect(latestVersions(assets, "b")).toEqual(["c"]);
    expect(latestVersions(assets, "x")).toEqual([]);
  });
});

describe("an image Flow's viewer will not open", () => {
  it("names the newer versions and the ways out", () => {
    const e = new ViewerUnavailableError("aaa", ["bbb", "ccc"]);
    expect(e.message).toContain("use bbb or ccc instead");
    expect(e.message).toContain("allow_local");
    expect(e.message).toContain("flow_download");
    expect(new ViewerUnavailableError("aaa", []).message).toContain("older version");
  });

  it("is reported as viewer_unavailable with a fix, not as a timeout", () => {
    const e = new ViewerUnavailableError("aaa", ["bbb"]);
    expect(explain(e.message)).toMatchObject({ reason: "viewer_unavailable", needsUser: false });
  });
});

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
describe("local 2x copy", () => {
  it.skipIf(!!spawnSync(ffmpeg, ["-version"]).error)("doubles the size and says it is local", async () => {
    config.outputDir = mkdtempSync(path.join(tmpdir(), "flow-up-"));
    const src = path.join(config.outputDir, "boat-143eb66e.jpg");
    spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=200x120:rate=1:duration=1", "-frames:v", "1", src]);
    const r = await localUpscale("p1", "143eb66e-9b7e-469e-bf2a-e479e453866a", src);
    expect(r.method).toBe("local");
    expect(path.basename(r.file)).toBe("boat-143eb66e-2k-local.jpg");
    expect(statSync(r.file).size).toBeGreaterThan(1000);
    const dims = spawnSync(ffmpeg, ["-hide_banner", "-i", r.file], { encoding: "utf8" }).stderr.match(/(\d{3,4})x(\d{3,4})/);
    expect([Number(dims?.[1]), Number(dims?.[2])]).toEqual([400, 240]);
  }, 30_000);
});
