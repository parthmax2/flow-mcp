import { statSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
import { config } from "../config.js";
import { openProject } from "./ui.js";

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

async function openViewer(page: Page, projectId: string, mediaId: string): Promise<void> {
  await openProject(page, { projectId });
  await page.goto(`${new URL(config.flowUrl).origin}/project/${projectId}/edit/${mediaId}`, { waitUntil: "domcontentloaded" });
  // The download button stays disabled until the media has loaded.
  await page.locator('button[aria-label="Download media"]:not([disabled])').waitFor({ timeout: 60_000 });
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
}

/** Downloads a media item at the given size, upscaling it in Flow when the size calls for it. */
export async function upscale(page: Page, projectId: string, mediaId: string, size: Size): Promise<UpscaleResult> {
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
  const download = page.waitForEvent("download", { timeout: 300_000 });
  await menuItems(page).filter({ hasText: new RegExp(`^\\s*${SIZES[size]}\\b`) }).first().click();
  const file = await download;
  const ext = path.extname(file.suggestedFilename()) || ".bin";
  const target = path.join(config.outputDir, `${mediaId}-${size}${ext}`);
  await file.saveAs(target);
  return { mediaId, size: SIZES[size], file: target, bytes: statSync(target).size };
}
