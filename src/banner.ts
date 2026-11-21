import { getConnectedBrowser } from "./browser/connect.js";
import { config } from "./config.js";
import { onJobUpdate, type Job } from "./jobs.js";

/*
 * A thin bar on top of the Flow window with the current job's step, so whoever watches the
 * window sees what the tool is doing (and that the approval cards are its business). It never
 * takes clicks and fades out after a job finishes. The chat shows the same steps as progress.
 */

let started = false;

/** Follows the job feed and mirrors each step into the Flow window's banner (FLOW_BANNER=0 turns it off). */
export function startBanner(): void {
  if (started || process.env.FLOW_BANNER === "0") return;
  started = true;
  onJobUpdate((job) => void banner(job));
}

const BANNER_ID = "flow-mcp-banner";

/** Shows the job's current step in a thin bar on top of every Flow tab; it never takes clicks. */
async function banner(job: Job): Promise<void> {
  const browser = getConnectedBrowser();
  if (!browser) return;
  const host = new URL(config.flowUrl).host;
  const last = job.steps.at(-1);
  const color = job.state === "needs_user" ? "#b3261e" : job.state === "failed" ? "#8a1c16" : last?.kind === "heal" ? "#b4610f" : job.state === "done" ? "#2f7d4f" : "#2c5ea8";
  const text = `flow-mcp · ${last ? `${last.icon} ${last.text}` : "working"}${job.percent !== undefined && job.state !== "done" ? ` · ${job.percent}%` : ""}${job.state === "needs_user" ? " · see your assistant" : ""}`;
  const finished = job.state === "done";
  for (const page of browser.contexts().flatMap((c) => c.pages())) {
    try {
      if (new URL(page.url()).host !== host) continue;
    } catch {
      continue;
    }
    await page
      .evaluate(
        ({ id, text, color, finished }) => {
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.style.cssText =
              "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;" +
              "font:600 13px system-ui,sans-serif;color:#fff;padding:5px 14px;border-radius:0 0 10px 10px;" +
              "box-shadow:0 2px 10px rgba(0,0,0,.25);max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .4s";
            document.body.appendChild(el);
          }
          el.textContent = text;
          el.style.background = color;
          el.style.opacity = "1";
          const w = window as unknown as { __flowMcpHide?: number };
          clearTimeout(w.__flowMcpHide);
          if (finished) w.__flowMcpHide = window.setTimeout(() => el && (el.style.opacity = "0"), 6000);
        },
        { id: BANNER_ID, text, color, finished },
      )
      .catch(() => {});
  }
}
