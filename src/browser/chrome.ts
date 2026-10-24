import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { config, cdpEndpoint } from "../config.js";

const CANDIDATES: Record<string, string[]> = {
  win32: [
    path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"],
};

export function findChrome(): string {
  if (config.chromePath) {
    if (!existsSync(config.chromePath)) throw new Error(`FLOW_CHROME_PATH points to ${config.chromePath}, which does not exist.`);
    return config.chromePath;
  }
  const found = (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found. Set FLOW_CHROME_PATH to chrome's executable.");
  return found;
}

export async function isCdpUp(): Promise<boolean> {
  try {
    const res = await fetch(`${cdpEndpoint()}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Starts a real, visible Chrome on the project's dedicated profile with a loopback-only
 * DevTools port. The user signs in to Google there once; the session persists in the profile.
 */
export async function launchChrome(): Promise<boolean> {
  // A Chrome already listening on the port is reused as is, whichever profile it was started with.
  if (await isCdpUp()) return false;
  mkdirSync(config.profileDir, { recursive: true });
  const child = spawn(
    findChrome(),
    [
      `--remote-debugging-port=${config.cdpPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${config.profileDir}`,
      "--no-first-run",
      // Parallel requests run in background tabs; keep Chrome from slowing those down.
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-default-browser-check",
      config.flowUrl,
    ],
    { detached: true, stdio: "ignore" },
  );
  // A launch failure must surface as an error, not as an unhandled event that ends the process.
  let launchError: Error | undefined;
  child.on("error", (err) => (launchError = err));
  child.unref();

  for (let i = 0; i < 50; i++) {
    if (launchError) throw new Error(`Chrome could not be started: ${launchError.message}`);
    if (await isCdpUp()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome started but DevTools did not answer on ${cdpEndpoint()}`);
}
