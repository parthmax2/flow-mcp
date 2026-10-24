import type { Page } from "playwright-core";

/** The signed-in Google account's email, read from Flow's account button; undefined when signed out. */
export async function signedInEmail(page: Page): Promise<string | undefined> {
  const label = await page
    .locator('[aria-label^="Google Account:"]')
    .first()
    .getAttribute("aria-label", { timeout: 2_000 })
    .catch(() => null);
  return label?.match(/\(([^()\s]+@[^()\s]+)\)/)?.[1];
}

/**
 * Brings the Flow window to the front and, when nobody is signed in, opens Flow's own sign-in
 * (its "Create with Google Flow" entry leads to Google's account chooser), so the user only
 * has to pick or enter their account. Returns the email when someone is already signed in.
 */
export async function startSignIn(page: Page): Promise<string | undefined> {
  await page.bringToFront();
  const already = await signedInEmail(page);
  if (already) return already;
  const flowHome = new URL(page.url()).origin;
  if (new URL(page.url()).pathname !== "/") await page.goto(flowHome, { waitUntil: "domcontentloaded" }).catch(() => {});
  const entry = page.getByRole("link", { name: /create with google flow|sign in/i }).or(page.getByRole("button", { name: /create with google flow|sign in/i }));
  await entry.first().click({ timeout: 10_000 }).catch(() => {});
  return undefined;
}

/** Polls until someone signs in to Flow in the tab, or the timeout passes. */
export async function waitForSignIn(page: Page, timeoutMs: number, onWaiting?: () => void): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let told = false;
  while (Date.now() < deadline) {
    const email = await signedInEmail(page);
    if (email) return email;
    if (!told) {
      onWaiting?.();
      told = true;
    }
    await page.waitForTimeout(3_000);
  }
  return undefined;
}
