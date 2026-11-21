import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/*
 * Where finished files go and what they are called. Every file is saved the moment it exists,
 * under a name a person can read ("red-paper-boat-on-a-calm-pond-ad25fe57.jpg": the prompt or
 * caption plus the first eight characters of the media id), in:
 *
 *   <output folder>/<project id>/raw/        images and videos exactly as Flow made them
 *   <output folder>/<project id>/upscaled/   2K / 4K versions
 *
 * A tool call can choose its own folder with save_to (for example a "raw" folder inside the
 * user's own project); then everything for that call is saved straight into it.
 */

const override = new AsyncLocalStorage<string>();

/** Runs work with every file saved into `folder` instead of the default project folder. */
export function withSaveFolder<T>(folder: string, work: () => T): T {
  return override.run(path.resolve(folder), work);
}

export const rawDir = (projectId: string): string => override.getStore() ?? path.join(config.outputDir, projectId, "raw");
export const upscaledDir = (projectId: string): string => override.getStore() ?? path.join(config.outputDir, projectId, "upscaled");

/** Where files were saved before the raw/ layout: the project folder, and the output folder itself. */
const legacyDirs = (projectId?: string): string[] => [...(projectId ? [path.join(config.outputDir, projectId)] : []), config.outputDir];

/** "A red paper boat, at dawn!" becomes "a-red-paper-boat-at-dawn". */
export function slugify(text: string, max = 48): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug;
  // Cut at a word boundary where there is one.
  const cut = slug.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf("-"), Math.floor(max / 2))).replace(/-+$/g, "");
}

/** The file name without its extension: readable text plus the short id, or the full id when there is no text. */
export function mediaBaseName(media: { id: string; prompt?: string }): string {
  const slug = media.prompt ? slugify(media.prompt) : "";
  return slug ? `${slug}-${media.id.slice(0, 8)}` : media.id;
}

export const mediaFileName = (media: { id: string; prompt?: string }, ext: string): string => `${mediaBaseName(media)}.${ext}`;

/**
 * A saved file for a media id, wherever this or an older version put it: the call's own folder,
 * raw/, the project folder and the output folder. `size` looks for an upscale ("2k") instead of the original.
 */
export function findSavedMedia(projectId: string | undefined, id: string, size?: string): string | undefined {
  const short = id.slice(0, 8);
  const dirs = [...(override.getStore() ? [override.getStore()!] : []), ...(projectId ? [rawDir(projectId), upscaledDir(projectId)] : []), ...legacyDirs(projectId)];
  const matches = (name: string): boolean => {
    const dot = name.lastIndexOf(".");
    const base = dot < 0 ? name : name.slice(0, dot);
    if (size) return base === `${id}-${size}` || base.endsWith(`-${short}-${size}`) || base === `${short}-${size}`;
    return base === id || base.endsWith(`-${short}`);
  };
  for (const dir of [...new Set(dirs)]) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir, { withFileTypes: true }).find((e) => e.isFile() && !e.name.endsWith(".part") && matches(e.name));
    if (hit) return path.join(dir, hit.name);
  }
  return undefined;
}
