# Configuration

flow-mcp needs no configuration after `setup`. These environment variables change its defaults.

| Variable | Default | Purpose |
|---|---|---|
| `FLOW_HOME` | `~/.flow-mcp` | State folder: Chrome profile, registry, downloads, captures |
| `FLOW_OUTPUT_DIR` | `$FLOW_HOME/output` | Where downloaded media is saved |
| `FLOW_CDP_PORT` | `9222` | Local port of the controlled Chrome window |
| `FLOW_CHROME_PATH` | auto-detected | Chrome executable, if it is not found |
| `FLOW_CONFIRM_RIGHTS` | setup choice | `1` or `0` to override whether uploads confirm Flow's rights notice |

`FLOW_HOME` holds your signed-in Google session. Keep it private and out of version control.

Set the same values for `setup` and for the MCP client: add `-e NAME=value` before `--` for Claude Code,
or an `"env"` entry in the JSON configs shown in [Getting started](getting-started.md#connect-a-client).

## Switching Google accounts

**Change the account:** in the Flow Chrome window, sign out (avatar, top right) and sign in with the
other account. Nothing else changes.

**Keep several accounts:** give each one its own state folder, and its own port if two should run at the
same time:

```bash
FLOW_HOME=~/.flow-mcp-work FLOW_CDP_PORT=9223 npx -y @parthmax/flow-mcp setup
```

Then add a second server entry in your client with the same `FLOW_HOME` and `FLOW_CDP_PORT` (for example
named `flow-mcp-work`).
