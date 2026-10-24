import path from "node:path";
import type { Page } from "playwright-core";
import { callRpc } from "../browser/rpc.js";
import { uploadRightsConfirmed } from "../state/preferences.js";
import { forgetUpload, getProject, hashFile, recordUpload, uniqueName } from "../state/registry.js";
import { extractMedia, parseBatchExecute } from "./batchexecute.js";
import { projectIdOf } from "./ui.js";
import { checkUploadable, uploadFile } from "./upload.js";

/*
 * The media inside a Flow project, and attaching it to the agent prompt by id. Local files
 * are uploaded once per project under a content-unique name and reused afterwards.
 */

const PROJECT_MEDIA_RPC = "Zzl0ze";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Asset {
  id: string;
  /** Flow groups an item with its versions (e.g. a video edit with its source) in one workflow; trashing acts on it. */
  workflowId?: string;
  /** The title Flow shows in its asset picker: the file name for uploads. */
  title: string;
  kind: "image" | "video";
  source: "uploaded" | "generated";
  model?: string;
  prompt?: string;
  createdAt?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** For generated media: the project media it was made from (attached references). */
  references?: string[];
  /** In Flow's trash (restorable there). */
  trashed?: boolean;
  /** Token of the asset's preview image, which the picker's thumbnails also use. */
  previewToken?: string;
}

type Json = unknown;

function find<T>(value: Json, pick: (v: Json) => T | undefined): T | undefined {
  const hit = pick(value);
  if (hit !== undefined) return hit;
  if (Array.isArray(value)) for (const v of value) {
    const found = find(v, pick);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** [width, height, [seconds, nanos]] for videos, or [width, height] after an image's mime type. */
function dimensions(record: Json): { width: number; height: number; durationSeconds?: number } | undefined {
  return find(record, (v) => {
    if (!Array.isArray(v) || typeof v[0] !== "number" || typeof v[1] !== "number" || v[0] < 16 || v[1] < 16 || v[0] > 10000) return undefined;
    if (v.length === 3 && Array.isArray(v[2]) && typeof v[2][0] === "number") {
      return { width: v[0], height: v[1], durationSeconds: v[2][0] + (v[2][1] ?? 0) / 1e9 };
    }
    return v.length === 2 ? { width: v[0], height: v[1] } : undefined;
  });
}

const previewToken = (record: Json) =>
  find(record, (v) => (typeof v === "string" ? v.match(/\/asb\/([\w-]{20,})/)?.[1]?.slice(0, 60) : undefined));

/** Builds the asset list from the project's media RPC payload: [, workflows, media, ...]. */
export function parseAssets(data: Json): Asset[] {
  if (!Array.isArray(data)) return [];
  const titles = new Map<string, string>();
  // A workflow moved to Flow's trash stays listed, flagged by true in its metadata.
  const trashed = new Set<string>();
  for (const w of (data[1] ?? []) as Json[]) {
    if (Array.isArray(w) && typeof w[0] === "string" && Array.isArray(w[3]) && typeof w[3][0] === "string") {
      titles.set(w[0], safeDecode(w[3][0]));
      if (w[3][2] === true) trashed.add(w[0]);
    }
  }
  const known = extractMedia(data[2]);
  const assets: Asset[] = [];
  for (const record of (data[2] ?? []) as Json[]) {
    if (!Array.isArray(record) || typeof record[0] !== "string" || !UUID.test(record[0])) continue;
    const id = record[0];
    const media = known.get(id);
    const dims = dimensions(record);
    // record[5][6] holds the generation request: model, prompt, references. Uploads leave it empty.
    const request = Array.isArray(record[5]) ? (record[5] as Json[])[6] : undefined;
    const generated = !!media?.model || (Array.isArray(request) && (request[1] != null || request[2] != null));
    // Sources sit in different places per kind (image references, a video edit's source clip
    // and face photo), so every media id named anywhere in the request counts.
    const references = new Set<string>();
    if (Array.isArray(request)) {
      find(request, (v) => void (typeof v === "string" && UUID.test(v) && v !== id && v !== record[1] && references.add(v)));
    }
    assets.push({
      id,
      workflowId: record[2] as string,
      title: titles.get(record[2] as string) ?? media?.prompt ?? id,
      kind: dims?.durationSeconds !== undefined || media?.kind === "video" ? "video" : "image",
      source: generated ? "generated" : "uploaded",
      ...(trashed.has(record[2] as string) ? { trashed: true } : {}),
      ...(references.size ? { references: [...references] } : {}),
      ...(media?.model ? { model: media.model } : {}),
      ...(media?.prompt ? { prompt: media.prompt } : {}),
      ...(media?.createdAt ? { createdAt: media.createdAt } : {}),
      ...(dims ?? {}),
      ...(previewToken(record) ? { previewToken: previewToken(record) } : {}),
    });
  }
  return assets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Returns the open project's media, newest first; items in Flow's trash only when asked. */
export async function listAssets(page: Page, includeTrashed = false): Promise<Asset[]> {
  const projectId = projectIdOf(page.url());
  if (!projectId) throw new Error("No Flow project is open");
  const body = await callRpc(page, PROJECT_MEDIA_RPC, [`projects/${projectId}`, null, null, null, [1]]);
  const assets = parseAssets(parseBatchExecute(body)[0]?.data);
  return includeTrashed ? assets : assets.filter((a) => !a.trashed);
}

const matchesTitle = (asset: Asset, name: string) => asset.title === name || asset.title === path.parse(name).name;

export interface PreparedAttachments {
  mediaIds: string[];
  /** Files uploaded now; the rest were already in the project. */
  uploaded: string[];
  reused: string[];
  /** The project's media as last listed. */
  assets: Asset[];
}

/**
 * Makes sure each local file is in the project, uploading only what is missing, and returns
 * the media ids in the order given. Uploads are recorded per project by content hash.
 */
export async function ensureUploaded(page: Page, projectId: string, files: string[], confirmRights = false): Promise<PreparedAttachments> {
  const result: PreparedAttachments = { mediaIds: [], uploaded: [], reused: [], assets: [] };
  if (files.length === 0) return result;
  const entries = files.map((f) => {
    const abs = checkUploadable(f);
    const hash = hashFile(abs);
    return { abs, hash, flowName: uniqueName(abs, hash) };
  });

  let assets = await listAssets(page);
  const record = getProject(projectId);
  const missing = entries.filter((e) => {
    const known = record?.uploads[e.hash];
    if (known && assets.some((a) => a.id === known.mediaId)) return false;
    // Deleted in Flow since (or never recorded): upload it, unless an upload with this exact name is already there.
    if (known) forgetUpload(projectId, e.hash);
    return !assets.some((a) => a.source === "uploaded" && matchesTitle(a, e.flowName));
  });

  const rights = uploadRightsConfirmed(confirmRights);
  for (const e of missing) await uploadFile(page, e.abs, e.flowName, rights);
  if (missing.length) {
    // Uploads (videos especially) take a moment to be listed.
    for (let i = 0; i < 12; i++) {
      assets = await listAssets(page);
      if (missing.every((e) => assets.some((a) => matchesTitle(a, e.flowName)))) break;
      await page.waitForTimeout(5_000);
    }
  }

  for (const e of entries) {
    const asset =
      assets.find((a) => a.id === getProject(projectId)?.uploads[e.hash]?.mediaId) ??
      assets.find((a) => a.source === "uploaded" && matchesTitle(a, e.flowName));
    if (!asset) throw new Error(`Uploaded ${path.basename(e.abs)} as ${e.flowName}, but it did not appear in the project.`);
    recordUpload(projectId, e.hash, { mediaId: asset.id, flowName: e.flowName, file: e.abs, uploadedAt: new Date().toISOString() });
    result.mediaIds.push(asset.id);
    (missing.includes(e) ? result.uploaded : result.reused).push(path.basename(e.abs));
  }
  result.assets = assets;
  return result;
}

export interface Inputs {
  /** Local files (uploaded once per project, then reused). */
  files?: string[];
  /** The user confirmed they hold the rights to these files (Flow asks on upload). */
  confirmRights?: boolean;
  /** Media already in the project, from flow_assets. */
  mediaIds?: string[];
}

export type AttachedInputs = Omit<PreparedAttachments, "assets">;

/** Uploads what is missing and attaches files and project media to the prompt, in that order. */
export async function attachInputs(page: Page, projectId: string, inputs: Inputs): Promise<AttachedInputs> {
  const files = inputs.files ?? [];
  const extra = inputs.mediaIds ?? [];
  if (files.length === 0 && extra.length === 0) return { mediaIds: [], uploaded: [], reused: [] };
  const prepared = await ensureUploaded(page, projectId, files, inputs.confirmRights);
  const assets = prepared.assets.length ? prepared.assets : await listAssets(page);
  const mediaIds = [...prepared.mediaIds, ...extra];
  await attachMedia(page, mediaIds, assets);
  return { mediaIds, uploaded: prepared.uploaded, reused: prepared.reused };
}

/** Puts project media into the agent prompt through Flow's asset picker, by media id. */
export async function attachMedia(page: Page, mediaIds: string[], assets: Asset[]): Promise<void> {
  for (const id of mediaIds) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new Error(`Media ${id} is not in this project; list it with flow_assets.`);
    await page.getByRole("button", { name: "Add ingredients to the prompt box" }).click({ timeout: 30_000 });
    await pickAsset(page, asset);
    // Picking an image attaches it at once and closes the picker (its confirm button can still
    // be visible mid-animation). Picking a video opens a trim preview that needs the confirm.
    // The video preview can take a while to load (a padded 1280x720 clip took over 5 s), and
    // sometimes a video is attached at once like an image. Either way the picker must close.
    const confirm = page.getByRole("button", { name: "Add to prompt" });
    const search = page.locator('input[aria-label="Search assets"]');
    await Promise.race([
      confirm.click({ timeout: asset.kind === "video" ? 30_000 : 5_000 }),
      search.waitFor({ state: "hidden", timeout: 30_000 }),
    ]).catch(() => {});
    if (await search.isVisible()) {
      await page.keyboard.press("Escape").catch(() => {});
      throw new Error(`Flow's asset picker did not attach "${asset.title}" (${id}).`);
    }
  }
}

/**
 * Clicks this media's tile in an open Flow asset picker (the agent prompt's, or the Characters
 * page's "Add from project"): found by its thumbnail, falling back to its title.
 */
export async function pickAsset(page: Page, asset: Asset): Promise<void> {
  const id = asset.id;
  const search = page.locator('input[aria-label="Search assets"]');
  const options = page.getByRole("option");
  const thumb = options.filter({ has: page.locator(`img[src*="${asset.previewToken ?? id}"], img[src*="${id}"]`) }).first();
  const shows = (target: typeof thumb, timeout: number) => target.waitFor({ state: "visible", timeout }).then(() => true, () => false);

  // Search by title (long generated titles are stored cut short with "…", which the search
  // would not match). Failing that, scroll the full list, which loads more as it scrolls.
  const title = asset.title.replace(/…$/, "");
  // The picker reopens on the tab used last (e.g. Characters, after attaching a character).
  await page.locator("mat-list-item").filter({ hasText: /^\W*dashboard\s*All\s*$/ }).first().click({ timeout: 5_000 }).catch(() => {});
  await search.fill(title.slice(0, 60), { timeout: 5_000 }).catch(() => {});
  let option = thumb;
  if (!(await shows(thumb, 3_000))) {
    // Video tiles show a frame whose URL does not name the media, so a single title match
    // among the search results is taken as is.
    const byTitle = options.filter({ hasText: title });
    if ((await byTitle.count()) === 1) option = byTitle.first();
    else {
      await search.fill("", { timeout: 5_000 }).catch(() => {});
      let found = await shows(thumb, 2_000);
      for (let i = 0; i < 15 && !found; i++) {
        await options.last().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        found = await shows(thumb, 800);
      }
      if (!found) option = options.filter({ hasText: title }).first();
    }
  }
  try {
    await option.click({ timeout: 10_000 });
  } catch {
    // Leave no picker open behind: it would block whatever runs next in this tab.
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(`Could not find "${asset.title}" (${id}) in Flow's asset picker.`);
  }
}
