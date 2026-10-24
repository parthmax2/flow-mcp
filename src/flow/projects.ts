import type { Page } from "playwright-core";
import { callRpc } from "../browser/rpc.js";
import { loadRegistry } from "../state/registry.js";
import { parseBatchExecute } from "./batchexecute.js";

/*
 * Flow projects: listing them (with this tool's notes on purpose and uploads), naming them,
 * and starting a fresh agent session inside one.
 */

const PROJECT_LIST_RPC = "UpteDb";

export interface ProjectInfo {
  id: string;
  title: string;
  /** Epoch seconds of Flow's last update. */
  updatedAt?: number;
  /** What the project is for, as recorded when this tool created it. */
  purpose?: string;
  lastUsedAt?: string;
  /** Local files uploaded into it by this tool. */
  uploads: number;
}

/** Lists the account's Flow projects, most recently updated first, merged with local notes. */
export async function listProjects(page: Page): Promise<ProjectInfo[]> {
  const body = await callRpc(page, PROJECT_LIST_RPC, ["projects/*", 21, null, null, null, null, [1]]);
  const data = parseBatchExecute(body)[0]?.data;
  const local = loadRegistry().projects;
  const rows = (Array.isArray(data) && Array.isArray(data[0]) ? data[0] : []) as unknown[];
  return rows
    .filter((r): r is [string, [string, unknown, [number, number]?]] => Array.isArray(r) && typeof r[0] === "string")
    .map(([id, meta]) => {
      const note = local[id];
      return {
        id,
        title: note?.title ?? (Array.isArray(meta) && typeof meta[0] === "string" ? meta[0] : id),
        ...(Array.isArray(meta) && Array.isArray(meta[2]) ? { updatedAt: meta[2][0] } : {}),
        ...(note?.purpose ? { purpose: note.purpose } : {}),
        ...(note?.lastUsedAt ? { lastUsedAt: note.lastUsedAt } : {}),
        uploads: Object.keys(note?.uploads ?? {}).length,
      };
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Renames the open project through its editable title field. */
export async function setProjectTitle(page: Page, title: string): Promise<void> {
  const field = page.locator('input[aria-label="Editable text"]').first();
  await field.click({ timeout: 15_000 });
  await field.fill(title);
  await field.press("Enter");
  // Leave the field so the edit is committed and nothing keeps the page "busy" for reloads.
  await field.blur();
  await page.waitForTimeout(1_500);
}

/** Starts a fresh agent chat in the open project: the media stays, the conversation memory does not. */
export async function startNewSession(page: Page): Promise<void> {
  await page.locator("flow-agent-panel").getByRole("button", { name: "Start new session" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
}
