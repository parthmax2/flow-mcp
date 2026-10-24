import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { directorGuide, installSkill, readSkillFile, RESOURCE_PREFIX, skillFiles } from "../src/director.js";

describe("flow-director skill", () => {
  it("lists SKILL.md and its references", () => {
    expect(skillFiles()).toEqual(expect.arrayContaining(["SKILL.md", "references/prompting.md", "references/consistency.md", "references/editing.md"]));
  });

  it("has a name and description for Claude Code to load it by", () => {
    expect(readSkillFile("SKILL.md")).toMatch(/^---\nname: flow-director\ndescription: .+\n---\n/);
  });

  it("every reference SKILL.md mentions exists", () => {
    const mentioned = [...readSkillFile("SKILL.md").matchAll(/`(references\/[\w-]+\.md)`/g)].map((m) => m[1]);
    expect(mentioned.length).toBeGreaterThan(0);
    for (const file of mentioned) expect(skillFiles()).toContain(file);
  });

  it("serves the guide without frontmatter, pointing references at resources", () => {
    const guide = directorGuide();
    expect(guide.startsWith("# Flow director")).toBe(true);
    expect(guide).toContain(`\`${RESOURCE_PREFIX}references/prompting.md\``);
    expect(guide).not.toMatch(/`references\//);
  });

  it("reads only the skill's own files", () => {
    expect(() => readSkillFile("../package.json")).toThrow(/No such flow-director file/);
  });

  it("installs into a skills folder", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "flow-director-"));
    try {
      const target = installSkill(path.join(dir, "flow-director"));
      expect(existsSync(path.join(target, "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(target, "references", "editing.md"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
