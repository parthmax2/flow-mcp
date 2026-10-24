import type { Locator, Page } from "playwright-core";
import { openProject } from "./ui.js";

/*
 * The agent's per-project settings ("Agent settings" behind the prompt box's Settings button)
 * and its instructions ("Agent instructions"). Settings hold the approval mode and the
 * default aspect ratio, count and model for images and videos.
 *
 * The approval mode is part of the credit guard: with "Never" the agent spends credits
 * without asking, so this module never sets it and offers a check that refuses to work then.
 */

export interface GenerationDefaults {
  aspect?: string;
  count?: number;
  model?: string;
}

export interface AgentSettings {
  /** "always": the agent asks before spending credits. "never": it spends without asking. */
  approval: "always" | "never" | "unknown";
  image: GenerationDefaults;
  video: GenerationDefaults;
  /** Models offered on this account, when read with withModels. */
  imageModels?: string[];
  videoModels?: string[];
}

export interface Instruction {
  title: string;
  text: string;
}

export interface SettingsChange {
  image?: GenerationDefaults;
  video?: GenerationDefaults;
  /** Only "always" can be set: "never" would let the agent spend credits unasked. */
  approval?: "always";
}

const panel = (page: Page) => page.locator("flow-agent-panel");
const backButton = (page: Page) => panel(page).getByRole("button", { name: "Back", exact: true });

/** Closes an open dropdown menu: Escape, then a click on its backdrop if it is still there. */
async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const backdrop = page.locator(".cdk-overlay-backdrop-showing").last();
  if (await backdrop.isVisible().catch(() => false)) await backdrop.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
}

async function closePanel(page: Page): Promise<void> {
  await closeMenu(page);
  if (await backButton(page).isVisible().catch(() => false)) await backButton(page).click();
  await page.waitForTimeout(500);
}

async function openSettings(page: Page): Promise<void> {
  await closePanel(page);
  await page.locator("flow-base-prompt-box").getByRole("button", { name: "Settings" }).click({ timeout: 30_000 });
  await panel(page).getByText("Agent settings").first().waitFor({ timeout: 15_000 });
}

async function openInstructions(page: Page): Promise<void> {
  await closePanel(page);
  await page.locator("flow-base-prompt-box").getByRole("button", { name: "Agent instructions" }).click({ timeout: 30_000 });
  await panel(page).getByRole("button", { name: /Add instruction/ }).waitFor({ timeout: 15_000 });
}

interface Control {
  section: "image" | "video";
  kind: "aspect" | "count" | "model";
  value: string;
  checked: boolean;
}

/** Reads the panel's toggles and model buttons in page order; the image model button ends the image section. */
async function readControls(page: Page): Promise<Control[]> {
  const raw = await panel(page)
    .locator('button[role="radio"], button[aria-label$="generation default model"]')
    .evaluateAll((els) =>
      els.map((e) => ({ label: e.getAttribute("aria-label") ?? "", text: (e.textContent ?? "").trim(), checked: e.getAttribute("aria-checked") === "true" })),
    );
  const controls: Control[] = [];
  let section: Control["section"] = "image";
  for (const r of raw) {
    if (r.label.endsWith("generation default model")) {
      const model = r.text.replace(/arrow_drop_down/g, "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
      controls.push({ section: r.label.startsWith("Image") ? "image" : "video", kind: "model", value: model, checked: true });
      if (r.label.startsWith("Image")) section = "video";
      continue;
    }
    // Toggle text starts with its icon name, e.g. "crop_16_916:9" or "crop_landscape4:3".
    const text = r.text.replace(/^crop_(16_9|9_16|landscape|square|portrait)/, "");
    const aspect = text.match(/^(\d+:\d+)$/)?.[1];
    const count = text.match(/^x(\d)$/)?.[1];
    if (aspect) controls.push({ section, kind: "aspect", value: aspect, checked: r.checked });
    else if (count) controls.push({ section, kind: "count", value: count, checked: r.checked });
  }
  return controls;
}

function defaultsOf(controls: Control[], section: Control["section"]): GenerationDefaults {
  const pick = (kind: Control["kind"]) => controls.find((c) => c.section === section && c.kind === kind && c.checked)?.value;
  const count = pick("count");
  return { aspect: pick("aspect"), count: count ? Number(count) : undefined, model: pick("model") };
}

async function readApproval(page: Page): Promise<AgentSettings["approval"]> {
  const always = panel(page).getByRole("radio", { name: /^Always/ });
  const never = panel(page).getByRole("radio", { name: /^Never/ });
  if (await always.isChecked().catch(() => false)) return "always";
  if (await never.isChecked().catch(() => false)) return "never";
  return "unknown";
}

async function modelOptions(page: Page, section: Control["section"]): Promise<string[]> {
  const button = panel(page).getByRole("button", { name: `${section === "image" ? "Image" : "Video"} generation default model` });
  await button.click();
  const items = page.locator(".cdk-overlay-container").locator('[role="option"], [role="menuitem"], [role="menuitemradio"]');
  await items.first().waitFor({ timeout: 10_000 });
  const names = (await items.allInnerTexts()).map((t) => t.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim());
  await closeMenu(page);
  return names;
}

const approvalCache = new Map<string, { approval: AgentSettings["approval"]; at: number }>();

/** Reads a project's agent settings (and, with withModels, the models the account offers). */
export async function readSettings(page: Page, projectId: string, withModels = false): Promise<AgentSettings> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    const controls = await readControls(page);
    const settings: AgentSettings = { approval: await readApproval(page), image: defaultsOf(controls, "image"), video: defaultsOf(controls, "video") };
    if (withModels) {
      settings.imageModels = await modelOptions(page, "image");
      settings.videoModels = await modelOptions(page, "video");
    }
    approvalCache.set(projectId, { approval: settings.approval, at: Date.now() });
    return settings;
  } finally {
    await closePanel(page);
  }
}

async function choose(page: Page, section: Control["section"], kind: "aspect" | "count", value: string): Promise<void> {
  const label = kind === "count" ? `x${value}` : value;
  const toggles = panel(page).locator('button[role="radio"]').filter({ hasText: new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  // Shared labels (16:9, 9:16, x1-x4) appear once per section, image first.
  const n = await toggles.count();
  const target: Locator = section === "video" && n > 1 ? toggles.nth(1) : toggles.first();
  if (n === 0) throw new Error(`Flow offers no ${section} ${kind} "${value}" here.`);
  await target.click();
}

async function chooseModel(page: Page, section: Control["section"], model: string): Promise<void> {
  await panel(page).getByRole("button", { name: `${section === "image" ? "Image" : "Video"} generation default model` }).click();
  const items = page.locator(".cdk-overlay-container").locator('[role="option"], [role="menuitem"], [role="menuitemradio"]');
  await items.first().waitFor({ timeout: 10_000 });
  const wanted = model.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
  const names = await items.allInnerTexts();
  const index = names.findIndex((n) => n.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim().includes(wanted));
  if (index < 0) {
    await closeMenu(page);
    throw new Error(`No ${section} model matching "${model}". Offered: ${names.map((n) => n.replace(/^[^\p{L}\p{N}]+/u, "").trim()).join(", ")}.`);
  }
  await items.nth(index).click();
}

/** Changes a project's agent settings and saves them; returns the settings as saved. */
export async function updateSettings(page: Page, projectId: string, change: SettingsChange): Promise<AgentSettings> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    if (change.approval === "always") await panel(page).getByRole("radio", { name: /^Always/ }).check();
    for (const section of ["image", "video"] as const) {
      const d = change[section];
      if (!d) continue;
      if (d.aspect) await choose(page, section, "aspect", d.aspect);
      if (d.count) await choose(page, section, "count", String(d.count));
      if (d.model) await chooseModel(page, section, d.model);
    }
    await panel(page).getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(1_500);
  } finally {
    await closePanel(page);
  }
  return readSettings(page, projectId);
}

/**
 * Refuses to continue when the project's agent may spend credits without asking, since the
 * credit budget relies on the agent's approval request. Cached for 10 minutes per project.
 */
export async function assertApprovalRequired(page: Page, projectId: string): Promise<void> {
  const cached = approvalCache.get(projectId);
  const approval = cached && Date.now() - cached.at < 10 * 60_000 ? cached.approval : (await readSettings(page, projectId)).approval;
  if (approval === "never") {
    throw new Error(
      "This project's Flow agent is set to spend credits without asking (Agent settings: Never), so the credit budget " +
        'cannot be enforced. Switch it back with flow_settings (approval "always") before continuing.',
    );
  }
}

/** Reads the agent's standing instructions for a project. */
export async function readInstructions(page: Page, projectId: string): Promise<Instruction[]> {
  await openProject(page, { projectId });
  await openInstructions(page);
  try {
    const titles = await panel(page).locator('input[placeholder="Instruction title"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    const texts = await panel(page).locator('textarea[aria-label="Instruction description"]').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    return texts.map((text, i) => ({ title: titles[i] ?? "", text }));
  } finally {
    await closePanel(page);
  }
}

/** Replaces the agent's standing instructions for a project (an empty list removes them all). */
export async function setInstructions(page: Page, projectId: string, instructions: Instruction[]): Promise<Instruction[]> {
  await openProject(page, { projectId });
  await openInstructions(page);
  const descriptions = panel(page).locator('textarea[aria-label="Instruction description"]');
  try {
    while ((await descriptions.count()) > 0) {
      await panel(page).getByRole("button", { name: "Delete instruction" }).first().click();
      await page.waitForTimeout(300);
    }
    for (const instruction of instructions) {
      await panel(page).getByRole("button", { name: /Add instruction/ }).click();
      // The title is an inline-editable field that only commits on Enter.
      const title = panel(page).locator('input[placeholder="Instruction title"]').last();
      await title.fill(instruction.title);
      await title.press("Enter");
      await descriptions.last().fill(instruction.text);
    }
    await panel(page).getByRole("button", { name: "Done", exact: true }).click();
    await page.waitForTimeout(1_500);
  } finally {
    await closePanel(page);
  }
  return readInstructions(page, projectId);
}
