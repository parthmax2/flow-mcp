# Getting started

Install flow-mcp, sign in to Google Flow once, and connect your AI assistant.

## Requirements

- [Node.js](https://nodejs.org) 22 or newer
- Google Chrome
- A Google account that can open [Flow](https://flow.google.com). A free account works: it gets 50 Flow
  credits a day, and images are free.
- Windows is tested. macOS and Linux paths are written but untested.
- Flow set to English. Buttons are found by their English labels.

## Let your assistant set it up

Paste this to Claude Code, or any assistant that can run commands:

> Set up the Google Flow MCP server for me: run `npx -y @parthmax/flow-mcp setup --connect`. A Chrome
> window will open; tell me to sign in to Google there. When it is done, tell me to restart you.

The only thing you do is sign in to Google once in the window that opens. If you want uploads to confirm
Flow's "I hold the rights" notice automatically (only if you upload just your own files), tell your
assistant to add `--confirm-rights`. If you are ever signed out, your assistant opens the sign-in window
again itself, with the `flow_sign_in` tool.

## Set it up yourself

```bash
npx -y @parthmax/flow-mcp setup
```

It opens a Chrome window on Flow; sign in with the Google account to use. The session is kept in the
state folder (`~/.flow-mcp` by default), so you only do this once. `setup` then:

1. asks whether uploads may confirm Flow's rights notice for you,
2. offers to add itself to Claude Code and install the [flow-director skill](../skills/flow-director/SKILL.md),
3. prints the config for other clients.

Restart your AI client afterwards.

## Connect a client

`setup` connects Claude Code if you let it. Otherwise, or for other clients:

**Claude Code**

```bash
claude mcp add flow-mcp --scope user -- npx -y @parthmax/flow-mcp serve
```

**Cursor**: `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project)

```json
{
  "mcpServers": {
    "flow-mcp": { "command": "npx", "args": ["-y", "@parthmax/flow-mcp", "serve"] }
  }
}
```

**VS Code**: `.vscode/mcp.json` in the workspace, or the user `mcp.json`

```json
{
  "servers": {
    "flow-mcp": { "type": "stdio", "command": "npx", "args": ["-y", "@parthmax/flow-mcp", "serve"] }
  }
}
```

**Claude Desktop**: `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "flow-mcp": { "command": "npx", "args": ["-y", "@parthmax/flow-mcp", "serve"] }
  }
}
```

Any other MCP client works the same way: run `npx -y @parthmax/flow-mcp serve` over stdio.

If you set `FLOW_HOME` (see [Configuration](configuration.md)), pass the same value to the client: add
`-e FLOW_HOME=...` before `--` for Claude Code, or an `"env"` entry in the JSON configs.

## The flow-director skill

flow-mcp ships with a director's playbook for Flow. It asks only the follow-ups that matter, plans shots
and credits, previews everything as free images first, and knows how to prompt Veo, keep a character
consistent across shots, swap characters into footage and restyle video.

- **Claude Code:** `setup` installs it as the `flow-director` skill, or run `npx -y @parthmax/flow-mcp skill`.
- **Other clients:** use the server's `flow_director` prompt; its reference files are
  `flow://flow-director/...` resources.

## Run from source

```bash
git clone https://github.com/parthmax2/flow-mcp.git && cd flow-mcp
npm install && npm run build
node dist/cli.js setup
```

From a checkout, `setup` connects clients with `node <folder>/dist/cli.js serve` instead of `npx`.

## Next

- [Using flow-mcp](usage.md): projects, uploads, credits and the tools
- [Configuration](configuration.md): environment variables and several Google accounts
- [Troubleshooting](troubleshooting.md): the health check and common fixes
