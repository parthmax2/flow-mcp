import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import { getConnectedBrowser } from "../browser/connect.js";
import { config } from "../config.js";
import { healed, jobsFolder, setFailureProbe } from "../jobs.js";

/*
 * The Flow site adapter: everything about how Flow's page looks lives here, so that when Flow
 * redesigns something there is one file to change. It holds
 *   - the controls the tool clicks, each with ordered alternatives (an old and a new place),
 *   - what to do about pop-ups that cover the page, and
 *   - the failure probe that names a blocker and saves a screenshot when a job fails.
 * Flow is matched by its English labels (roles, names, aria-labels), as AGENTS.md says.
 */

type Find = (page: Page) => Locator;

export interface ControlDef {
  /** What flow_status calls it when it is missing. */
  label: string;
  where: "home" | "project";
  /** Only on screen sometimes (or only in one layout): left out of the health check. */
  optional?: boolean;
  /** Alternatives in the order they were seen on Flow; any one that is on the page counts. */
  find: Find[];
}

export const CONTROLS = {
  newProject: {
    label: "New project button",
    where: "home",
    find: [(p) => p.getByRole("button", { name: /new project/i })],
  },
  promptBox: {
    label: "Prompt box",
    where: "project",
    find: [(p) => p.getByRole("textbox", { name: "What do you want to create?" })],
  },
  sendButton: {
    label: "Send button",
    where: "project",
    find: [(p) => p.locator('button[aria-label="Start generation"]')],
  },
  addMedia: {
    label: "Add media menu (uploads)",
    where: "project",
    find: [(p) => p.getByRole("button", { name: "Add media menu" })],
  },
  attach: {
    label: "Attach (ingredients) button",
    where: "project",
    find: [(p) => p.getByRole("button", { name: "Add ingredients to the prompt box" })],
  },
  agentSettings: {
    label: "Agent settings button",
    where: "project",
    find: [
      // November 2026 redesign: the button moved into the agent panel.
      (p) => p.locator("flow-agent-panel").getByRole("button", { name: "Agent settings" }),
      (p) => p.locator("flow-base-prompt-box").getByRole("button", { name: "Settings" }),
    ],
  },
  sessionHistory: {
    label: "Session history button",
    where: "project",
    find: [(p) => p.locator("flow-agent-panel").getByRole("button", { name: "Open session history" })],
  },
  // Flow's November 2026 redesign moved "Start new session" into the session history view.
  newSessionLegacy: {
    label: "Start new session button",
    where: "project",
    optional: true,
    find: [(p) => p.locator("flow-agent-panel").getByRole("button", { name: "Start new session" })],
  },
  createSession: {
    label: "Create new session button",
    where: "project",
    optional: true,
    find: [(p) => p.locator("flow-agent-panel").getByRole("button", { name: /Create new session/ })],
  },
  projectTitle: {
    label: "Project title field",
    where: "project",
    find: [(p) => p.locator('input[aria-label="Editable text"]').first()],
  },
} satisfies Record<string, ControlDef>;

export type ControlKey = keyof typeof CONTROLS;

/** One locator matching whichever alternative of the control is on the page. */
export function control(page: Page, key: ControlKey): Locator {
  const [first, ...rest] = (CONTROLS[key] as ControlDef).find.map((f) => f(page));
  return rest.reduce((all, alt) => all.or(alt), first);
}

export function controlsAt(where: ControlDef["where"]): { key: ControlKey; label: string }[] {
  return (Object.entries(CONTROLS) as [ControlKey, ControlDef][]).filter(([, d]) => d.where === where && !d.optional).map(([key, d]) => ({ key, label: d.label }));
}

/*
 * Pop-ups. Flow shows announcements ("A faster, easier-to-reach Flow Agent") in a modal that
 * covers the page until it is read; every click behind it then times out. Closing an
 * announcement is safe, so the usual close buttons and Escape are tried. Some can only be
 * closed by a person (their "Get started" stays disabled until the slides are read); then
 * the tool stops with a clear message instead of timing out. Other dialogs, such as the
 * upload rights notice or the media picker, are never touched here.
 */
const ANNOUNCEMENT = /changelog|what.?s new|new feature|introducing|get started|announce/i;
const CLOSERS = /^(get started|got it|close|dismiss|skip|not now|maybe later|later|done|ok|okay)$/i;

const announcement = (page: Page) => page.locator('mat-dialog-container, [role="dialog"]').filter({ visible: true, hasText: ANNOUNCEMENT }).first();

/** The title of an announcement pop-up covering the page, if there is one. */
export async function blockingPopup(page: Page): Promise<string | undefined> {
  const dialog = announcement(page);
  if (!(await dialog.isVisible().catch(() => false))) return undefined;
  const title = await dialog.locator("h1, h2, h3, [role=heading]").first().innerText({ timeout: 1_000 }).catch(() => "");
  return title.trim() || "a notice";
}

export class PopupBlockingError extends Error {
  constructor(title: string) {
    super(
      `Flow is showing a pop-up ("${title}") that covers the page and needs a person. Close it in the Flow window ` +
        "(scroll to the end and click Get started), then try again.",
    );
    this.name = "PopupBlockingError";
  }
}

/** Closes an announcement pop-up if it can be closed safely; throws PopupBlockingError if it cannot. */
export async function dismissPopups(page: Page): Promise<void> {
  const title = await blockingPopup(page);
  if (!title) return;
  const dialog = announcement(page);
  const buttons = dialog.getByRole("button", { name: CLOSERS });
  for (let i = 0, n = await buttons.count(); i < n; i++) {
    const button = buttons.nth(i);
    if (await button.isEnabled().catch(() => false)) {
      await button.click({ timeout: 3_000 }).catch(() => {});
      break;
    }
  }
  if (await dialog.isVisible().catch(() => false)) await page.keyboard.press("Escape").catch(() => {});
  await dialog.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) throw new PopupBlockingError(title);
  healed(`Closed Flow's pop-up "${title}"`);
}

/*
 * When a job fails, look at the Flow window: name a blocking pop-up and keep a screenshot, so
 * "stuck" comes with a picture and a cause instead of a bare timeout.
 */
export function installFailureProbe(): void {
  setFailureProbe(async (jobId) => {
    const browser = getConnectedBrowser();
    const host = new URL(config.flowUrl).host;
    const page = browser?.contexts().flatMap((c) => c.pages()).find((p) => {
      try {
        return new URL(p.url()).host === host;
      } catch {
        return false;
      }
    });
    if (!page) return undefined;
    const blocker = await blockingPopup(page).catch(() => undefined);
    let screenshot: string | undefined;
    try {
      mkdirSync(jobsFolder(), { recursive: true });
      screenshot = path.join(jobsFolder(), `${jobId}.png`);
      await page.screenshot({ path: screenshot, timeout: 5_000 });
    } catch {
      screenshot = undefined;
    }
    return { blocker, screenshot };
  });
}
