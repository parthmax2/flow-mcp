import type { Page } from "playwright-core";
import { getBrowser } from "../browser/connect.js";
import { config } from "../config.js";
import { signedInEmail } from "./account.js";
import { listProjects } from "./projects.js";
import { readCredits } from "./ui.js";

/*
 * A health check that names the problem instead of letting tools time out: is Chrome there,
 * is someone signed in, is Flow blocking the account, can credits be read, and do the page
 * controls this tool relies on still exist. It runs in its own tab and closes it afterwards.
 */

export type HealthState = "ready" | "browser_down" | "signed_out" | "challenge" | "blocked" | "ui_changed";

export interface UiCheck {
  control: string;
  where: "home" | "project";
  ok: boolean;
}

export interface Health {
  state: HealthState;
  ok: boolean;
  email?: string;
  credits?: number;
  /** What was found, in plain words. */
  details: string;
  /** What the user should do about it. */
  fix?: string;
  ui?: UiCheck[];
}

// Text Flow or Google show when an account is challenged or limited.
const CHALLENGE_TEXT = /unusual (activity|traffic)|verify (it's|that it's) you|PUBLIC_ERROR_UNUSUAL_ACTIVITY|confirm you're not a robot/i;
const BLOCKED_TEXT = /isn't available in your (country|region)|account (has been|is) (suspended|disabled|restricted)|access denied|not eligible/i;

const HOME_CONTROLS: [string, (p: Page) => ReturnType<Page["locator"]>][] = [["New project button", (p) => p.getByRole("button", { name: /new project/i })]];

const PROJECT_CONTROLS: [string, (p: Page) => ReturnType<Page["locator"]>][] = [
  ["Prompt box", (p) => p.getByRole("textbox", { name: "What do you want to create?" })],
  ["Send button", (p) => p.locator('button[aria-label="Start generation"]')],
  ["Add media menu (uploads)", (p) => p.getByRole("button", { name: "Add media menu" })],
  ["Attach (ingredients) button", (p) => p.getByRole("button", { name: "Add ingredients to the prompt box" })],
  ["Agent settings button", (p) => p.locator("flow-base-prompt-box").getByRole("button", { name: "Settings" })],
  ["Agent instructions button", (p) => p.locator("flow-base-prompt-box").getByRole("button", { name: "Agent instructions" })],
  ["Project title field", (p) => p.locator('input[aria-label="Editable text"]').first()],
];

async function present(locate: () => ReturnType<Page["locator"]>): Promise<boolean> {
  return locate()
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

async function visibleChallenge(tab: Page): Promise<boolean> {
  // An interactive reCAPTCHA challenge is a visible "bframe" iframe; the invisible badge is not.
  const frame = tab.locator('iframe[src*="recaptcha"][src*="bframe"]');
  const box = await frame.first().boundingBox().catch(() => null);
  return !!box && box.width > 100 && box.height > 100;
}

export async function checkHealth(): Promise<Health> {
  let tab: Page;
  try {
    const browser = await getBrowser();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    tab = await context.newPage();
  } catch (err) {
    return {
      state: "browser_down",
      ok: false,
      details: `Could not start or reach the Flow Chrome window: ${err instanceof Error ? err.message.split("\n")[0] : err}`,
      fix: "Run `flow-mcp setup`. If Chrome is not found, set FLOW_CHROME_PATH; if port 9222 is taken, set FLOW_CDP_PORT.",
    };
  }
  try {
    await tab.goto(new URL(config.flowUrl).origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForTimeout(3_000);
    const text = await tab.locator("body").innerText().catch(() => "");

    if (await visibleChallenge(tab) || CHALLENGE_TEXT.test(text)) {
      return {
        state: "challenge",
        ok: false,
        details: "Google is showing a verification challenge or an 'unusual activity' notice.",
        fix: "Open the Flow Chrome window, complete the check there, and slow down for a while before retrying.",
      };
    }
    if (BLOCKED_TEXT.test(text)) {
      return { state: "blocked", ok: false, details: "Flow says this account cannot use it right now.", fix: "Check the Flow window; try later or use another account." };
    }

    const email = await signedInEmail(tab);
    if (!email) {
      return { state: "signed_out", ok: false, details: "Nobody is signed in to Flow in the controlled Chrome window.", fix: "Run `flow-mcp setup` and sign in." };
    }

    const credits = await readCredits(tab).catch(() => undefined);
    const ui: UiCheck[] = [];
    for (const [control, locate] of HOME_CONTROLS) ui.push({ control, where: "home", ok: await present(() => locate(tab)) });

    // Project controls are checked in the most recently updated project, without changing it.
    const recent = (await listProjects(tab).catch(() => []))[0];
    if (recent) {
      await tab.goto(`${new URL(config.flowUrl).origin}/project/${recent.id}`, { waitUntil: "domcontentloaded" });
      for (const [control, locate] of PROJECT_CONTROLS) ui.push({ control, where: "project", ok: await present(() => locate(tab)) });
    }

    const missing = ui.filter((c) => !c.ok);
    if (missing.length) {
      return {
        state: "ui_changed",
        ok: false,
        email,
        credits,
        ui,
        details: `Flow's page no longer has: ${missing.map((m) => m.control).join(", ")}.`,
        fix: "Flow's website changed (or is not in English). Make sure Flow is in English; otherwise this tool needs an update.",
      };
    }
    return {
      state: "ready",
      ok: true,
      email,
      credits,
      ui,
      details: `Signed in as ${email}${credits !== undefined ? ` with ${credits} credits` : ""}; all ${ui.length} page controls found${recent ? "" : " (no project yet to check project controls)"}.`,
    };
  } finally {
    await tab.close().catch(() => {});
  }
}
