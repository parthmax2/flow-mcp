import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { clearQuotaReached, quotaReachedAt, recordQuotaReached } from "../src/state/quota.js";

describe("remembered daily agent limit", () => {
  beforeEach(() => {
    config.dataDir = mkdtempSync(path.join(tmpdir(), "flow-quota-"));
  });

  it("is kept per account for a day", () => {
    const at = new Date("2026-11-06T10:00:00Z");
    recordQuotaReached("a@example.com", at);
    expect(quotaReachedAt("a@example.com", at.getTime() + 3_600_000)).toEqual(at);
    expect(quotaReachedAt("b@example.com", at.getTime())).toBeUndefined();
    expect(quotaReachedAt("a@example.com", at.getTime() + 25 * 3_600_000)).toBeUndefined();
  });

  it("is forgotten once a request goes through", () => {
    recordQuotaReached("a@example.com");
    clearQuotaReached("a@example.com");
    expect(quotaReachedAt("a@example.com")).toBeUndefined();
  });
});
