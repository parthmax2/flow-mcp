import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/*
 * Joins finished clips into one video on this machine with ffmpeg, optionally with a music or
 * voice-over track and fades. Nothing goes to Flow or any other service; it spends no credits.
 * Flow's own timeline (Scenebuilder) is not driven, so this is how a multi-shot piece becomes
 * one file. Every clip is re-encoded to the first clip's size and frame rate, so clips of
 * different sizes or without sound still join cleanly.
 */

export interface ClipInfo {
  width: number;
  height: number;
  fps: number;
  duration: number;
  hasAudio: boolean;
}

export interface AssembleOptions {
  clips: string[];
  /** Output .mp4 path; defaults to <output dir>/assembled/<time>.mp4. */
  output?: string;
  /** Music or voice-over file mixed over the whole video. */
  audio?: string;
  /** Volume of the added track, 1 = as is. */
  audioVolume?: number;
  /** Volume of the clips' own sound, 0 mutes it. */
  clipAudioVolume?: number;
  /** Fade in from and out to black and silence, in seconds (0 = none). */
  fade?: number;
}

export interface AssembleResult {
  file: string;
  seconds: number;
  width: number;
  height: number;
  clips: number;
  bytes: number;
}

export const FFMPEG_HELP =
  "ffmpeg is needed to join clips and was not found. Install it (Windows: winget install ffmpeg; macOS: brew install " +
  "ffmpeg; Linux: your package manager), or set FFMPEG_PATH to the ffmpeg program.";

export function ffmpegPath(): string {
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  const run = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (run.error || run.status !== 0) throw new Error(FFMPEG_HELP);
  return bin;
}

/** Reads size, frame rate, length and whether there is sound from `ffmpeg -i` output. */
export function parseProbe(stderr: string): ClipInfo {
  const video = stderr.match(/Stream #\S+.*?Video:.*?(\d{2,5})x(\d{2,5})/);
  if (!video) throw new Error("No video stream found");
  const fps = Number(stderr.match(/(\d+(?:\.\d+)?) fps/)?.[1] ?? stderr.match(/(\d+(?:\.\d+)?) tbr/)?.[1] ?? 24);
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  return { width: Number(video[1]), height: Number(video[2]), fps, duration, hasAudio: /Stream #\S+.*?Audio:/.test(stderr) };
}

function probe(bin: string, file: string): ClipInfo {
  const run = spawnSync(bin, ["-hide_banner", "-i", file], { encoding: "utf8" });
  try {
    return parseProbe(run.stderr ?? "");
  } catch {
    throw new Error(`Not a readable video: ${file}`);
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const num = (n: number) => Number(n.toFixed(3)).toString();

/** The ffmpeg arguments for joining probed clips; pure, so it can be tested without ffmpeg. */
export function buildArgs(clips: { file: string; info: ClipInfo }[], options: AssembleOptions & { output: string }): string[] {
  const first = clips[0].info;
  const width = even(first.width);
  const height = even(first.height);
  const fps = Math.min(Math.max(first.fps, 1), 60);
  const total = clips.reduce((sum, c) => sum + c.info.duration, 0);
  const clipVolume = options.clipAudioVolume ?? 1;
  const fade = Math.min(Math.max(options.fade ?? 0, 0), total / 2);

  const args = ["-hide_banner", "-y"];
  for (const c of clips) args.push("-i", c.file);
  if (options.audio) args.push("-i", options.audio);

  const parts: string[] = [];
  clips.forEach((c, i) => {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${num(fps)},format=yuv420p,trim=duration=${num(c.info.duration)},setpts=PTS-STARTPTS[v${i}]`,
    );
    // A clip without sound gets silence of its own length, so picture and sound stay in step.
    const source = c.info.hasAudio
      ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,`
      : `anullsrc=r=48000:cl=stereo,`;
    parts.push(`${source}atrim=duration=${num(c.info.duration)},asetpts=PTS-STARTPTS,volume=${num(clipVolume)}[a${i}]`);
  });
  parts.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[vcat][acat]`);

  let v = "[vcat]";
  let a = "[acat]";
  if (options.audio) {
    const n = clips.length;
    parts.push(
      `[${n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${num(options.audioVolume ?? 1)},apad,atrim=duration=${num(total)}[extra]`,
    );
    // normalize=0 keeps both tracks at the set volumes; the limiter stops the sum from clipping.
    parts.push(`${a}[extra]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[amix]`);
    a = "[amix]";
  }
  if (fade > 0) {
    const out = num(total - fade);
    parts.push(`${v}fade=t=in:st=0:d=${num(fade)},fade=t=out:st=${out}:d=${num(fade)}[vfade]`);
    parts.push(`${a}afade=t=in:st=0:d=${num(fade)},afade=t=out:st=${out}:d=${num(fade)}[afade]`);
    v = "[vfade]";
    a = "[afade]";
  }

  args.push("-filter_complex", parts.join(";"), "-map", v, "-map", a);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
  args.push(options.output);
  return args;
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    child.stderr.on("data", (d: Buffer) => (tail = (tail + d.toString()).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed (exit ${code}): ${tail.trim().split("\n").slice(-3).join(" ")}`)),
    );
  });
}

/**
 * Removes the sound track of a downloaded video in place (the picture is copied, not
 * re-encoded). Veo adds sound even when a prompt says "silent", so this is the reliable way
 * to get a silent clip. Returns false for files that are not videos.
 */
export async function stripAudio(file: string): Promise<boolean> {
  if (!/\.(mp4|mov|webm)$/i.test(file)) return false;
  const bin = ffmpegPath();
  const tmp = `${file}.silent${path.extname(file)}`;
  await runFfmpeg(bin, ["-hide_banner", "-y", "-i", file, "-map", "0:v", "-c:v", "copy", "-an", tmp]);
  renameSync(tmp, file);
  return true;
}

export async function assemble(options: AssembleOptions): Promise<AssembleResult> {
  if (options.clips.length === 0) throw new Error("Give at least one clip.");
  for (const file of [...options.clips, ...(options.audio ? [options.audio] : [])]) {
    if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  }
  const bin = ffmpegPath();
  const clips = options.clips.map((file) => ({ file, info: probe(bin, file) }));
  const output = path.resolve(
    options.output ?? path.join(config.outputDir, "assembled", `${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`),
  );
  if (!output.toLowerCase().endsWith(".mp4")) throw new Error("The output must be an .mp4 file.");
  mkdirSync(path.dirname(output), { recursive: true });

  await runFfmpeg(bin, buildArgs(clips, { ...options, output }));
  const result = probe(bin, output);
  return {
    file: output,
    seconds: Number(result.duration.toFixed(2)),
    width: result.width,
    height: result.height,
    clips: clips.length,
    bytes: statSync(output).size,
  };
}
