import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright-core";

const SUPPORTED = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".webm"]);
const STAGING = path.join(os.tmpdir(), "flow-mcp-uploads");

export function checkUploadable(file: string): string {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  if (!SUPPORTED.has(path.extname(abs).toLowerCase())) {
    throw new Error(`Flow accepts png, jpg, webp images and mp4, mov, webm videos, not ${path.basename(abs)}`);
  }
  return abs;
}

export class RightsNotConfirmedError extends Error {
  constructor(name: string) {
    super(
      `Flow asks whoever uploads ${name} to confirm they hold the rights to it. Nothing was uploaded. Ask the user; ` +
        "if they hold the rights, repeat the request with confirm_rights true (or they can allow it for good in `flow-mcp setup`).",
    );
  }
}

/**
 * Uploads a local image or video into the open Flow project under the given name (Flow
 * names uploads after the file, so a staged copy carries the unique name).
 *
 * Flow asks the uploader to confirm they hold the rights to the file. That notice is only
 * accepted when the user said so (confirmRights); otherwise the upload is cancelled.
 */
export async function uploadFile(page: Page, file: string, asName: string, confirmRights: boolean): Promise<void> {
  const abs = checkUploadable(file);
  mkdirSync(STAGING, { recursive: true });
  const staged = path.join(STAGING, asName);
  copyFileSync(abs, staged);

  await page.getByRole("button", { name: "Add media menu" }).click({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
  await page.getByRole("menuitem", { name: /upload/i }).click();
  await (await chooser).setFiles(staged);

  // Exact match: video uploads also offer "I agree, do not show again".
  const agree = page.getByRole("button", { name: "I agree", exact: true });
  // The rights notice can be skipped by Flow, so its absence is not an error.
  const asked = await agree
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!asked) return;
  if (confirmRights) {
    await agree.click();
    return;
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
  throw new RightsNotConfirmedError(path.basename(file));
}
