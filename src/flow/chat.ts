import type { Page } from "playwright-core";
import { clearQuotaReached, quotaReachedAt, recordQuotaReached } from "../state/quota.js";
import { signedInEmail } from "./account.js";

/*
 * Reading the Flow agent chat as structured messages, so a connected AI sees exactly what
 * Flow said: its replies, its reasoning ("Show thinking") and any spend approval it asked for.
 */

export interface Approval {
  question: string;
  /** Credits Flow quoted, when the question states them. */
  credits?: number;
  /** True while Approve / Reject can still be chosen. */
  pending: boolean;
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  /** The agent's reasoning, when read with includeThinking. */
  thinking?: string;
  approval?: Approval;
  /** Images or videos shown in the message (attachments for the user, results for the agent). */
  mediaCount?: number;
  /** Generations Flow shows as failed in this message, e.g. "Failed: Something went wrong. Please try again." */
  failures?: string[];
}

// Material icon names that appear in the panel's text but are not message content.
const ICONS = new Set([
  "arrow_forward_ios",
  "thumb_up",
  "thumb_down",
  "content_copy",
  "flag",
  "check",
  "close",
  "play_arrow",
  "play_circle",
  "videocam",
  "image",
  "movie",
  "mic",
  "attach_file",
  "warning",
  // Attachment chips for characters, voices and avatars.
  "accessibility_new",
  "voice_selection",
  "face",
]);
// Controls inside agent messages. A user message can legitimately be just "Approve".
const AGENT_CONTROLS = new Set(["show thinking", "hide thinking", "approve", "always approve", "reject"]);

/** Runs in the page; kept as a string so the TypeScript loader's helpers are not injected. */
const READ_MESSAGES = `(() => {
  const rows = [...document.querySelectorAll(".messages-list .message-row")];
  return rows.map((row) => {
    const agent = row.classList.contains("agent-row");
    const chip = row.querySelector("flow-agent-event-chip");
    const chipButton = chip && chip.querySelector("button[aria-expanded]");
    const permission = row.querySelector("flow-permission-message");
    const radios = permission ? [...permission.querySelectorAll("[role=radio]")] : [];
    let thinking;
    if (chip && chipButton && chipButton.getAttribute("aria-expanded") === "true") thinking = chip.innerText;
    let body = row.innerText;
    if (chip) body = body.replace(chip.innerText, "");
    return {
      agent,
      body,
      thinking,
      permission: permission ? { pending: radios.some((r) => r.getAttribute("aria-disabled") === "false"), text: permission.innerText } : null,
      mediaCount: row.querySelectorAll("img, video").length,
      failures: [...row.querySelectorAll("flow-error-tile")].map((t) => t.textContent),
    };
  });
})()`;

interface RawMessage {
  agent: boolean;
  body: string;
  thinking?: string;
  permission: { pending: boolean; text: string } | null;
  mediaCount: number;
  failures: string[];
}

const COST = /costing\s+(\d+)\s+credits?/i;

export function cleanText(raw: string, role: ChatMessage["role"] = "agent"): string {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !ICONS.has(l.toLowerCase()) && !(role === "agent" && AGENT_CONTROLS.has(l.toLowerCase())))
    .join("\n");
}

function toMessage(raw: RawMessage): ChatMessage {
  const role = raw.agent ? "agent" : "user";
  const text = cleanText(raw.body, role);
  const message: ChatMessage = { role, text };
  const thinking = raw.thinking ? cleanText(raw.thinking) : "";
  if (thinking) message.thinking = thinking;
  if (raw.mediaCount) message.mediaCount = raw.mediaCount;
  const failures = raw.failures.map((f) => f.replace(/\s+/g, " ").replace(/^\s*warning\s*/i, "").replace(/^Failed\s*/, "Failed: ").trim());
  if (failures.length) message.failures = failures;
  if (raw.permission) {
    // The question sits in the message just above the approval buttons.
    const question = text.split("\n").reverse().find((l) => COST.test(l) || l.endsWith("?")) ?? text;
    const credits = question.match(COST)?.[1];
    message.approval = { question, ...(credits ? { credits: Number(credits) } : {}), pending: raw.permission.pending };
  }
  return message;
}

/** Expands every collapsed "Show thinking" section in the chat. */
async function expandThinking(page: Page): Promise<void> {
  const collapsed = page.locator('.messages-list flow-agent-event-chip button[aria-expanded="false"]');
  for (let i = await collapsed.count(); i > 0; i--) {
    await collapsed.first().click().catch(() => {});
  }
  await page.waitForTimeout(300);
}

export async function readTranscript(page: Page, options: { includeThinking?: boolean } = {}): Promise<ChatMessage[]> {
  if (options.includeThinking) await expandThinking(page);
  const raw = (await page.evaluate(READ_MESSAGES)) as RawMessage[];
  return raw.map(toMessage);
}

/** The approval the agent is currently waiting on, if any. */
export function pendingApproval(messages: ChatMessage[]): Approval | undefined {
  return [...messages].reverse().find((m) => m.approval?.pending)?.approval;
}

/**
 * Generations Flow reported as failed since the user's last message. A failed video is never
 * listed as project media: the chat's error tile is the only sign of it, and the agent may
 * still say in words that the video is queued.
 */
export function failuresSinceLastPrompt(messages: ChatMessage[]): string[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  return messages.slice(lastUser + 1).flatMap((m) => m.failures ?? []);
}

/*
 * Flow limits how many agent chat messages an account can send per day. When the limit is
 * reached the panel shows a notice ("You've reached your Flow Agent quota limit. Switch to
 * manual prompting or come back tomorrow") instead of a reply, and nothing is generated.
 * The notice is not a regular message row, so it is counted in the panel's text; comparing
 * counts before and after sending keeps an old notice in the history from being mistaken
 * for a new one.
 */
const AGENT_QUOTA = /reached your Flow Agent quota limit/gi;

export const AGENT_QUOTA_HELP =
  "Flow's daily agent limit is reached for this Google account, so Flow will not answer more requests today. " +
  "Nothing was generated and no credits were spent. Wait until tomorrow, upgrade the plan in Flow, or switch " +
  "to another Google account: in the Flow Chrome window click the profile picture (top right), sign out, sign " +
  "in with the other account, then run flow_status. Project ids belong to an account, so start new projects there.";

export class AgentQuotaError extends Error {
  constructor() {
    super(AGENT_QUOTA_HELP);
    this.name = "AgentQuotaError";
  }
}

export const countQuotaNotices = (panelText: string) => panelText.match(AGENT_QUOTA)?.length ?? 0;

/** How many daily-limit notices the agent panel shows now. */
export async function quotaNotices(page: Page): Promise<number> {
  return countQuotaNotices(await page.locator("flow-agent-panel").first().innerText().catch(() => ""));
}

/**
 * Throws AgentQuotaError when a new daily-limit notice appeared since `before` was counted,
 * remembering it for the account so flow_status can report it later.
 */
export async function assertNoNewQuotaNotice(page: Page, before: number): Promise<void> {
  if ((await quotaNotices(page)) <= before) return;
  const email = await signedInEmail(page);
  if (email) recordQuotaReached(email);
  throw new AgentQuotaError();
}

/** After a request Flow answered: the account's limit, if one was remembered, is over. */
export async function forgetQuotaIfOver(page: Page): Promise<void> {
  const email = await signedInEmail(page);
  if (email && quotaReachedAt(email)) clearQuotaReached(email);
}
