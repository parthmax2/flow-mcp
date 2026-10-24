import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext } from "playwright-core";
import { getBrowser } from "../browser/connect.js";
import { config } from "../config.js";
import { waitForMedia } from "./session.js";
import { serialize } from "./ui.js";

/*
 * Still frames from videos, e.g. a shot's last frame to start the next shot on, which keeps
 * characters and setting continuous across clips. The frame is decoded by Chrome itself in a
 * scratch tab, so no ffmpeg is needed; the video never leaves this machine.
 */

/** "first", "last", or a time in seconds. */
export type FramePosition = "first" | "last" | number;

export interface FrameResult {
  /** The PNG on disk; attach it as start_frame / end_frame / ingredients (uploaded once per project). */
  file: string;
  video: string;
  atSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
}

const VIDEO_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
// A made-up origin served by request interception, so the canvas is same-origin and readable.
const SCRATCH_ORIGIN = "https://flow-mcp-frame.invalid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Runs in the scratch tab: loads the video as a blob, seeks, and returns the frame as a PNG data URL. */
async function grabFrame(at: FramePosition) {
  const blob = await (await fetch("/video")).blob();
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Chrome could not decode this video."));
  });
  const duration = video.duration;
  // The exact end shows nothing in some files; a hair before it is the last frame.
  const target = at === "first" ? 0 : at === "last" ? Math.max(0, duration - 0.01) : Math.min(Math.max(0, at), Math.max(0, duration - 0.01));
  if (target > 0) {
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = target;
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), atSeconds: target, durationSeconds: duration, width: canvas.width, height: canvas.height };
}

/** Decodes one frame of a local video file in a scratch tab of the given browser context and saves it as PNG. */
export async function frameFromFile(context: BrowserContext, video: string, at: FramePosition, outFile?: string): Promise<FrameResult> {
  const abs = path.resolve(video);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const type = VIDEO_TYPES[path.extname(abs).toLowerCase()];
  if (!type) throw new Error(`Frames can be taken from mp4, mov or webm videos, not ${path.basename(abs)}`);
  if (typeof at === "number" && !(at >= 0)) throw new Error("The frame time must be 0 seconds or more.");

  const tab = await context.newPage();
  try {
    await tab.route(`${SCRATCH_ORIGIN}/**`, (route) =>
      new URL(route.request().url()).pathname === "/video"
        ? route.fulfill({ status: 200, contentType: type, body: readFileSync(abs) })
        : route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>flow-mcp frame</title>" }),
    );
    await tab.goto(`${SCRATCH_ORIGIN}/`, { waitUntil: "domcontentloaded" });
    const grabbed = await tab.evaluate(grabFrame, at);
    const label = at === "first" || at === "last" ? at : `${grabbed.atSeconds.toFixed(2)}s`;
    const file = outFile ?? path.join(config.outputDir, "frames", `${path.parse(abs).name}-${label}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(grabbed.dataUrl.split(",")[1], "base64"));
    return { file, video: abs, atSeconds: grabbed.atSeconds, durationSeconds: grabbed.durationSeconds, width: grabbed.width, height: grabbed.height };
  } finally {
    await tab.close().catch(() => {});
  }
}

/**
 * A frame of a local video file, or of a project video by media id (downloaded first if this
 * machine does not have it yet; that is free).
 */
export async function extractFrame(options: { video: string; projectId?: string; at?: FramePosition }): Promise<FrameResult> {
  const at = options.at ?? "last";
  let file = options.video;
  if (UUID.test(options.video)) {
    file = path.join(config.outputDir, `${options.video}.mp4`);
    if (!existsSync(file)) {
      if (!options.projectId) throw new Error("A media id needs its project_id, to download the video first.");
      const waited = await serialize(() => waitForMedia({ projectId: options.projectId!, mediaIds: [options.video], timeoutMs: 60_000 }));
      const got = waited.files.find((f) => f.id === options.video);
      if (!got) throw new Error(`Video ${options.video} is not ready to download yet (still rendering, or not a video in this project).`);
      file = got.file;
    }
  }
  const browser = await getBrowser();
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return frameFromFile(context, file, at);
}
