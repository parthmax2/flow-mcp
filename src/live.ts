import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { getConnectedBrowser } from "./browser/connect.js";
import { config } from "./config.js";
import { creditsToday, listJobs, onJobUpdate, type Job } from "./jobs.js";

/*
 * The live view: a small page on this machine (127.0.0.1 only) that shows every job as it
 * happens, with thumbnails of the results, and a thin banner in the Flow window with the
 * current step. Both follow the same job feed the assistant reads with flow_job.
 */

const PORT = Number(process.env.FLOW_LIVE_PORT ?? 7777);
let server: Server | undefined;
const clients = new Set<ServerResponse>();

export const liveUrl = () => `http://127.0.0.1:${PORT}/`;

function send(res: ServerResponse, job: Job): void {
  res.write(`data: ${JSON.stringify({ job, creditsToday: creditsToday() })}\n\n`);
}

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };

/** Starts the live page once; a busy port (another flow-mcp running it) is not an error. */
export function startLive(): Promise<string | undefined> {
  if (process.env.FLOW_LIVE === "0") return Promise.resolve(undefined);
  if (server) return Promise.resolve(liveUrl());
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url ?? "/", liveUrl());
      if (url.pathname === "/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        for (const job of listJobs(12).reverse()) send(res, job);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname === "/media") {
        // Only files inside the output folder, so the page can never read anything else.
        const file = path.resolve(url.searchParams.get("f") ?? "");
        const root = path.resolve(config.outputDir) + path.sep;
        if (!file.startsWith(root) || !existsSync(file) || !TYPES[path.extname(file).toLowerCase()]) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()], "content-length": statSync(file).size });
        createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    });
    s.on("error", () => resolve(undefined));
    s.listen(PORT, "127.0.0.1", () => {
      server = s;
      onJobUpdate((job) => {
        for (const res of clients) send(res, job);
        void banner(job);
      });
      resolve(liveUrl());
    });
  });
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

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>flow-mcp live</title>
<style>
:root{--bg:#f4f5f2;--panel:#fff;--ink:#1c1f1b;--muted:#6a7066;--line:#e1e4dd;--go:#2f7d4f;--go-soft:#e3f2e8;--warn:#b4610f;--warn-soft:#fdf0e1;--stop:#b3261e;--stop-soft:#fbe6e4;--run:#2c5ea8;--run-soft:#e5edf9;--mono:ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#141613;--panel:#1c1f1b;--ink:#e9ece6;--muted:#9aa196;--line:#30352e;--go:#69c08c;--go-soft:#1d3326;--warn:#e9a35a;--warn-soft:#3a2a17;--stop:#f08a83;--stop-soft:#3d1d1b;--run:#7fa8e6;--run-soft:#1c2a40}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:12px max(16px,3vw);display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center}
h1{font-size:17px;margin:0;font-weight:650}.pill{font-size:12.5px;padding:3px 10px;border-radius:99px;background:var(--panel);border:1px solid var(--line);font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);margin-right:6px}.on .dot{background:var(--go)}
main{padding:18px max(16px,3vw) 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:start}
.empty{color:var(--muted);padding:30px 0}
.job{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.job.needs_user{border-color:var(--stop)}
.jh{padding:12px 14px 10px;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line)}
.jh h2{font-size:14.5px;margin:0 0 2px;font-weight:620;overflow-wrap:anywhere}.sub{color:var(--muted);font-size:12.5px}
.state{font-size:12px;font-weight:650;padding:3px 9px;border-radius:99px;white-space:nowrap;align-self:start}
.running,.rendering{background:var(--run-soft);color:var(--run)}.done{background:var(--go-soft);color:var(--go)}.needs_user,.failed{background:var(--stop-soft);color:var(--stop)}.heal{background:var(--warn-soft);color:var(--warn)}
.bar{height:4px;background:var(--line)}.bar i{display:block;height:100%;background:var(--run);transition:width .5s}
ol{list-style:none;margin:0;padding:10px 14px 12px}li{display:grid;grid-template-columns:22px 1fr auto;gap:8px;padding:4px 0}
.ic{text-align:center}.t{color:var(--muted);font:12px var(--mono)}.why{display:block;color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
li.k-heal .tx{color:var(--warn)}li.k-need .tx,li.k-error .tx{color:var(--stop);font-weight:600}li.k-done .tx{color:var(--go);font-weight:600}
.thumbs{display:flex;gap:8px;padding:0 14px 12px;flex-wrap:wrap}.thumbs img,.thumbs video{height:72px;border-radius:6px;border:1px solid var(--line);background:#000}
.fix{margin:0 14px 14px;padding:9px 11px;border-radius:8px;background:var(--stop-soft);font-size:13px}.fix b{color:var(--stop)}
</style></head><body>
<header><h1>flow-mcp live</h1><span class="pill" id="conn"><span class="dot"></span>connecting…</span><span class="pill">Credits approved today: <b id="credits">0</b></span></header>
<main id="jobs"><div class="empty">No jobs yet. Ask your assistant for an image or a video and it shows up here.</div></main>
<script>
const jobs=new Map(),root=document.getElementById("jobs");
const fmt=t=>new Date(t).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const label={running:"Working",rendering:"Rendering",done:"Done",needs_user:"Needs you",failed:"Failed"};
function render(){
  const list=[...jobs.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,24);
  if(!list.length)return;
  root.innerHTML=list.map(j=>{
    const healing=j.state==="running"&&j.steps.at(-1)?.kind==="heal";
    const files=(j.files||[]).slice(0,6).map(f=>/\\.mp4$/i.test(f)?'<video muted loop autoplay playsinline src="/media?f='+encodeURIComponent(f)+'"></video>':'<img src="/media?f='+encodeURIComponent(f)+'" alt="">').join("");
    const pct=j.state==="done"?100:(j.percent??Math.min(90,j.steps.length*12));
    return '<section class="job '+j.state+'"><div class="jh"><div><h2>'+esc(j.title)+'</h2><div class="sub">'+esc(j.tool)+' · '+fmt(j.startedAt)+(j.credits?' · '+j.credits+' credits':'')+'</div></div><span class="state '+(healing?"heal":j.state)+'">'+(healing?"Fixing itself":label[j.state])+'</span></div>'
      +'<div class="bar"><i style="width:'+pct+'%;'+(j.state==="done"?"background:var(--go)":j.state==="needs_user"||j.state==="failed"?"background:var(--stop)":"")+'"></i></div>'
      +'<ol>'+j.steps.map(s=>'<li class="k-'+(s.kind||"info")+'"><span class="ic">'+esc(s.icon)+'</span><span class="tx">'+esc(s.text)+(s.detail?'<span class="why">'+esc(s.detail)+'</span>':'')+'</span><span class="t">'+fmt(s.at)+'</span></li>').join("")+'</ol>'
      +(files?'<div class="thumbs">'+files+'</div>':'')
      +((j.state==="needs_user"||j.state==="failed")&&j.fix?'<div class="fix"><b>'+esc(j.reason||"")+':</b> '+esc(j.fix)+'</div>':'')+'</section>';
  }).join("");
}
function connect(){
  const es=new EventSource("/events"),conn=document.getElementById("conn");
  es.onopen=()=>{conn.className="pill on";conn.innerHTML='<span class="dot"></span>Live';};
  es.onmessage=e=>{const d=JSON.parse(e.data);jobs.set(d.job.id,d.job);document.getElementById("credits").textContent=d.creditsToday;render();};
  es.onerror=()=>{conn.className="pill";conn.innerHTML='<span class="dot"></span>Reconnecting… (is flow-mcp running?)';};
}
connect();
</script></body></html>`;
