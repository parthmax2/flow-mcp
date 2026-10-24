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
