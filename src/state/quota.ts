import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/*
 * When each Google account last hit Flow's daily agent limit. Flow shows the notice only on
 * the live page (a reload starts a fresh, empty chat), so the health check cannot see it
 * later; this lets flow_status report the limit without spending a request to find out.
 */

/** Flow says "come back tomorrow" without a time; a day is the safe assumption. */
const LIMIT_MS = 24 * 60 * 60 * 1000;

const file = () => path.join(config.dataDir, "agent-quota.json");

function load(): Record<string, string> {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function save(data: Record<string, string>): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file(), JSON.stringify(data, null, 2));
}

export function recordQuotaReached(email: string, at = new Date()): void {
  save({ ...load(), [email]: at.toISOString() });
}

/** A request went through, so the limit is over for this account. */
export function clearQuotaReached(email: string): void {
  const data = load();
  if (!(email in data)) return;
  delete data[email];
  save(data);
}

/** When the account hit the limit, if that was within the last day. */
export function quotaReachedAt(email: string, now = Date.now()): Date | undefined {
  const at = load()[email];
  if (!at) return undefined;
  const date = new Date(at);
  return now - date.getTime() < LIMIT_MS ? date : undefined;
}
