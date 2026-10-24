# flow-mcp

An MCP server that lets AI assistants (Claude Code, Cursor, VS Code, Claude Desktop) use
[Google Flow](https://flow.google.com): generate and edit images, make Veo and Omni videos, upscale, and
work with Flow's creative agent. It drives the Flow website in a Chrome window signed in to **your own**
Google account, so it uses your Flow plan and credits. There is no API key and nothing runs on a server.

> **Status: alpha.** It works end to end on Windows with an English-language Flow account.
> This is an unofficial, independent project. It is not affiliated with, endorsed by or sponsored by
> Google. Google and Google Flow are trademarks of Google LLC.

## Before you use it

- **Google's terms.** This automates the Flow website. Google may consider that against its terms and
  could limit or block the account. Use it at your own risk, with an account you are prepared to risk,
  at a human pace. It does not solve or bypass captchas or other protections.
- **Uploads and rights.** When you upload a file, Flow asks you to confirm you hold the rights to it.
  This tool only confirms that when you say so: per request (your assistant asks you), or once for all
  your uploads if you choose that during `setup`. Only attach files you own or may use.
- **Local control port.** The Chrome window this tool opens listens on `127.0.0.1:9222` so the server
  can drive it. Any program running on your computer can reach that port and act as your signed-in
  Google account. Do not run it on a shared or untrusted machine.
- **Keep Flow in English.** Buttons are found by their English labels.

## Requirements

- [Node.js](https://nodejs.org) 22 or newer
- Google Chrome
- A Google account that can open Flow. A free account works: it gets 50 Flow credits a day.
- Windows is tested. macOS and Linux paths are written but untested.

## Setup

```bash
npx -y flow-mcp setup
```

That is all. It opens a Chrome window on Flow; sign in with the Google account to use. The session is
kept in the state folder (`~/.flow-mcp` by default), so you only do this once. `setup` then asks whether
uploads may confirm Flow's rights notice for you, offers to add itself to Claude Code, and prints the
config for other clients. Restart your AI client afterwards.

## Connect a client

`setup` does this for Claude Code if you let it. Otherwise, or for other clients:

**Claude Code**

```bash
claude mcp add flow-mcp --scope user -- npx -y flow-mcp serve
```

**Cursor** — `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "flow-mcp": { "command": "npx", "args": ["-y", "flow-mcp", "serve"] }
  }
}
```

**VS Code** — `.vscode/mcp.json` in the workspace, or the user `mcp.json`:

```json
{
  "servers": {
    "flow-mcp": { "type": "stdio", "command": "npx", "args": ["-y", "flow-mcp", "serve"] }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flow-mcp": { "command": "npx", "args": ["-y", "flow-mcp", "serve"] }
  }
}
```

If you set `FLOW_HOME` (see [Configuration](#configuration)), pass the same value to the client: add
`-e FLOW_HOME=...` before `--` for Claude Code, or an `"env"` entry in the JSON configs.

## Switching Google accounts

- **Change the account:** in the Flow Chrome window, sign out (avatar, top right) and sign in with the
  other account. Nothing else changes.
- **Keep several accounts:** give each one its own state folder, and its own port if two should run at
  the same time:

  ```bash
  FLOW_HOME=~/.flow-mcp-work FLOW_CDP_PORT=9223 npx -y flow-mcp setup
  ```

  Then add a second server entry in your client with the same `FLOW_HOME` and `FLOW_CDP_PORT`
  (for example named `flow-mcp-work`).

## Running from source

```bash
git clone https://github.com/parthmax2/flow-mcp.git && cd flow-mcp
npm install && npm run build
node dist/cli.js setup
```

From a checkout, `setup` connects clients with `node <folder>/dist/cli.js serve` instead of `npx`.

## Using it

Ask your assistant in plain words, for example *"make an image of a lighthouse at dusk"*, *"edit my
photo C:\photos\me.jpg into a winter scene"* or *"make an 8 second video of a paper boat, max 10 credits"*.

While it works, a Chrome window shows Flow doing the job. Leave that window open, and don't type in
its Flow tab during a request. Downloads are saved to `~/.flow-mcp/output` by default.

### Credits are protected

- **Images are free.** They never need credits.
- **Videos cost credits, and Flow's agent quotes the price first** ("costing 10 credits?"). The server
  approves only when the quote is within the `max_credits` you allow (default 10). A higher quote is
  rejected and nothing is spent.
- It never chooses Flow's "Always approve", and it never retries a paid generation on its own.
- If a project's agent is set to spend without asking (Agent settings: "Never"), chats and videos refuse to
  run there until it is switched back (`flow_settings` with approval `always`).
- The assistant is instructed to tell you the cost and ask before approving. Check the balance with
  `flow_credits` at any time.

Observed on a free account (October 2026): an 8 s Veo 3.1 Lite video costs 10 credits, an Omni 1.1 Flash
video-to-video edit costs 20 credits at 720p, and image upscaling to 2K is free.

### Projects and uploads

Every request that creates something names a project: an existing `project_id` to keep working on the
same piece (the agent remembers it and your uploads are reused), or `new_project_title` to start a new
idea. Local files are uploaded once per project, recognised by their content, and reused afterwards.

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `flow_status` | Health check: signed-in account, credits, and what is wrong if something is | free |
| `flow_credits` | Remaining Flow credits | free |
| `flow_projects` | Lists projects, with the purpose and uploads recorded for ones this tool made | free |
| `flow_assets` | Lists a project's images and videos with ids, sources and duplicate uploads | free |
| `flow_trash` | Moves media to Flow's trash: previews first, moves only with the confirmation code | free |
| `generate_image` | Creates or edits images; attach files or project media to edit or combine | free |
| `flow_upscale` | Downloads an image at 2K (free) or 4K (paid plans), or lists the sizes offered | free / plan |
| `flow_chat` | Sends one message to Flow's agent and returns its exact reply | free |
| `flow_approve` | Approves or rejects the agent's spend request, within `max_credits` | quoted credits |
| `flow_wait` | Waits for media to finish and downloads it | free |
| `flow_transcript` | Reads a project's agent conversation | free |
| `flow_settings` | Reads or sets a project's defaults (image/video count, aspect, model) and agent instructions | free |
| `generate_video` | Starts a video: asks, approves within budget, returns once rendering; `flow_wait` collects it | quoted credits |
| `flow_capabilities` | Lists everything Flow offers and what this server covers | free |

The full feature list, with costs and plan limits, is in [CAPABILITIES.md](CAPABILITIES.md).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FLOW_HOME` | `~/.flow-mcp` | State folder: Chrome profile, registry, downloads, captures |
| `FLOW_OUTPUT_DIR` | `$FLOW_HOME/output` | Where downloaded media is saved |
| `FLOW_CDP_PORT` | `9222` | Local port of the controlled Chrome window |
| `FLOW_CHROME_PATH` | auto-detected | Chrome executable, if it is not found |
| `FLOW_CONFIRM_RIGHTS` | setup choice | `1` or `0` to override whether uploads confirm Flow's rights notice |

`FLOW_HOME` holds your signed-in Google session. Keep it private and out of version control.

## Troubleshooting

Start with the health check, which names the problem and the fix (your assistant can run it too, as
`flow_status`):

```bash
npx -y flow-mcp status
```

It reports `ready`, or `browser_down`, `signed_out`, `challenge` (Google wants a verification),
`blocked`, or `ui_changed` with the list of page controls that went missing.

- **Tools fail or say nobody is signed in:** run `npx -y flow-mcp setup` again and sign in.
- **Chrome does not start, or port 9222 is busy:** close other Chrome windows started with remote
  debugging, or set `FLOW_CDP_PORT` to another port (for both `setup` and the client config).
- **A request stops at a step it used to pass:** Flow's website may have changed. Make sure Flow is in
  English, then report it with the error message.

## Command line

The same features work from a terminal, which helps when testing: `npx -y flow-mcp help` lists them
(`status`, `credits`, `projects`, `assets`, `image`, `edit`, `video`, `chat`, `transcript`, `upscale`).

## Development

```bash
npm run typecheck      # type-check sources and tests
npm test               # unit tests
npm run build          # compile to dist/
npm run capabilities   # regenerate CAPABILITIES.md from src/capabilities.ts
npm run e2e            # end-to-end test of the built server against your Flow account (free actions only)
```

## License

MIT. See [LICENSE](LICENSE). Provided as is, without warranty; you are responsible for how you use it
and for your Google account.
