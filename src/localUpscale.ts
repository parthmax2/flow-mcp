import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { ffmpegPath, runFfmpeg } from "./assemble.js";
import type { UpscaleResult } from "./flow/upscale.js";
import { upscaledDir } from "./storage.js";

/*
 * A plain 2x enlargement made on this computer (Lanczos resampling with a light sharpen), for
 * the images Flow's viewer will not open. It adds no detail the way Flow's own upscaler does,
 * so the result says method "local" and the file name ends in "-2k-local".
 */
export async function localUpscale(projectId: string, mediaId: string, rawFile: string): Promise<UpscaleResult> {
  const dir = upscaledDir(projectId);
  mkdirSync(dir, { recursive: true });
  const base = path.basename(rawFile, path.extname(rawFile));
  const target = path.join(dir, `${base}-2k-local.jpg`);
  await runFfmpeg(ffmpegPath(), ["-hide_banner", "-y", "-i", rawFile, "-vf", "scale=iw*2:ih*2:flags=lanczos,unsharp=5:5:0.5", "-q:v", "2", target]);
  return { mediaId, size: "2K (local)", file: target, bytes: statSync(target).size, method: "local" };
}
