# Troubleshooting

Start with the health check. It names the problem and the fix (your assistant can run it too, as
`flow_status`):

```bash
npx -y @parthmax/flow-mcp status
```

| Status | Meaning |
|---|---|
| `ready` | Signed in and working |
| `browser_down` | The Flow Chrome window is not running or not reachable |
| `signed_out` | Nobody is signed in to Google in that window |
| `challenge` | Google wants a verification; finish it in the Chrome window |
| `blocked` | Google is blocking the account or the request |
| `ui_changed` | Flow's page changed; the report lists the controls that went missing |

## Common problems

- **Tools fail or say nobody is signed in:** run `npx -y @parthmax/flow-mcp setup` again and sign in, or
  ask your assistant to run `flow_sign_in`.
- **Chrome does not start, or port 9222 is busy:** close other Chrome windows started with remote
  debugging, or set `FLOW_CDP_PORT` to another port (for both `setup` and the client config).
- **A request stops at a step it used to pass:** Flow's website may have changed. Make sure Flow is in
  English, then [open an issue](https://github.com/parthmax2/flow-mcp/issues) with the error message and
  the `status` output.
- **A video was refused:** Flow quoted more than `max_credits`. Nothing was spent; ask again with a higher
  limit if you accept the price.
- **Chats and videos refuse to run in a project:** its agent is set to spend without asking. Switch it back
  with `flow_settings` (approval `always`).
