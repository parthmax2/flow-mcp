import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assemble, buildArgs, parseProbe } from "../src/assemble.js";

const PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'shot1.mp4':
  Duration: 00:00:08.04, start: 0.000000, bitrate: 2950 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1280x720 [SAR 1:1 DAR 16:9], 2800 kb/s, 24 fps, 24 tbr, 12288 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)`;

describe("assemble", () => {
  it("reads size, frame rate, length and sound from ffmpeg's output", () => {
    expect(parseProbe(PROBE)).toEqual({ width: 1280, height: 720, fps: 24, duration: 8.04, hasAudio: true });
    expect(parseProbe(PROBE.replace(/\n.*Audio:.*$/, "")).hasAudio).toBe(false);
    expect(() => parseProbe("Invalid data found")).toThrow();
  });

  it("joins clips at the first clip's size and gives silent clips silence", () => {
    const a = { file: "a.mp4", info: { width: 1280, height: 720, fps: 24, duration: 8, hasAudio: true } };
    const b = { file: "b.mp4", info: { width: 720, height: 1280, fps: 30, duration: 4, hasAudio: false } };
    const args = buildArgs([a, b], { clips: [], output: "out.mp4" });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720");
    expect(graph).toContain("fps=24");
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=4");
    expect(graph).toContain("concat=n=2:v=1:a=1");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("mixes an added track over the whole length and fades both ends", () => {
    const a = { file: "a.mp4", info: { width: 1280, height: 720, fps: 24, duration: 8, hasAudio: true } };
    const args = buildArgs([a, a], { clips: [], output: "out.mp4", audio: "song.mp3", audioVolume: 0.5, clipAudioVolume: 0, fade: 1 });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(args).toContain("song.mp3");
    expect(graph).toContain("[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.5,apad,atrim=duration=16[extra]");
    expect(graph).toContain("volume=0[a0]");
    expect(graph).toContain("amix=inputs=2:duration=first:normalize=0");
    expect(graph).toContain("fade=t=out:st=15:d=1");
    expect(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4)).toEqual(["-map", "[vfade]", "-map", "[afade]"]);
  });

  const hasFfmpeg = !spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]).error;
  it.skipIf(!hasFfmpeg)("joins real clips with ffmpeg", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "assemble-"));
    try {
      const make = (name: string, size: string, sound: boolean) => {
        const file = path.join(dir, name);
        const args = ["-hide_banner", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=24:duration=1`];
        if (sound) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest");
        spawnSync(process.env.FFMPEG_PATH || "ffmpeg", [...args, "-pix_fmt", "yuv420p", file]);
        return file;
      };
      const result = await assemble({
        clips: [make("a.mp4", "320x180", true), make("b.mp4", "180x320", false)],
        output: path.join(dir, "out.mp4"),
        fade: 0.2,
      });
      expect(result.width).toBe(320);
      expect(result.height).toBe(180);
      expect(result.seconds).toBeGreaterThan(1.8);
      expect(result.seconds).toBeLessThan(2.3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
