import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/*
 * Local memory of what this tool did in Flow: which projects it made (and why) and which
 * local files it uploaded into which project, keyed by content hash. It lets uploads be
 * reused instead of repeated, and lets a connected AI pick the right project.
 */

export interface UploadRecord {
  mediaId: string;
  /** The unique name the file was uploaded under, e.g. me-3f9a1c2b.png. */
  flowName: string;
  file: string;
  uploadedAt: string;
}

export interface ProjectRecord {
  title?: string;
  purpose?: string;
  createdAt?: string;
  lastUsedAt?: string;
  /** Keyed by the file's SHA-256. */
  uploads: Record<string, UploadRecord>;
}

interface RegistryFile {
  version: 1;
  projects: Record<string, ProjectRecord>;
}

const file = () => path.join(config.dataDir, "registry.json");

export function loadRegistry(): RegistryFile {
  if (!existsSync(file())) return { version: 1, projects: {} };
  return JSON.parse(readFileSync(file(), "utf8")) as RegistryFile;
}

function save(registry: RegistryFile): void {
  mkdirSync(config.dataDir, { recursive: true });
  // Write-then-rename so an interrupted run never leaves a half-written registry.
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2));
  renameSync(tmp, file());
}

function update(projectId: string, change: (p: ProjectRecord) => void): ProjectRecord {
  const registry = loadRegistry();
  const project = (registry.projects[projectId] ??= { uploads: {} });
  change(project);
  save(registry);
  return project;
}

export function getProject(projectId: string): ProjectRecord | undefined {
  return loadRegistry().projects[projectId];
}

export function recordProject(projectId: string, fields: Pick<ProjectRecord, "title" | "purpose" | "createdAt">): ProjectRecord {
  return update(projectId, (p) => {
    if (fields.title) p.title = fields.title;
    if (fields.purpose) p.purpose = fields.purpose;
    p.createdAt ??= fields.createdAt;
    p.lastUsedAt = new Date().toISOString();
  });
}

export function touchProject(projectId: string): void {
  update(projectId, (p) => {
    p.lastUsedAt = new Date().toISOString();
  });
}

export function recordUpload(projectId: string, hash: string, upload: UploadRecord): void {
  update(projectId, (p) => {
    p.uploads[hash] = upload;
  });
}

export function forgetUpload(projectId: string, hash: string): void {
  update(projectId, (p) => {
    delete p.uploads[hash];
  });
}

export function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** A Flow-side name that is unique per file content: "Anime style reference.mp4" -> anime-style-reference-3f9a1c2b.mp4 */
export function uniqueName(filePath: string, hash: string): string {
  const { name, ext } = path.parse(filePath);
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file";
  return `${slug}-${hash.slice(0, 8)}${ext.toLowerCase()}`;
}
