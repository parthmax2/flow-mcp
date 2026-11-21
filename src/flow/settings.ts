import { control } from "./adapter.js";
import type { Page } from "playwright-core";
import { openProject } from "./ui.js";

/*
 * The agent's per-project settings (the "Agent settings" panel) and its standing instructions,
 * which Flow now calls "Memory" and keeps at the bottom of that panel. Settings hold the
 * approval mode and, in an "Image defaults" and a "Video defaults" view, the default model,
 * aspect ratio and number of outputs. Changes save as they are clicked (no Save button).
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

/** Backs out of a defaults view and then out of the settings panel. */
async function closePanel(page: Page): Promise<void> {
  await closeMenu(page);
  for (let i = 0; i < 3 && (await backButton(page).isVisible().catch(() => false)); i++) {
    await backButton(page).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
}

async function openSettings(page: Page): Promise<void> {
  await closePanel(page);
  await control(page, "agentSettings").first().click({ timeout: 30_000 });
  await panel(page).getByText("Agent settings").first().waitFor({ timeout: 15_000 });
}

const SECTION_ROW = { image: /Image defaults/, video: /Video defaults/ } as const;
type Section = keyof typeof SECTION_ROW;

async function openDefaults(page: Page, section: Section): Promise<void> {
  await panel(page).locator("button").filter({ hasText: SECTION_ROW[section] }).first().click({ timeout: 10_000 });
  await panel(page).getByText("Aspect ratio").first().waitFor({ timeout: 10_000 });
}

async function backToSettings(page: Page): Promise<void> {
  await backButton(page).click();
  await panel(page).getByText("Memory").first().waitFor({ timeout: 10_000 });
}

interface DefaultsView {
  /** Model rows in page order, with the one that is selected. */
  models: { name: string; checked: boolean }[];
  /** The toggle buttons (aspect ratio, number of outputs, thinking level) with their state. */
  toggles: { text: string; checked: boolean }[];
}

/** Reads the open defaults view: its model list and its toggles. */
async function readView(page: Page): Promise<DefaultsView> {
  return panel(page).evaluate((root) => {
    const models: { name: string; checked: boolean }[] = [];
    root.querySelectorAll('input[type="radio"]').forEach((input) => {
      // The row is the largest element that holds this radio and no other one.
      let row: HTMLElement = input as HTMLElement;
      while (row.parentElement && row.parentElement.querySelectorAll('input[type="radio"]').length < 2) row = row.parentElement;
      const name = (row.innerText || row.textContent || "")
        .replace(/radio_button_(un)?checked/g, "")
        .replace(/Leaving[^\n]*/g, "")
        .replace(/^[^A-Za-z0-9]+/, "")
        .replace(/\s+/g, " ")
        .trim();
      models.push({ name, checked: (input as HTMLInputElement).checked });
    });
    const toggles = Array.from(root.querySelectorAll('button[role="radio"]')).map((b) => ({
      text: (b.textContent || "").trim(),
      checked: b.getAttribute("aria-checked") === "true",
    }));
    return { models, toggles };
  });
}

/** Toggle text starts with its icon name, e.g. "crop_16_916:9" or "crop_landscape4:3". */
function toggleValue(text: string): { kind: "aspect" | "count" | "thinking"; value: string } | undefined {
  const t = text.replace(/^crop_(16_9|9_16|landscape|square|portrait)/, "");
  const aspect = t.match(/^(\d+:\d+)$/)?.[1];
  if (aspect) return { kind: "aspect", value: aspect };
  const count = t.match(/^x(\d)$/)?.[1];
  if (count) return { kind: "count", value: count };
  if (/^(Low|Medium|High|Extra thorough)$/.test(t)) return { kind: "thinking", value: t };
  return undefined;
}

/** The selected values of a defaults view; exported for tests. */
export function defaultsOf(view: DefaultsView): GenerationDefaults {
  const on = (kind: "aspect" | "count") =>
    view.toggles
      .filter((t) => t.checked)
      .map((t) => toggleValue(t.text))
      .find((v) => v?.kind === kind)?.value;
  const count = on("count");
  return { aspect: on("aspect"), count: count ? Number(count) : undefined, model: view.models.find((m) => m.checked)?.name };
}

async function readApproval(page: Page): Promise<AgentSettings["approval"]> {
  const always = panel(page).getByRole("radio", { name: /^Always/ });
  const never = panel(page).getByRole("radio", { name: /^Never/ });
  if (await always.isChecked().catch(() => false)) return "always";
  if (await never.isChecked().catch(() => false)) return "never";
  return "unknown";
}

const approvalCache = new Map<string, { approval: AgentSettings["approval"]; at: number }>();

/** Reads a project's agent settings (and, with withModels, the models the account offers). */
export async function readSettings(page: Page, projectId: string, withModels = false): Promise<AgentSettings> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    const approval = await readApproval(page);
    const settings: AgentSettings = { approval, image: {}, video: {} };
    for (const section of ["image", "video"] as const) {
      await openDefaults(page, section);
      const view = await readView(page);
      settings[section] = defaultsOf(view);
      if (withModels) settings[section === "image" ? "imageModels" : "videoModels"] = view.models.map((m) => m.name);
      await backToSettings(page);
    }
    approvalCache.set(projectId, { approval, at: Date.now() });
    return settings;
  } finally {
    await closePanel(page);
  }
}

/** Only the approval mode: what the credit guard needs, without opening the defaults views. */
async function readApprovalMode(page: Page, projectId: string): Promise<AgentSettings["approval"]> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    const approval = await readApproval(page);
    approvalCache.set(projectId, { approval, at: Date.now() });
    return approval;
  } finally {
    await closePanel(page);
  }
}

async function choose(page: Page, kind: "aspect" | "count", value: string): Promise<void> {
  const label = kind === "count" ? `x${value}` : value;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toggle = panel(page).locator('button[role="radio"]').filter({ hasText: new RegExp(`${escaped}$`) }).first();
  if ((await toggle.count()) === 0) throw new Error(`Flow offers no ${kind} "${value}" here.`);
  await toggle.click();
}

async function chooseModel(page: Page, section: Section, model: string): Promise<void> {
  const view = await readView(page);
  const wanted = model.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
  const index = view.models.findIndex((m) => m.name.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim().includes(wanted));
  if (index < 0) throw new Error(`No ${section} model matching "${model}". Offered: ${view.models.map((m) => m.name).join(", ")}.`);
  // The radio input itself is hidden: click its row, the largest element around it that holds no other radio.
  const row = panel(page).locator('input[type="radio"]').nth(index).locator("xpath=ancestor::*[count(.//input[@type='radio'])=1][last()]");
  await row.click({ force: true });
}

/** Changes a project's agent settings; returns the settings as saved. */
export async function updateSettings(page: Page, projectId: string, change: SettingsChange): Promise<AgentSettings> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    if (change.approval === "always") await panel(page).getByRole("radio", { name: /^Always/ }).check();
    for (const section of ["image", "video"] as const) {
      const d = change[section];
      if (!d || (!d.aspect && !d.count && !d.model)) continue;
      await openDefaults(page, section);
      if (d.model) await chooseModel(page, section, d.model);
      if (d.aspect) await choose(page, "aspect", d.aspect);
      if (d.count) await choose(page, "count", String(d.count));
      await page.waitForTimeout(600);
      await backToSettings(page);
    }
    await page.waitForTimeout(1_000);
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
  const approval = cached && Date.now() - cached.at < 10 * 60_000 ? cached.approval : await readApprovalMode(page, projectId);
  if (approval === "never") {
    throw new Error(
      "This project's Flow agent is set to spend credits without asking (Agent settings: Never), so the credit budget " +
        'cannot be enforced. Switch it back with flow_settings (approval "always") before continuing.',
    );
  }
}

const memoryTitles = (page: Page) => panel(page).locator('input[aria-label="Memory title"]');
const memoryTexts = (page: Page) => panel(page).locator('textarea[aria-label="Memory description"]');

/** Reads the agent's standing instructions for a project (Flow's "Memory"). */
export async function readInstructions(page: Page, projectId: string): Promise<Instruction[]> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    await panel(page).getByText("Memory").first().waitFor({ timeout: 10_000 });
    const titles = await memoryTitles(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    const texts = await memoryTexts(page).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    return texts.map((text, i) => ({ title: titles[i] ?? "", text }));
  } finally {
    await closePanel(page);
  }
}

/** Replaces the agent's standing instructions for a project (an empty list removes them all). */
export async function setInstructions(page: Page, projectId: string, instructions: Instruction[]): Promise<Instruction[]> {
  await openProject(page, { projectId });
  await openSettings(page);
  try {
    await panel(page).getByText("Memory").first().waitFor({ timeout: 10_000 });
    while ((await memoryTexts(page).count()) > 0) {
      await panel(page).getByRole("button", { name: "Delete memory" }).first().click();
      await page.waitForTimeout(400);
    }
    // Flow puts each new item at the top, so adding them last-first keeps the given order.
    for (const instruction of [...instructions].reverse()) {
      const before = await memoryTitles(page).count();
      await panel(page).getByRole("button", { name: /Add new/ }).click();
      // Fill only once the new item is drawn; until then the top field is the previous item.
      for (let i = 0; i < 20 && (await memoryTitles(page).count()) <= before; i++) await page.waitForTimeout(250);
      if ((await memoryTitles(page).count()) <= before) throw new Error("Flow did not add a new Memory item.");
      await memoryTitles(page).first().fill(instruction.title);
      await memoryTexts(page).first().fill(instruction.text);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1_500);
  } finally {
    await closePanel(page);
  }
  return readInstructions(page, projectId);
}
