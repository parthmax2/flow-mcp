import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The package's own folder (the repo root in a checkout, the installed package otherwise). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where this tool keeps its state: the signed-in Chrome profile, the project/upload registry,
 * downloads and captures. FLOW_HOME overrides it; otherwise ~/.flow-mcp. A checkout that
 * already has a profile in its root (the original development layout) keeps using it, so an
 * existing sign-in is not lost.
 */
function resolveHome(): string {
  if (process.env.FLOW_HOME) return path.resolve(process.env.FLOW_HOME);
  if (existsSync(path.join(PROJECT_ROOT, ".flow-profile"))) return PROJECT_ROOT;
  return path.join(os.homedir(), ".flow-mcp");
}

export const FLOW_HOME = resolveHome();

export const config = {
  flowUrl: process.env.FLOW_URL ?? "https://flow.google.com",
  cdpPort: Number(process.env.FLOW_CDP_PORT ?? 9222),
  profileDir: process.env.FLOW_PROFILE_DIR ?? path.join(FLOW_HOME, ".flow-profile"),
  capturesDir: process.env.FLOW_CAPTURES_DIR ?? path.join(FLOW_HOME, "captures"),
  outputDir: process.env.FLOW_OUTPUT_DIR ?? path.join(FLOW_HOME, "output"),
  /** Local registry of projects and uploads. */
  dataDir: process.env.FLOW_DATA_DIR ?? path.join(FLOW_HOME, "data"),
  chromePath: process.env.FLOW_CHROME_PATH,
};

export const cdpEndpoint = () => `http://127.0.0.1:${config.cdpPort}`;
