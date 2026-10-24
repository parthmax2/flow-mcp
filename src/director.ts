import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROJECT_ROOT } from "./config.js";

/*
 * The flow-director skill: how to get the best out of Flow (intake, planning, free previews,
 * prompting, consistency, edits). One copy in skills/flow-director serves both Claude Code,
 * as an installed skill, and every other MCP client, as a prompt and resources.
 */

export const SKILL_NAME = "flow-director";
export const SKILL_DIR = path.join(PROJECT_ROOT, "skills", SKILL_NAME);
export const RESOURCE_PREFIX = `flow://${SKILL_NAME}/`;

/** The skill's files relative to its folder: SKILL.md and references/*.md. */
export function skillFiles(): string[] {
  const refs = path.join(SKILL_DIR, "references");
  return ["SKILL.md", ...(existsSync(refs) ? readdirSync(refs).filter((f) => f.endsWith(".md")).map((f) => `references/${f}`) : [])];
}

export function readSkillFile(file: string): string {
  if (!skillFiles().includes(file)) throw new Error(`No such ${SKILL_NAME} file: ${file}`);
  return readFileSync(path.join(SKILL_DIR, file), "utf8");
}

/** SKILL.md without its frontmatter, with reference paths pointing at this server's resources. */
export function directorGuide(): string {
  return readSkillFile("SKILL.md")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/`(references\/[\w-]+\.md)`/g, (_, file: string) => `\`${RESOURCE_PREFIX}${file}\``)
    .trim();
}

/** Copies the skill into Claude Code's user skills folder (replacing an older copy). */
export function installSkill(target = path.join(os.homedir(), ".claude", "skills", SKILL_NAME)): string {
  if (!existsSync(path.join(SKILL_DIR, "SKILL.md"))) throw new Error(`The skill is missing from this install: ${SKILL_DIR}`);
  cpSync(SKILL_DIR, target, { recursive: true, force: true });
  return target;
}
