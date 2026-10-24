# How it works

```text
your request ──> AI assistant ──MCP (stdio)──> flow-mcp ──Chrome DevTools──> Chrome ──> Google Flow
                 Claude, Cursor,                server       127.0.0.1:9222      signed in
                 VS Code, ...                                                    as you
```

- **The MCP server** (`flow-mcp serve`) runs on your computer and exposes Flow as MCP tools, a
  `flow_director` prompt and `flow://flow-director/...` resources.
- **The Chrome window** is a normal Chrome with its own profile in `FLOW_HOME`. You sign in to Google there
  once. flow-mcp connects to it over the Chrome DevTools protocol on a local port.
- **Flow's own page does the work.** Requests are typed into Flow's agent chat and its buttons are pressed,
  so the page performs its own sign-in and verification exactly as when a person uses it. flow-mcp reads
  results from Flow's responses and downloads the media.
- **Local state** in `FLOW_HOME` records the projects flow-mcp made, their purpose, and which uploads
  are already in each project, so files are uploaded only once.

Nothing runs on a server and there is no API key. Your requests go to Google Flow under your own account.

## Source layout

| Path | What lives there |
|---|---|
| `src/server.ts` | MCP server: tool definitions, the `flow_director` prompt and resources |
| `src/cli.ts` | Command line: `setup`, `serve`, `status` and the terminal versions of the tools |
| `src/browser/` | Starting and connecting to Chrome, reading Flow's responses over DevTools |
| `src/flow/` | One module per Flow feature: chat, generate, video, upload, upscale, characters, ... |
| `src/state/` | Local registry of projects and uploads, and user preferences |
| `src/capabilities.ts` | Source of [CAPABILITIES.md](../CAPABILITIES.md) |
| `skills/flow-director/` | The flow-director skill and its reference files |
