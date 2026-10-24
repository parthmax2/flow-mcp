import { failuresSinceLastPrompt, type ChatMessage } from "./chat.js";
import { chatTurn, decide, waitForMedia, type MediaInfo, type ProgressFn } from "./session.js";
import { serialize, type DownloadedMedia, type ProjectChoice } from "./ui.js";

/*
 * One-call video generation, composed from the turn-by-turn steps in session.ts: ask the
 * agent, approve its quote only within budget (never "Always approve", never a retry), then
 * wait for the render and download it. Every result carries what the agent said.
 */

export const VIDEO_MODELS = {
  "veo-3.1-lite": "Veo 3.1 - Lite",
  "veo-3.1-fast": "Veo 3.1 - Fast",
  "veo-3.1-quality": "Veo 3.1 - Quality",
  "omni-1.1-flash": "Omni 1.1 Flash",
} as const;
export type VideoModel = keyof typeof VIDEO_MODELS;

export interface VideoOptions extends ProjectChoice {
  prompt: string;
  model?: VideoModel;
  aspectRatio?: "16:9" | "9:16";
  /** Local images or videos to attach, e.g. a start frame or a motion reference (uploaded once per project). */
  images?: string[];
  /** The user confirmed they hold the rights to these files (Flow asks on upload). */
  confirmRights?: boolean;
  /** Media already in the project to attach. */
  mediaIds?: string[];
  /*
   * Inputs with a stated role, each a local file or a project media id. The agent is told
   * which attachment is which, instead of guessing from a plain list.
   */
  /** Image the video must open on, e.g. the previous shot's last frame (flow_frame). */
  startFrame?: string;
  /** Image the video must end on. */
  endFrame?: string;
  /** Character, object, setting or style references whose look must be kept; not frames. */
  ingredients?: string[];
  /** Video to edit or restyle (an Omni video-to-video edit). */
  sourceVideo?: string;
  /** Flow characters (names or ids, see flow_characters): keep their look, and their voice when they speak. */
  characters?: string[];
  /** Highest credit cost to approve. Defaults to 10, one Veo 3.1 Lite video. */
  maxCredits?: number;
  /**
   * Wait for the render after approval. Off by default: rendering takes minutes, longer than
   * many MCP clients allow a tool call, so the result is "started" and flow_wait collects it.
   */
  waitForRender?: boolean;
  /** With waitForRender: how long to wait before reporting the render as pending. */
  renderTimeoutMs?: number;
  onProgress?: ProgressFn;
}

interface Base {
  projectId: string;
  projectUrl: string;
  /** Everything said in the chat during this call, agent replies included. */
  messages: ChatMessage[];
}

export type VideoResult =
  | (Base & { status: "completed"; credits: number; files: DownloadedMedia[] })
  /** Approved and rendering; collect it with flow_wait (media ids, or since). */
  | (Base & { status: "started"; credits: number; media: MediaInfo[]; since: number })
  /** The agent replied without quoting a cost (usually a question); answer with flow_chat. */
  | (Base & { status: "needs_answer"; agentMessage: string })
  | (Base & { status: "over_budget"; credits: number; maxCredits: number; agentMessage: string })
  /** Approved, but Flow reported the render as failed (usually refunded: check flow_credits). */
  | (Base & { status: "failed"; credits: number; failures: string[] })
  /** Approved and rendering, but not finished in time; fetch later with flow_wait. */
  | (Base & { status: "pending"; credits: number; media: MediaInfo[]; since: number });

export function generateVideo(options: VideoOptions): Promise<VideoResult> {
  return serialize(() => runVideo(options));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

type Role = "start" | "end" | "ingredient" | "source" | "plain" | "character";

export interface PlannedInputs {
  files: string[];
  mediaIds: string[];
  characters: string[];
  /** Sentences telling the agent what each numbered attachment is for. */
  roles: string[];
}

/**
 * Orders every input the way they are attached (local files first, then project media, then
 * characters, each in the given order) and describes each role by its attachment number.
 */
export function planInputs(options: VideoOptions): PlannedInputs {
  const entries: { ref: string; role: Role }[] = [
    ...(options.startFrame ? [{ ref: options.startFrame, role: "start" as const }] : []),
    ...(options.endFrame ? [{ ref: options.endFrame, role: "end" as const }] : []),
    ...(options.sourceVideo ? [{ ref: options.sourceVideo, role: "source" as const }] : []),
    ...(options.ingredients ?? []).map((ref) => ({ ref, role: "ingredient" as const })),
    ...(options.images ?? []).map((ref) => ({ ref, role: "plain" as const })),
    ...(options.mediaIds ?? []).map((ref) => ({ ref, role: "plain" as const })),
  ];
  for (const { ref, role } of entries) {
    if (UUID.test(ref)) continue;
    if ((role === "start" || role === "end") && !IMAGE_EXT.test(ref)) throw new Error(`The ${role} frame must be an image (png, jpg, webp), not ${ref}.`);
    if (role === "source" && !VIDEO_EXT.test(ref)) throw new Error(`source_video must be a video (mp4, mov, webm), not ${ref}.`);
  }

  const characters = (options.characters ?? []).map((ref) => ({ ref, role: "character" as const }));
  const ordered = [...entries.filter((e) => !UUID.test(e.ref)), ...entries.filter((e) => UUID.test(e.ref)), ...characters];
  const numbers = (role: Role) => ordered.flatMap((e, i) => (e.role === role ? [i + 1] : []));
  const list = (ns: number[]) => (ns.length === 1 ? `Attachment ${ns[0]} is` : `Attachments ${ns.slice(0, -1).join(", ")} and ${ns.at(-1)} are`);
  const roles: string[] = [];
  const [start] = numbers("start");
  const [end] = numbers("end");
  const [source] = numbers("source");
  const ingredients = numbers("ingredient");
  if (start) roles.push(`Attachment ${start} is the first frame: the video opens exactly on it.`);
  if (end) roles.push(`Attachment ${end} is the last frame: the video ends exactly on it.`);
  if (source) roles.push(`Attachment ${source} is the video to edit: keep its motion, timing and framing unless asked otherwise.`);
  if (ingredients.length) {
    roles.push(`${list(ingredients)} references (ingredients) for the characters, objects, setting or style: keep their look exactly, and do not use them as frames.`);
  }
  for (const n of numbers("character")) {
    const ref = ordered[n - 1].ref;
    const name = UUID.test(ref) ? "a Flow character" : `the Flow character "${ref}"`;
    roles.push(`Attachment ${n} is ${name}: keep their look exactly, and their voice when they speak.`);
  }
  return {
    files: ordered.filter((e) => e.role !== "character" && !UUID.test(e.ref)).map((e) => e.ref),
    mediaIds: ordered.filter((e) => e.role !== "character" && UUID.test(e.ref)).map((e) => e.ref),
    characters: characters.map((e) => e.ref),
    roles,
  };
}

function composePrompt(options: VideoOptions, roles: string[]): string {
  const parts = [options.prompt.trim(), ...roles];
  if (options.model) parts.push(`Use ${VIDEO_MODELS[options.model]}.`);
  if (options.aspectRatio) parts.push(`Aspect ratio ${options.aspectRatio}.`);
  return parts.join(" ");
}

async function runVideo(options: VideoOptions): Promise<VideoResult> {
  const maxCredits = options.maxCredits ?? 10;
  const progress = options.onProgress ?? (() => {});
  const inputs = planInputs(options);

  progress("asking the Flow agent");
  const asked = await chatTurn({
    message: composePrompt(options, inputs.roles),
    attachments: inputs.files,
    confirmRights: options.confirmRights,
    mediaIds: inputs.mediaIds,
    characters: inputs.characters,
    projectId: options.projectId,
    newProject: options.newProject,
    newProjectTitle: options.newProjectTitle,
    projectPurpose: options.projectPurpose,
    newSession: options.newSession,
  });
  const base = { projectId: asked.projectId, projectUrl: asked.projectUrl };
  const quote = asked.pendingApproval;
  if (!quote || quote.credits === undefined) return { ...base, messages: asked.messages, status: "needs_answer", agentMessage: asked.reply };

  progress(`Flow quoted ${quote.credits} credits (budget ${maxCredits})`);
  const decided = await decide({ projectId: asked.projectId, decision: "approve", maxCredits });
  const messages = [...asked.messages, ...decided.messages];
  if (decided.decision !== "approved") {
    return { ...base, messages, status: "over_budget", credits: quote.credits, maxCredits, agentMessage: asked.reply };
  }

  const failedAtOnce = failuresSinceLastPrompt(decided.messages);
  if (failedAtOnce.length && decided.media.length === 0) {
    progress("Flow reported the video as failed");
    return { ...base, messages, status: "failed", credits: quote.credits, failures: failedAtOnce };
  }

  if (!options.waitForRender) {
    progress("approved; rendering in Flow");
    return { ...base, messages, status: "started", credits: quote.credits, media: decided.media, since: decided.since };
  }

  progress("approved; waiting for the render");
  const waited = await waitForMedia({
    projectId: asked.projectId,
    since: decided.since,
    ...(decided.media.length ? { mediaIds: decided.media.map((m) => m.id) } : {}),
    timeoutMs: options.renderTimeoutMs ?? 15 * 60_000,
    onProgress: progress,
  });
  const all = [...messages, ...waited.messages];
  if (waited.status === "failed") return { ...base, messages: all, status: "failed", credits: quote.credits, failures: waited.failures ?? [] };
  if (waited.files.length === 0 || waited.pending.length > 0) {
    return { ...base, messages: all, status: "pending", credits: quote.credits, media: [...decided.media, ...waited.pending], since: decided.since };
  }
  return { ...base, messages: all, status: "completed", credits: quote.credits, files: waited.files };
}
