import { mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
import { config } from "../config.js";
import { step } from "../jobs.js";
import { findSavedMedia, upscaledDir } from "../storage.js";
import { listAssets } from "./assets.js";
import { touchProject } from "../state/registry.js";

/*
 * Download sizes and upscaling through the media viewer's download menu. For images Flow
 * offers 1K (original), 2K (upscaled, free) and 4K (upscaled, paid plans); the upscale runs
 * when the size is picked and arrives as a browser download.
 */

export const SIZES = { "1k": "1K", "2k": "2K", "4k": "4K" } as const;
export type Size = keyof typeof SIZES;

export interface DownloadOption {
  size: string;
  label: string;
  /** False when Flow shows the size as locked (needs a plan upgrade). */
  available: boolean;
}

/*
 * Flow's viewer only opens an image's newest version: an image that was edited (used as the
 * source of an edit) opens as a blank page whose Download button stays disabled. That used to
 * show up as a 60 s timeout; now it is named at once, with the newer versions to use instead.
 */
export class ViewerUnavailableError extends Error {
  constructor(
    readonly mediaId: string,
    readonly newer: string[],
  ) {
    super(
      `Flow's viewer did not open image ${mediaId}. ` +
        (newer.length
          ? `It was edited and Flow only opens the newest version: use ${newer.join(" or ")} instead. `
          : "It is usually an older version of an edited image, or one Flow has not finished saving. ") +
        "Or pass allow_local to make a 2x copy on this computer (plain resampling, not Flow's upscaler); flow_download still gives the original file.",
    );
    this.name = "ViewerUnavailableError";
  }
}

/**
 * The images made from this one that Flow can still open: those no later edit was made from,
 * newest first. (An edit of an edit leaves the middle version blank too.)
 */
export function latestVersions(assets: { id: string; kind: string; createdAt?: number; references?: string[] }[], mediaId: string): string[] {
  // Everything made from this image, directly or through later edits.
  const descendants = new Map<string, (typeof assets)[number]>();
  const queue = [mediaId];
  while (queue.length) {
    const from = queue.shift()!;
    for (const a of assets) {
      if (a.kind === "image" && a.references?.includes(from) && !descendants.has(a.id) && a.id !== mediaId) {
        descendants.set(a.id, a);
        queue.push(a.id);
      }
    }
  }
  const edited = new Set(assets.flatMap((a) => a.references ?? []));
  const newest = [...descendants.values()].filter((a) => !edited.has(a.id));
  return (newest.length ? newest : [...descendants.values()])
    .sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))
    .slice(0, 3)
    .map((a) => a.id);
}

async function newerVersions(page: Page, mediaId: string): Promise<string[]> {
  return latestVersions(await listAssets(page), mediaId);
}

async function openViewer(page: Page, projectId: string, mediaId: string): Promise<void> {
  // The viewer is its own page, so going there directly saves loading the project first.
  touchProject(projectId);
  await page.goto(`${new URL(config.flowUrl).origin}/project/${projectId}/edit/${mediaId}`, { waitUntil: "domcontentloaded" });
  // The download button stays disabled until the media has loaded; a normal image takes about 3 s.
  try {
    await page.locator('button[aria-label="Download media"]:not([disabled])').waitFor({ timeout: 20_000 });
  } catch {
    throw new ViewerUnavailableError(mediaId, await newerVersions(page, mediaId).catch(() => []));
  }
}

const menuItems = (page: Page) => page.locator(".cdk-overlay-container").locator("button, [role=menuitem]");

async function readOptions(page: Page): Promise<DownloadOption[]> {
  const items = menuItems(page);
  const options: DownloadOption[] = [];
  for (let i = 0; i < (await items.count()); i++) {
    const item = items.nth(i);
    const label = (await item.innerText()).replace(/\s+/g, " ").trim();
    const size = label.match(/^(\d+K|\d+p)\b/i)?.[1];
    if (!size) continue;
    const disabled = (await item.getAttribute("disabled")) !== null || (await item.getAttribute("aria-disabled")) === "true";
    options.push({ size, label, available: !disabled });
  }
  return options;
}

/** Lists the download sizes Flow offers for a media item on this account. */
export async function downloadOptions(page: Page, projectId: string, mediaId: string): Promise<DownloadOption[]> {
  await openViewer(page, projectId, mediaId);
  await page.getByRole("button", { name: "Download media" }).click();
  await menuItems(page).first().waitFor({ timeout: 10_000 });
  try {
    return await readOptions(page);
  } finally {
    await page.keyboard.press("Escape");
  }
}

export interface UpscaleResult {
  mediaId: string;
  size: string;
  file: string;
  bytes: number;
  /** "flow": Flow's own upscaler. "local": a plain 2x resample made on this computer (allow_local). */
  method?: "flow" | "local";
}

/**
 * Downloads a media item at the given size, upscaling it in Flow when the size calls for it.
 * Flow takes ~15 s for 2K and longer for 4K with nothing to show meanwhile, so progress is
 * reported every few seconds to tell the client the call is alive.
 */
export async function upscale(page: Page, projectId: string, mediaId: string, size: Size, onProgress?: (message: string) => void): Promise<UpscaleResult> {
  const dir = upscaledDir(projectId);
  mkdirSync(dir, { recursive: true });
  // An earlier upscale of the same media and size: Flow's result does not change, so it is reused.
  const saved = findSavedMedia(projectId, mediaId, size);
  if (saved) return { mediaId, size: SIZES[size], file: saved, bytes: statSync(saved).size, method: "flow" };
  onProgress?.("opening the media in Flow");
  await openViewer(page, projectId, mediaId);
  await page.getByRole("button", { name: "Download media" }).click();
  await menuItems(page).first().waitFor({ timeout: 10_000 });
  const options = await readOptions(page);
  const wanted = options.find((o) => o.size.toUpperCase() === SIZES[size]);
  if (!wanted || !wanted.available) {
    await page.keyboard.press("Escape");
    const offered = options.map((o) => `${o.size}${o.available ? "" : " (locked: needs a plan upgrade)"}`).join(", ");
    throw new Error(`${SIZES[size]} is not available for this media. Offered: ${offered || "none"}.`);
  }
  // 2K arrives in about 15-20 s; 4K takes longer. A wait of five minutes only hid a stuck upscale.
  const waitSeconds = size === "2k" ? 90 : 240;
  const download = page.waitForEvent("download", { timeout: waitSeconds * 1000 });
  await menuItems(page).filter({ hasText: new RegExp(`^\\s*${SIZES[size]}\\b`) }).first().click();
  const startedAt = Date.now();
  const ticker = setInterval(() => onProgress?.(`Flow is upscaling to ${SIZES[size]} (${Math.round((Date.now() - startedAt) / 1000)} s)`), 5_000);
  const file = await download
    .catch(() => {
      throw new Error(`Flow did not deliver the ${SIZES[size]} file within ${waitSeconds} s. It may still be upscaling: try again in a minute (nothing is charged for a free upscale).`);
    })
    .finally(() => clearInterval(ticker));
  const ext = path.extname(file.suggestedFilename()) || ".bin";
  // Named after the original's file when it is saved ("red-paper-boat-ad25fe57-2k.jpg"), else after the id.
  const raw = findSavedMedia(projectId, mediaId);
  const base = raw ? path.basename(raw, path.extname(raw)) : mediaId;
  const target = path.join(dir, `${base}-${size}${ext}`);
  // Saved under a temporary name first, so a half-written file is never reused as finished.
  await file.saveAs(`${target}.part`);
  renameSync(`${target}.part`, target);
  step(`Saved ${path.basename(target)}`, { icon: "⬇️", detail: target });
  return { mediaId, size: SIZES[size], file: target, bytes: statSync(target).size, method: "flow" };
}
