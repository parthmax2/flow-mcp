import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripAudio, parseProbe } from "../src/assemble.js";
import { filterAssets, type Asset } from "../src/flow/assets.js";
import { quoteOutcome, type ChatMessage } from "../src/flow/chat.js";
import { effectiveBudget } from "../src/flow/session.js";

const quote = (pending: boolean, extra = ""): ChatMessage => ({
  role: "agent",
  text: `Would you like me to kick off this 1 video generation, costing 10 credits?${extra}`,
  approval: { question: "Would you like me to kick off this 1 video generation, costing 10 credits?", credits: 10, pending },
});

describe("what became of a spend quote", () => {
  it("knows a quote answered outside the server (the field report's started renders)", () => {
    const messages: ChatMessage[] = [{ role: "user", text: "make a video" }, quote(false, "\nI've started generating your video.")];
    expect(quoteOutcome(messages)).toEqual({ kind: "answered", credits: 10 });
  });

  it("knows a quote Flow expired, which spent nothing", () => {
    const expired: ChatMessage = { role: "agent", text: "The generation timed out while waiting for confirmation, so it didn't run and no credits were spent." };
    expect(quoteOutcome([quote(false), expired])).toEqual({ kind: "expired" });
  });

  it("says nothing for an open quote or a reply without one", () => {
    expect(quoteOutcome([quote(true)])).toBeUndefined();
    expect(quoteOutcome([{ role: "agent", text: "Which style would you like?" }])).toBeUndefined();
  });
});

describe("server-wide credit cap", () => {
  it("lowers a call's budget to the cap and never raises it", () => {
    expect(effectiveBudget(100, 10)).toBe(10);
    expect(effectiveBudget(5, 10)).toBe(5);
    expect(effectiveBudget(100, undefined)).toBe(100);
  });
});

describe("flow_assets filters", () => {
  const asset = (i: number, kind: Asset["kind"], source: Asset["source"]): Asset => ({
    id: `id-${i}`,
    title: `${"a long generated caption ".repeat(6)}${i}`,
    kind,
    source,
    createdAt: 1000 + i,
    prompt: "a very long prompt ".repeat(40),
  });
  const assets = [asset(3, "video", "generated"), asset(2, "image", "uploaded"), asset(1, "image", "generated")];

  it("keeps the short form small and filters by kind, source and time", () => {
    const short = filterAssets(assets);
    expect(short.total).toBe(3);
    expect(short.assets[0]).not.toHaveProperty("prompt");
    expect(String(short.assets[0].title).length).toBeLessThanOrEqual(80);
    expect(filterAssets(assets, { kind: "video" }).assets.map((a) => a.id)).toEqual(["id-3"]);
    expect(filterAssets(assets, { source: "uploaded" }).assets.map((a) => a.id)).toEqual(["id-2"]);
    expect(filterAssets(assets, { since: 1001 }).total).toBe(2);
    expect(filterAssets(assets, { limit: 1 })).toMatchObject({ total: 3, shown: 1 });
    expect(filterAssets(assets, { full: true }).assets[0]).toHaveProperty("prompt");
  });
});

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const hasFfmpeg = !spawnSync(ffmpeg, ["-version"]).error;

describe("strip_audio", () => {
  it.skipIf(!hasFfmpeg)("removes the sound track and keeps the picture", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "strip-"));
    try {
      const file = path.join(dir, "clip.mp4");
      spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", "-pix_fmt", "yuv420p", file]);
      expect(parseProbe(spawnSync(ffmpeg, ["-i", file], { encoding: "utf8" }).stderr).hasAudio).toBe(true);
      expect(await stripAudio(file)).toBe(true);
      const after = parseProbe(spawnSync(ffmpeg, ["-i", file], { encoding: "utf8" }).stderr);
      expect(after.hasAudio).toBe(false);
      expect(after.width).toBe(160);
      expect(await stripAudio(path.join(dir, "still.png"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
