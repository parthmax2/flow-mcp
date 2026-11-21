import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { findSavedMedia, mediaBaseName, mediaFileName, rawDir, slugify, upscaledDir, withSaveFolder } from "../src/storage.js";

describe("readable file names", () => {
  it("turns a prompt into a short file-safe name", () => {
    expect(slugify("A red paper boat, on a calm pond at sunrise!")).toBe("a-red-paper-boat-on-a-calm-pond-at-sunrise");
    expect(slugify("Café  déjà-vu: “quoted” text")).toBe("cafe-deja-vu-quoted-text");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(48);
    expect(slugify("!!!")).toBe("");
  });

  it("cuts long text at a word boundary", () => {
    const slug = slugify("a very long caption that keeps going and going and going well past the limit of forty-eight characters");
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("a-very-long-caption")).toBe(true);
  });

  it("adds the short id, or falls back to the full id", () => {
    const id = "ad25fe57-1d77-48b5-a1b8-0cc079dd2a4a";
    expect(mediaFileName({ id, prompt: "Steaming bowl of ramen" }, "jpg")).toBe("steaming-bowl-of-ramen-ad25fe57.jpg");
    expect(mediaBaseName({ id })).toBe(id);
    expect(mediaBaseName({ id, prompt: "???" })).toBe(id);
  });
});

describe("where files go and how they are found again", () => {
  const id = "143eb66e-9b7e-469e-bf2a-e479e453866a";
  beforeEach(() => {
    config.outputDir = mkdtempSync(path.join(tmpdir(), "flow-out-"));
  });

  it("uses raw/ and upscaled/ in the project folder, or the call's own folder", () => {
    expect(rawDir("p1")).toBe(path.join(config.outputDir, "p1", "raw"));
    expect(upscaledDir("p1")).toBe(path.join(config.outputDir, "p1", "upscaled"));
    const own = path.join(config.outputDir, "mine", "raw");
    withSaveFolder(own, () => {
      expect(rawDir("p1")).toBe(own);
      expect(upscaledDir("p1")).toBe(own);
    });
    expect(rawDir("p1")).toBe(path.join(config.outputDir, "p1", "raw"));
  });

  it("finds a file by id in raw/, in an older layout, or in the call's folder", () => {
    const dir = path.join(config.outputDir, "p1", "raw");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "red-paper-boat-143eb66e.mp4"), "x");
    expect(findSavedMedia("p1", id)).toBe(path.join(dir, "red-paper-boat-143eb66e.mp4"));
    expect(findSavedMedia("p1", "00000000-0000-4000-8000-000000000000")).toBeUndefined();

    mkdirSync(path.join(config.outputDir, "old"), { recursive: true });
    writeFileSync(path.join(config.outputDir, "old", `${id}.mp4`), "x");
    expect(findSavedMedia("old", id)).toBe(path.join(config.outputDir, "old", `${id}.mp4`));

    const mine = mkdtempSync(path.join(tmpdir(), "flow-mine-"));
    writeFileSync(path.join(mine, "boat-143eb66e.jpg"), "x");
    withSaveFolder(mine, () => expect(findSavedMedia("p9", id)).toBe(path.join(mine, "boat-143eb66e.jpg")));
  });

  it("tells an upscale from the original and ignores half-written files", () => {
    const dir = path.join(config.outputDir, "p2", "upscaled");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "boat-143eb66e-2k.jpg"), "x");
    writeFileSync(path.join(dir, "boat-143eb66e-4k.jpg.part"), "x");
    expect(findSavedMedia("p2", id, "2k")).toBe(path.join(dir, "boat-143eb66e-2k.jpg"));
    expect(findSavedMedia("p2", id, "4k")).toBeUndefined();
    expect(findSavedMedia("p2", id)).toBeUndefined(); // the upscale is not the original
    writeFileSync(path.join(dir, `${id}-2k.jpg`), "x"); // the old naming still counts
    expect(findSavedMedia("p2", id, "2k")).toBeDefined();
  });
});
