#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { launchChrome } from "./browser/chrome.js";
import { disconnect, getFlowPage } from "./browser/connect.js";
import { Recorder } from "./capture/recorder.js";
import { config, FLOW_HOME, PROJECT_ROOT } from "./config.js";
import { waitForSignIn } from "./flow/account.js";
import { checkHealth } from "./flow/health.js";
import { savePreferences } from "./state/preferences.js";
import { PACKAGE_NAME, VERSION } from "./version.js";
import { generate } from "./flow/generate.js";
import { listAssets } from "./flow/assets.js";
import { listProjects } from "./flow/projects.js";
import { downloadOptions, upscale, type Size } from "./flow/upscale.js";
import { openProject, readCredits } from "./flow/ui.js";
import { chatTurn, transcript } from "./flow/session.js";
import { generateVideo } from "./flow/video.js";

async function chrome() {
  await launchChrome();
  console.log(`Chrome is running with the Flow profile at ${config.profileDir}.`);
  console.log("Sign in to Google in that window if you have not already. It stays signed in.");
}

/** The command an MCP client should run: npx for an installed package, node for a checkout. */
function serveCommand(): string[] {
  const installed = /[\\/](node_modules|_npx)[\\/]/.test(PROJECT_ROOT);
  return installed ? ["npx", "-y", PACKAGE_NAME, "serve"] : ["node", path.join(PROJECT_ROOT, "dist", "cli.js"), "serve"];
}

const quote = (arg: string) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

async function setup() {
  console.log(`flow-mcp ${VERSION} setup`);
  console.log(`State folder (Chrome profile, registry, downloads): ${FLOW_HOME}\n`);
  await launchChrome();
  const page = await getFlowPage();
  const email = await waitForSignIn(page, 10 * 60_000, () =>
    console.log("A Chrome window opened on Google Flow. Sign in there with the Google account to use (click 'Create with Google Flow').\nWaiting for sign-in..."),
  );
  await disconnect();
  if (!email) throw new Error("Nobody signed in within 10 minutes. Run `flow-mcp setup` again when ready.");
  console.log(`Signed in to Google Flow as ${email}. The session is kept in the state folder.\n`);

  // Questions only when someone is at the terminal; otherwise nothing is assumed.
  const interactive = process.stdin.isTTY && !args.includes("--no-prompt");
  const ask = async (question: string, onEnter: boolean): Promise<boolean> => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(question)).trim().toLowerCase();
    rl.close();
    return answer ? answer.startsWith("y") : onEnter;
  };

  if (interactive) {
    console.log("When a file is uploaded, Flow asks the uploader to confirm they hold the rights to it.");
    const confirm = await ask("Confirm that notice automatically for your uploads from now on? Only say yes if you only upload files you own. [y/N] ", false);
    savePreferences({ confirmUploadRights: confirm });
    console.log(confirm ? "Uploads will confirm the notice for you.\n" : "Uploads will ask first (your assistant passes confirm_rights after asking you).\n");
  }

  const command = serveCommand();
  const env = process.env.FLOW_HOME ? ["-e", `FLOW_HOME=${FLOW_HOME}`] : [];
  const addArgs = ["mcp", "add", "flow-mcp", "--scope", "user", ...env, "--", ...command];
  if (command[0] === "node" && !existsSync(command[1])) console.log(`Build it first: npm run build (creates ${command[1]}).\n`);

  const hasClaude = spawnSync("claude", ["--version"], { shell: true, stdio: "ignore" }).status === 0;
  if (hasClaude && interactive && (await ask("Add flow-mcp to Claude Code now? [Y/n] ", true))) {
    const added = spawnSync("claude", addArgs.map(quote), { shell: true, encoding: "utf8" });
    if (added.status === 0) console.log("Added to Claude Code. Restart Claude Code to use it.\n");
    else console.log(`Claude Code did not add it: ${(added.stderr || added.stdout).trim()}\n(If it already exists, remove it first: claude mcp remove flow-mcp --scope user)\n`);
  } else {
    console.log("Connect it to Claude Code with:\n");
    console.log(`  claude ${addArgs.map(quote).join(" ")}\n`);
  }
  console.log("Other MCP clients (Cursor, VS Code, Claude Desktop) use this server entry:\n");
  console.log(JSON.stringify({ "flow-mcp": { command: command[0], args: command.slice(1), ...(env.length ? { env: { FLOW_HOME } } : {}) } }, null, 2));
}

async function serve() {
  // stdout belongs to the MCP protocol from here on.
  const { startServer } = await import("./server.js");
  await startServer();
}

async function status() {
  const health = await checkHealth();
  console.log(`${health.ok ? "OK" : "PROBLEM"}: ${health.state}\n${health.details}${health.fix ? `\nFix: ${health.fix}` : ""}`);
  for (const c of health.ui ?? []) console.log(`  ${c.ok ? "ok     " : "MISSING"} ${c.where.padEnd(7)} ${c.control}`);
  await disconnect();
  if (!health.ok) process.exitCode = 2;
}

async function capture(label = "session") {
  const page = await getFlowPage();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(config.capturesDir, `${stamp}-${label}`);
  const recorder = new Recorder(page, outDir);
  await recorder.start();
  // Reloading makes the page fetch its bundles and bootstrap calls while we listen.
  await page.reload({ waitUntil: "domcontentloaded" });

  console.log(`Recording the Flow tab (${page.url()}).`);
  console.log("Do the action in Chrome now (e.g. generate one image), wait for it to finish,");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("then press Enter here to stop... ");
  rl.close();

  const file = await recorder.stop();
  console.log(`Saved ${recorder.count} requests to ${file}`);
  await disconnect();
}

async function image(...words: string[]) {
  const prompt = words.join(" ").trim();
  if (!prompt) throw new Error('Usage: npm run image -- "a red vintage car"');
  console.log(`Sending to Flow: ${prompt}`);
  const result = await generate({ prompt });
  console.log(JSON.stringify(result, null, 2));
  await disconnect();
}

async function edit(file: string, ...words: string[]) {
  const prompt = words.join(" ").trim();
  if (!file || !prompt) throw new Error('Usage: npm run edit -- "C:/path/photo.jpg" "make the sky pink"');
  console.log(`Uploading ${file} and asking Flow: ${prompt}`);
  const result = await generate({ prompt, images: [file] });
  console.log(JSON.stringify(result, null, 2));
  await disconnect();
}

async function credits() {
  console.log(`Flow credits: ${await readCredits(await getFlowPage())}`);
  await disconnect();
}

async function video(maxCredits: string, ...words: string[]) {
  const prompt = words.join(" ").trim();
  const max = Number(maxCredits);
  if (!prompt || !Number.isInteger(max)) throw new Error('Usage: npm run video -- <max_credits> "a paper boat on a pond"');
  console.log(`Asking Flow for a video (approving at most ${max} credits): ${prompt}`);
  console.log(JSON.stringify(await generateVideo({ prompt, maxCredits: max, waitForRender: true }), null, 2));
  await disconnect();
}

async function chat(...words: string[]) {
  const message = words.join(" ").trim();
  if (!message) throw new Error('Usage: npm run chat -- "your message to the Flow agent"');
  console.log(JSON.stringify(await chatTurn({ message }), null, 2));
  await disconnect();
}

async function showTranscript(projectId: string, mode?: string) {
  if (!projectId) throw new Error("Usage: npm run transcript -- <project_id> [think]");
  console.log(JSON.stringify(await transcript(projectId, mode === "think"), null, 2));
  await disconnect();
}

async function projects() {
  for (const p of await listProjects(await getFlowPage())) {
    console.log(`${p.id}  ${p.title}${p.purpose ? `  (${p.purpose})` : ""}${p.uploads ? `  [${p.uploads} uploads]` : ""}`);
  }
  await disconnect();
}

async function assets(projectId: string) {
  if (!projectId) throw new Error("Usage: npm run assets -- <project_id>");
  const page = await getFlowPage();
  await openProject(page, { projectId });
  for (const a of await listAssets(page)) {
    const size = a.width ? `${a.width}x${a.height}` : "";
    const length = a.durationSeconds ? ` ${a.durationSeconds.toFixed(1)}s` : "";
    console.log(`${a.id}  ${a.kind.padEnd(5)} ${a.source.padEnd(9)} ${(a.model ?? "-").padEnd(16)} ${size}${length}  "${a.title}"`);
  }
  await disconnect();
}

async function upscaleCmd(projectId: string, mediaId: string, size?: string) {
  if (!projectId || !mediaId) throw new Error("Usage: npm run upscale -- <project_id> <media_id> [1k|2k|4k]");
  const page = await getFlowPage();
  const result = size ? await upscale(page, projectId, mediaId, size as Size) : { options: await downloadOptions(page, projectId, mediaId) };
  console.log(JSON.stringify(result, null, 2));
  await disconnect();
}

const HELP = `flow-mcp ${VERSION} - Google Flow for AI assistants, through your own signed-in Chrome

Setup and serving:
  flow-mcp setup                       Open Chrome, sign in to Flow, print the line to connect an MCP client
  flow-mcp serve                       Run the MCP server (MCP clients start this themselves)

Direct use (handy for testing):
  flow-mcp status | credits | projects
  flow-mcp assets <project_id>
  flow-mcp image <prompt>              Images are free
  flow-mcp edit <file> <instruction>
  flow-mcp video <max_credits> <prompt>   Spends credits, never above max_credits
  flow-mcp chat <message> | transcript <project_id> [think]
  flow-mcp upscale <project_id> <media_id> [1k|2k|4k]
  flow-mcp chrome | capture [label]

State folder: ${FLOW_HOME} (set FLOW_HOME to change it)`;

async function help() {
  console.log(HELP);
}

const [cmd, ...args] = process.argv.slice(2);
const commands: Record<string, (...a: string[]) => Promise<void>> = {
  setup,
  serve,
  help,
  "--help": help,
  "-h": help,
  "--version": async () => console.log(VERSION),
  chrome,
  status,
  capture,
  image,
  edit,
  credits,
  video,
  chat,
  transcript: showTranscript,
  projects,
  assets,
  upscale: upscaleCmd,
};
const run = commands[cmd ?? "help"];
if (!run) {
  console.error(`Unknown command: ${cmd}\n\n${HELP}`);
  process.exit(1);
}
run(...args).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
