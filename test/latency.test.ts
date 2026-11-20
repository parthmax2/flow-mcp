import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { percentile, summarize } from "../src/stats.js";
import { imageBlocks } from "../src/tracked.js";

describe("latency statistics", () => {
  it("computes percentiles between values", () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 50)).toBeNaN();
  });

  it("summarizes a run of timings", () => {
    const s = summarize([62, 48, 71, 55, 90]);
    expect(s).toMatchObject({ n: 5, min: 48, p50: 62, max: 90 });
    expect(s.mean).toBeCloseTo(65.2, 1);
  });
});

describe("images shown in the chat", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flow-img-"));
  afterEach(() => {
    delete process.env.FLOW_RETURN_IMAGES;
  });
  const write = (name: string, bytes: number) => {
    const file = path.join(dir, name);
    writeFileSync(file, Buffer.alloc(bytes, 1));
    return file;
  };

  it("returns images as image content, not videos, at most four", () => {
    const files = [write("a.jpg", 100), write("b.png", 100), write("clip.mp4", 100), write("c.webp", 100), write("d.jpg", 100), write("e.jpg", 100)];
    const blocks = imageBlocks(files);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(blocks[1]).toMatchObject({ mimeType: "image/png" });
    expect(blocks[2]).toMatchObject({ mimeType: "image/webp" });
  });

  it("skips images that are too big, missing files and when switched off", () => {
    expect(imageBlocks([write("big.jpg", 1_600_000), path.join(dir, "missing.jpg")])).toHaveLength(0);
    process.env.FLOW_RETURN_IMAGES = "0";
    expect(imageBlocks([write("ok.jpg", 100)])).toHaveLength(0);
  });
});
