import type { Page } from "playwright-core";
import { config } from "../config.js";
import { callRpc } from "../browser/rpc.js";
import { listAssets, pickAsset } from "./assets.js";
import { parseBatchExecute } from "./batchexecute.js";
import { openProject, projectIdOf } from "./ui.js";

/*
 * Flow's Characters: a named, reusable person (or creature, or object) made from a reference
 * image, with optional personality notes the agent reads and a voice. Attached to a prompt,
 * a character keeps its look (and voice) the same from one generation to the next.
 *
 * Characters are listed from the project's media call (read-only); creating and changing them
 * goes through Flow's own Characters page, like a person would.
 */

const PROJECT_MEDIA_RPC = "Zzl0ze";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Character {
  id: string;
  name: string;
  /** Personality and appearance notes; the Flow agent reads them when the character is used. */
  info?: string;
  /** The voice's id, e.g. "aoede". */
  voice?: string;
  /** The character's reference images (project media ids). */
  imageIds: string[];
}

export interface Voice {
  name: string;
  /** e.g. "Female, breezy, mid pitch". */
  description: string;
}

type Json = unknown;

const strings = (v: Json): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : []);

/**
 * Characters from the project media payload: data[5] holds records shaped
 * [projectId, characterId, , [1, name, [imageRefs, voiceRefs, info]], workflowId, size, created, updated].
 */
export function parseCharacters(data: Json): Character[] {
  const rows = Array.isArray(data) && Array.isArray(data[5]) ? (data[5] as Json[]) : [];
  const out: Character[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[1] !== "string" || !UUID.test(row[1]) || !Array.isArray(row[3])) continue;
    const entity = row[3] as Json[];
    const details = Array.isArray(entity[2]) ? (entity[2] as Json[]) : [];
    const voice = strings(details[1]).find((s) => !UUID.test(s));
    out.push({
      id: row[1],
      name: typeof entity[1] === "string" ? entity[1] : "Untitled character",
      ...(typeof details[2] === "string" && details[2] ? { info: details[2] } : {}),
      ...(voice ? { voice } : {}),
      imageIds: strings(details[0]).filter((s) => UUID.test(s)),
    });
  }
  return out;
}

/** The open project's characters. */
export async function listCharacters(page: Page): Promise<Character[]> {
  const projectId = projectIdOf(page.url());
  if (!projectId) throw new Error("No Flow project is open");
  const body = await callRpc(page, PROJECT_MEDIA_RPC, [`projects/${projectId}`, null, null, null, [1]]);
  return parseCharacters(parseBatchExecute(body)[0]?.data);
}

/** Finds a character by id or by name (case-insensitive). */
export function findCharacter(characters: Character[], ref: string): Character {
  const hit = characters.find((c) => c.id === ref) ?? characters.find((c) => c.name.toLowerCase() === ref.trim().toLowerCase());
  if (!hit) {
    const known = characters.map((c) => c.name).join(", ") || "none yet";
    throw new Error(`No character "${ref}" in this project (it has: ${known}). Create one with flow_characters.`);
  }
  return hit;
}

const flowOrigin = () => new URL(config.flowUrl).origin;

/** The voice button on a character page reads "Select a voice", or the current voice's id. */
const voiceButton = (page: Page) => page.getByRole("button").filter({ hasText: "voice_selection" }).first();

async function openVoicePicker(page: Page): Promise<void> {
  // The page fills in the character's saved voice a moment after the fields appear.
  await page.waitForTimeout(1_500);
  await voiceButton(page).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Add to character" }).waitFor({ timeout: 10_000 });
}

/**
 * Reads the voice tiles of an open voice picker. The list only renders the tiles in view, so
 * it is scrolled a screen at a time until it stops moving.
 */
async function readVoiceOptions(page: Page): Promise<Voice[]> {
  const voices = new Map<string, Voice>();
  const options = page.getByRole("option");
  const list = page.getByRole("listbox").last();
  for (let i = 0; i < 60; i++) {
    for (const text of await options.allInnerTexts()) {
      const [name, description = ""] = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && l !== "voice_selection");
      if (name) voices.set(name.toLowerCase(), { name, description });
    }
    const moved = await list
      .evaluate((el) => {
        const before = el.scrollTop;
        // Half a screen per step: larger steps outrun the rendering and skip tiles.
        el.scrollTop += Math.max(60, el.clientHeight / 2);
        return el.scrollTop !== before;
      })
      .catch(() => false);
    if (!moved) break;
    await page.waitForTimeout(600);
  }
  return [...voices.values()];
}

async function chooseVoice(page: Page, voice: string): Promise<void> {
  await openVoicePicker(page);
  await page.locator('input[aria-label="Search assets"]').fill(voice.trim(), { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(600);
  // A tile reads "voice_selection / <Name> / <description>"; match the name line exactly
  // (searching "Leda" also lists names that merely contain it).
  const options = page.getByRole("option");
  const texts = await options.allInnerTexts();
  const index = texts.findIndex((t) => t.split("\n").some((l) => l.trim().toLowerCase() === voice.trim().toLowerCase()));
  try {
    if (index < 0) throw new Error("not listed");
    await options.nth(index).click({ timeout: 5_000 });
  } catch {
    await page.locator('input[aria-label="Search assets"]').fill("", { timeout: 3_000 }).catch(() => {});
    const names = (await readVoiceOptions(page)).map((v) => v.name).join(", ");
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(`Flow has no voice "${voice}". Voices: ${names}`);
  }
  // Replacing a voice applies on the click and closes the picker; a first voice needs the confirm.
  const add = page.getByRole("button", { name: "Add to character" });
  await page.waitForTimeout(800);
  if (await add.isVisible().catch(() => false)) await add.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

export interface CharacterFields {
  name?: string;
  info?: string;
  /** A voice name from listVoices, e.g. "Aoede". */
  voice?: string;
}

/** Sets fields on the open character page. Flow saves each field as it changes. */
async function fillFields(page: Page, fields: CharacterFields): Promise<void> {
  if (fields.name !== undefined) {
    const name = page.getByRole("textbox", { name: "Character name" });
    await name.click({ timeout: 15_000 });
    await name.fill(fields.name);
    await name.press("Enter");
    await page.waitForTimeout(1_000);
  }
  if (fields.info !== undefined) {
    const info = page.getByRole("textbox", { name: "Character personality" });
    await info.click({ timeout: 15_000 });
    await info.fill(fields.info);
    await info.blur();
    await page.waitForTimeout(1_500);
  }
  if (fields.voice !== undefined) await chooseVoice(page, fields.voice);
}

/** True once the saved character shows every field that was set. */
export function hasFields(c: Character, fields: CharacterFields): boolean {
  return (
    (fields.name === undefined || c.name === fields.name) &&
    (fields.info === undefined || (c.info ?? "") === fields.info) &&
    (fields.voice === undefined || c.voice?.toLowerCase() === fields.voice.trim().toLowerCase())
  );
}

/** Leaves the character page and returns the saved character, once Flow lists the changes. */
async function finish(page: Page, projectId: string, characterId: string, fields: CharacterFields): Promise<Character> {
  await page.getByRole("button", { name: "Done", exact: true }).click({ timeout: 10_000 }).catch(() => {});
  await openProject(page, { projectId });
  // Saves land a few seconds after the page shows them; a listing right away can be stale.
  let character = findCharacter(await listCharacters(page), characterId);
  for (let i = 0; i < 10 && !hasFields(character, fields); i++) {
    await page.waitForTimeout(2_000);
    character = findCharacter(await listCharacters(page), characterId);
  }
  if (!hasFields(character, fields)) throw new Error(`Flow did not save every change to "${character.name}"; check its page in Flow.`);
  // The open page's ingredient picker keeps the old name ("Untitled character") until a reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  return character;
}

/**
 * Makes a character from an image already in the project (its media id), then names it and
 * sets its notes and voice. The image is copied into the character; the original stays.
 */
export async function createCharacter(page: Page, projectId: string, imageId: string, fields: CharacterFields): Promise<Character> {
  await openProject(page, { projectId });
  const asset = (await listAssets(page)).find((a) => a.id === imageId);
  if (!asset) throw new Error(`Media ${imageId} is not in this project; list it with flow_assets.`);
  if (asset.kind !== "image") throw new Error(`A character is made from an image; ${imageId} is a video. Take a frame with flow_frame first.`);

  await page.goto(`${flowOrigin()}/project/${projectId}/character`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Add from project/ }).click({ timeout: 30_000 });
  await pickAsset(page, asset);
  await page.getByRole("button", { name: "Add media" }).click({ timeout: 10_000 });
  await page.waitForURL(/\/character\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const characterId = page.url().match(/\/character\/([0-9a-f-]{36})/)![1];
  await page.getByRole("textbox", { name: "Character name" }).waitFor({ timeout: 30_000 });
  await fillFields(page, fields);
  return finish(page, projectId, characterId, fields);
}

export async function updateCharacter(page: Page, projectId: string, ref: string, fields: CharacterFields): Promise<Character> {
  await openProject(page, { projectId });
  const character = findCharacter(await listCharacters(page), ref);
  await page.goto(`${flowOrigin()}/project/${projectId}/character/${character.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Character name" }).waitFor({ timeout: 30_000 });
  await fillFields(page, fields);
  return finish(page, projectId, character.id, fields);
}

/** Flow's voice library, read from a character's voice picker (the project needs one character). */
export async function listVoices(page: Page, projectId: string): Promise<Voice[]> {
  await openProject(page, { projectId });
  const [first] = await listCharacters(page);
  if (!first) throw new Error("Flow shows its voices on a character's page; create a character first, then list voices.");
  await page.goto(`${flowOrigin()}/project/${projectId}/character/${first.id}`, { waitUntil: "domcontentloaded" });
  await openVoicePicker(page);
  try {
    return await readVoiceOptions(page);
  } finally {
    await page.getByRole("button", { name: "Close" }).first().click({ timeout: 5_000 }).catch(() => page.keyboard.press("Escape"));
    await openProject(page, { projectId });
  }
}

/** Puts characters into the agent prompt through the ingredient picker, in the order given. */
export async function attachCharacters(page: Page, refs: string[]): Promise<Character[]> {
  if (refs.length === 0) return [];
  const characters = await listCharacters(page);
  const picked = refs.map((r) => findCharacter(characters, r));
  for (const c of picked) {
    await page.getByRole("button", { name: "Add ingredients to the prompt box" }).click({ timeout: 30_000 });
    // Narrow the picker to characters, so media titled like the character can't be picked instead.
    await page.locator("mat-list-item").filter({ hasText: /^\W*accessibility_new\s*Characters\s*$/ }).first().click({ timeout: 5_000 }).catch(() => {});
    await page.locator('input[aria-label="Search assets"]').fill(c.name, { timeout: 5_000 }).catch(() => {});
    const option = page.getByRole("option").filter({ hasText: c.name }).first();
    try {
      await option.click({ timeout: 10_000 });
    } catch {
      await page.keyboard.press("Escape").catch(() => {});
      throw new Error(`Could not find the character "${c.name}" in Flow's ingredient picker.`);
    }
    await page.getByRole("button", { name: "Add to prompt" }).click({ timeout: 3_000 }).catch(() => {});
  }
  return picked;
}
