import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/*
 * Per-user choices made in `flow-mcp setup`, kept next to the registry in the state folder.
 */

export interface Preferences {
  /**
   * Answer Flow's "I have the rights to this content" notice automatically when uploading.
   * Off unless the user turns it on: it is a statement only they can make.
   */
  confirmUploadRights?: boolean;
}

const file = () => path.join(config.dataDir, "preferences.json");

export function loadPreferences(): Preferences {
  return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Preferences) : {};
}

export function savePreferences(change: Preferences): Preferences {
  const next = { ...loadPreferences(), ...change };
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Whether uploads may confirm Flow's rights notice: FLOW_CONFIRM_RIGHTS overrides, otherwise the
 * setup preference, otherwise a per-request confirmation the user gave for those files.
 */
export function uploadRightsConfirmed(confirmedForThisRequest = false): boolean {
  const env = process.env.FLOW_CONFIRM_RIGHTS?.toLowerCase();
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  return confirmedForThisRequest || loadPreferences().confirmUploadRights === true;
}
