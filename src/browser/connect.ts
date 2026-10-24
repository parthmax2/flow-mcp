import { chromium, type Browser, type Page } from "playwright-core";
import { config, cdpEndpoint } from "../config.js";
import { isCdpUp, launchChrome } from "./chrome.js";

let browser: Browser | undefined;

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  if (!(await isCdpUp())) await launchChrome();
  browser = await chromium.connectOverCDP(cdpEndpoint());
  return browser;
}

const flowHost = () => new URL(config.flowUrl).host;

const prepared = new WeakSet<Page>();

/**
 * The tool reloads the Flow tab to refresh data. A "leave this page?" prompt would block
 * those reloads indefinitely, so it is accepted; other dialogs are left to the user.
 */
function prepare(page: Page): Page {
  if (!prepared.has(page)) {
    prepared.add(page);
    page.on("dialog", (dialog) => {
      if (dialog.type() === "beforeunload") dialog.accept().catch(() => {});
    });
  }
  return page;
}

/** Returns the open Flow tab, opening one if none exists. Never closes user tabs. */
export async function getFlowPage(): Promise<Page> {
  const b = await getBrowser();
  const context = b.contexts()[0] ?? (await b.newContext());
  const existing = context.pages().find((p) => {
    try {
      return new URL(p.url()).host === flowHost();
    } catch {
      return false;
    }
  });
  if (existing) return prepare(existing);
  const page = prepare(await context.newPage());
  await page.goto(config.flowUrl, { waitUntil: "domcontentloaded" });
  return page;
}

/** Opens an additional Flow tab in the same signed-in Chrome, e.g. to run requests in parallel. */
export async function openFlowTab(): Promise<Page> {
  const b = await getBrowser();
  const context = b.contexts()[0] ?? (await b.newContext());
  const page = prepare(await context.newPage());
  await page.goto(config.flowUrl, { waitUntil: "domcontentloaded" });
  return page;
}

/** Detaches from Chrome without closing it (connectOverCDP close only drops the connection). */
export async function disconnect(): Promise<void> {
  await browser?.close();
  browser = undefined;
}
