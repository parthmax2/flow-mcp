import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The registry folder is resolved when config loads, so each test points it at a fresh folder first.
beforeEach(() => {
  vi.resetModules();
  process.env.FLOW_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "flow-mcp-prefs-"));
  delete process.env.FLOW_CONFIRM_RIGHTS;
});
afterEach(() => {
  delete process.env.FLOW_DATA_DIR;
  delete process.env.FLOW_CONFIRM_RIGHTS;
});

describe("uploadRightsConfirmed", () => {
  it("is off by default", async () => {
    const { uploadRightsConfirmed } = await import("../src/state/preferences.js");
    expect(uploadRightsConfirmed()).toBe(false);
  });

  it("follows a per-request confirmation or the saved setup choice", async () => {
    const { savePreferences, uploadRightsConfirmed } = await import("../src/state/preferences.js");
    expect(uploadRightsConfirmed(true)).toBe(true);
    savePreferences({ confirmUploadRights: true });
    expect(uploadRightsConfirmed()).toBe(true);
  });

  it("lets FLOW_CONFIRM_RIGHTS override everything", async () => {
    const { savePreferences, uploadRightsConfirmed } = await import("../src/state/preferences.js");
    savePreferences({ confirmUploadRights: true });
    process.env.FLOW_CONFIRM_RIGHTS = "0";
    expect(uploadRightsConfirmed(true)).toBe(false);
    process.env.FLOW_CONFIRM_RIGHTS = "1";
    expect(uploadRightsConfirmed()).toBe(true);
  });
});
