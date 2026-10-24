import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
import { config } from "../config.js";
import { callRpc } from "../browser/rpc.js";
import { recordProject, touchProject } from "../state/registry.js";
import { parseBatchExecute, type FlowMedia } from "./batchexecute.js";
import { setProjectTitle, startNewSession } from "./projects.js";

/*
 * Shared steps for driving Flow's agent chat through its own UI, so the page performs its
 * own auth and verification exactly as when a person uses it.
 */

const PROMPT_BOX = { role: "textbox", name: "What do you want to create?" } as const;
const SEND_BUTTON = 'button[aria-label="Start generation"]';
const CREDITS_RPC = "nzlxg";

let queue: Promise<unknown> = Promise.resolve();

/** Everything shares one browser tab, so Flow operations run one at a time. */
export function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

export const projectIdOf = (url: string) => url.match(/\/project\/([0-9a-f-]{36})/)?.[1];

export interface ProjectChoice {
  /** Existing project to use. Without it or newProject, the open project is used. */
  projectId?: string;
  newProject?: boolean;
  /** Title for a new project, set in Flow so it is recognisable there too. */
  newProjectTitle?: string;
  /** What a new project is for, recorded locally to help choose projects later. */
  projectPurpose?: string;
  /** Start a fresh agent chat (media kept, conversation memory reset) before continuing. */
  newSession?: boolean;
}

export async function openProject(page: Page, choice: ProjectChoice): Promise<string> {
  const flow = new URL(config.flowUrl).origin;
  let projectId = choice.projectId;
  if (projectId) {
    // Sub-pages such as the media viewer (/project/<id>/edit/...) lack the project's controls.
    if (new URL(page.url()).pathname !== `/project/${projectId}`) {
      await page.goto(`${flow}/project/${projectId}`, { waitUntil: "domcontentloaded" });
    }
    touchProject(projectId);
  } else if (choice.newProject || choice.newProjectTitle) {
    if (new URL(page.url()).pathname !== "/") await page.goto(flow, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /new project/i }).click({ timeout: 30_000 });
    await page.waitForURL(/\/project\/[0-9a-f-]{36}/, { timeout: 30_000 });
    projectId = projectIdOf(page.url())!;
    if (choice.newProjectTitle) await setProjectTitle(page, choice.newProjectTitle);
    recordProject(projectId, { title: choice.newProjectTitle, purpose: choice.projectPurpose, createdAt: new Date().toISOString() });
  } else {
    projectId = projectIdOf(page.url());
    if (!projectId) throw new Error("No Flow project is open; pass a project id or ask for a new project.");
    if (new URL(page.url()).pathname !== `/project/${projectId}`) {
      await page.goto(`${flow}/project/${projectId}`, { waitUntil: "domcontentloaded" });
    }
    touchProject(projectId);
  }
  if (choice.newSession) await startNewSession(page);
  return projectId;
}

/**
 * Empties the prompt so text or attachments left by an interrupted run do not leak in, after
 * closing any picker or dialog such a run left open.
 */
export async function clearPrompt(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const clear = page.getByRole("button", { name: "Clear prompt" });
  if (await clear.isVisible().catch(() => false)) await clear.click();
}

export async function sendPrompt(page: Page, text: string): Promise<void> {
  const box = page.getByRole(PROMPT_BOX.role, { name: PROMPT_BOX.name });
  await box.click({ timeout: 30_000 });
  await box.fill(text);
  await page.locator(SEND_BUTTON).click({ timeout: 10_000 });
}

/**
 * Waits for the agent's turn to end. While it thinks or streams, the send button becomes a
 * Stop button; a typing indicator alone is not a reliable signal.
 */
export async function waitForAgentTurn(page: Page, timeoutMs = 300_000): Promise<void> {
  // Other prompt boxes on the page have their own Stop button; only the agent panel's counts.
  const stop = page.locator("flow-agent-panel").getByRole("button", { name: "Stop", exact: true });
  await stop.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await stop.waitFor({ state: "hidden", timeout: timeoutMs });
}

/** The text of the agent's latest message in the chat panel. */
export async function lastAgentMessage(page: Page): Promise<string> {
  const rows = page.locator(".agent-row");
  if ((await rows.count()) === 0) return "";
  return (await rows.last().innerText()).trim();
}

/** Reads the account's Flow credit balance. */
export async function readCredits(page: Page): Promise<number | undefined> {
  const body = await callRpc(page, CREDITS_RPC, []);
  const value = (parseBatchExecute(body)[0]?.data as unknown[] | undefined)?.[0];
  return typeof value === "number" ? value : undefined;
}

export interface DownloadedMedia extends FlowMedia {
  file: string;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

export async function download(page: Page, items: FlowMedia[]): Promise<DownloadedMedia[]> {
  mkdirSync(config.outputDir, { recursive: true });
  const out: DownloadedMedia[] = [];
  for (const m of items) {
    // The tab's request context carries the signed-in cookies some media URLs require.
    const res = await page.context().request.get(m.url);
    if (!res.ok()) throw new Error(`Downloading ${m.id} failed with HTTP ${res.status()}`);
    const type = (res.headers()["content-type"] ?? "").split(";")[0];
    const file = path.join(config.outputDir, `${m.id}.${EXT[type] ?? "bin"}`);
    writeFileSync(file, await res.body());
    out.push({ ...m, file });
  }
  return out;
}
