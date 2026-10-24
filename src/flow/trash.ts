import { createHash } from "node:crypto";
import type { Page } from "playwright-core";
import { config } from "../config.js";
import { listAssets, type Asset } from "./assets.js";
import { openProject } from "./ui.js";

/*
 * Moving project media to Flow's trash (restorable from Flow's "View trash"), always in two
 * steps: a preview that names exactly what would go and returns a confirmation code for that
 * set, then the move itself, which only runs with that code. Flow asks no question of its
 * own; it only shows an Undo toast.
 */

export interface DuplicateGroup {
  title: string;
  /** The copy to keep: one that generated media used, otherwise the oldest. */
  keep: string;
  extras: string[];
}

/**
 * Other media that trashing these items would take along: Flow trashes whole workflows, and a
 * workflow can hold an upload together with media generated from it (e.g. a video edit).
 */
export function alsoAffected(assets: Asset[], mediaIds: string[]): Asset[] {
  const workflows = new Set(assets.filter((a) => mediaIds.includes(a.id)).map((a) => a.workflowId));
  return assets.filter((a) => !mediaIds.includes(a.id) && a.workflowId !== undefined && workflows.has(a.workflowId));
}

/** Groups uploads of the same file (same title, size and length) and picks which copy to keep. */
export function findDuplicateUploads(assets: Asset[]): DuplicateGroup[] {
  const referenced = new Set(assets.flatMap((a) => a.references ?? []));
  // Protected copies are never offered: generated media was made from them, or trashing them
  // would take other media in their workflow along. They are preferred as the copy to keep.
  const isProtected = (a: Asset) => referenced.has(a.id) || alsoAffected(assets, [a.id]).length > 0;
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    if (a.source !== "uploaded" || a.trashed) continue;
    const key = [a.title, a.kind, a.width, a.height, a.durationSeconds?.toFixed(2)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const result: DuplicateGroup[] = [];
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    const oldestFirst = [...copies].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
    const keep = oldestFirst.find(isProtected) ?? oldestFirst[0];
    const extras = oldestFirst.filter((c) => c !== keep && !isProtected(c)).map((c) => c.id);
    if (extras.length) result.push({ title: copies[0].title, keep: keep.id, extras });
  }
  return result;
}

/** A code bound to exactly this project and set of media, so a confirmation cannot be reused for another set. */
export function confirmationCode(projectId: string, mediaIds: string[]): string {
  return createHash("sha256")
    .update([projectId, ...[...mediaIds].sort()].join("\n"))
    .digest("hex")
    .slice(0, 10);
}

export interface TrashPreviewItem {
  id: string;
  title: string;
  kind: Asset["kind"];
  source: Asset["source"];
  /** Generated media in the project that was made from this item. */
  usedBy: string[];
}

export interface TrashPreview {
  projectId: string;
  items: TrashPreviewItem[];
  /** Media that would go to the trash too (same workflow). Moving is refused until they are included. */
  alsoAffected: TrashPreviewItem[];
  /** Pass this back to trashMedia to move exactly these items. Absent while alsoAffected is not empty. */
  confirmation?: string;
}

export async function previewTrash(page: Page, projectId: string, mediaIds: string[]): Promise<TrashPreview> {
  await openProject(page, { projectId });
  const assets = await listAssets(page);
  const describe = (asset: Asset): TrashPreviewItem => ({
    id: asset.id,
    title: asset.title,
    kind: asset.kind,
    source: asset.source,
    usedBy: assets.filter((a) => a.references?.includes(asset.id)).map((a) => a.id),
  });
  const items = mediaIds.map((id) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new Error(`Media ${id} is not in this project (or already in its trash).`);
    return describe(asset);
  });
  const affected = alsoAffected(assets, mediaIds).map(describe);
  return { projectId, items, alsoAffected: affected, ...(affected.length ? {} : { confirmation: confirmationCode(projectId, mediaIds) }) };
}

export interface TrashResult {
  projectId: string;
  trashed: string[];
  failed: { id: string; error: string }[];
}

/** Moves media to Flow's trash. Requires the confirmation code from previewTrash for this exact set. */
export async function trashMedia(page: Page, projectId: string, mediaIds: string[], confirmation: string): Promise<TrashResult> {
  if (confirmation !== confirmationCode(projectId, mediaIds)) {
    throw new Error("The confirmation does not match this set of media. Preview it again and confirm the new list.");
  }
  await openProject(page, { projectId });
  const before = await listAssets(page);
  const affected = alsoAffected(before, mediaIds);
  if (affected.length) {
    throw new Error(
      `Trashing these would also trash ${affected.map((a) => `${a.id} ("${a.title}", ${a.source} ${a.kind})`).join(", ")}, ` +
        "which share a workflow with them in Flow. Nothing was moved; include those ids if they should go too.",
    );
  }
  const result: TrashResult = { projectId, trashed: [], failed: [] };
  for (const id of mediaIds) {
    try {
      await page.goto(`${new URL(config.flowUrl).origin}/project/${projectId}/edit/${id}`, { waitUntil: "domcontentloaded" });
      const trash = page.locator('button[aria-label="Move to trash"]:not([disabled])');
      await trash.waitFor({ timeout: 60_000 });
      await trash.click();
      await page.getByText(/moved to trash/i).first().waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Dismiss" }).click({ timeout: 3_000 }).catch(() => {});
      result.trashed.push(id);
    } catch (err) {
      result.failed.push({ id, error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
    }
  }
  // Confirm against Flow's own trashed flag rather than trusting the toast alone. Flow
  // commits the move a few seconds after its Undo toast, so the flag can lag behind.
  await openProject(page, { projectId });
  let after = await listAssets(page, true);
  const isTrashed = (id: string) => !!after.find((a) => a.id === id)?.trashed;
  for (let i = 0; i < 10 && !result.trashed.every(isTrashed); i++) {
    await page.waitForTimeout(3_000);
    after = await listAssets(page, true);
  }
  for (const id of [...result.trashed]) {
    if (!isTrashed(id)) {
      result.trashed = result.trashed.filter((t) => t !== id);
      result.failed.push({ id, error: "Flow does not show it as trashed" });
    }
  }
  return result;
}
