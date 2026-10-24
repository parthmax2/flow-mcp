# AGENTS.md

Instructions for coding agents working on this repository. Product docs for users are in [docs/](docs/);
the summary for assistants that *use* flow-mcp is [llms.txt](llms.txt).

## What this is

An MCP server (TypeScript, Node 22+, ESM) that drives the Google Flow website in a local Chrome over the
DevTools protocol with `playwright-core`. There is no Flow API: every feature goes through Flow's own page.
See [docs/how-it-works.md](docs/how-it-works.md) for the source layout.

## Commands

```bash
npm run typecheck      # type-check sources and tests
npm test               # unit tests (vitest), no browser needed
npm run build          # compile src/ to dist/
npm run capabilities   # regenerate CAPABILITIES.md from src/capabilities.ts
npm run e2e            # end-to-end against a real signed-in Flow account (free actions only)
```

Run `typecheck` and `test` before calling a change done. `prepublishOnly` runs both plus `build`.

## Rules

- **Never spend credits without the user.** Do not run video generation, `flow_approve` or anything paid
  while developing or testing unless the user asked for that exact run. `npm run e2e` is limited to free
  actions; keep it that way.
- **Never weaken credit protection.** Approvals stay within `max_credits`, "Always approve" is never
  chosen, paid generations are never retried automatically.
- **Rights confirmation stays opt-in.** Uploads confirm Flow's rights notice only when the user said so.
- **Drive Flow through its UI.** Requests go through Flow's agent chat and buttons so the page does its
  own auth and verification. Do not call Google endpoints directly to bypass the page, and never add
  captcha solving or other evasion.
- **Flow is matched by English labels** (roles, names, `aria-label`). When Flow's UI changes, update the
  selector and make `flow_status` report the missing control (`ui_changed`).
- **Keep the user's session private.** Nothing from `FLOW_HOME`, `captures/`, `output/`, `data/` or
  `reference/` goes into the repo. Captures must pass through `src/capture/redact.ts`.

## Keeping docs in sync

- A new or changed feature: update `src/capabilities.ts`, run `npm run capabilities`, never edit
  `CAPABILITIES.md` by hand.
- A new or changed tool: update the tools table in [docs/usage.md](docs/usage.md), the tool list and count
  in [llms.txt](llms.txt) and the README ("18 Flow tools").
- Setup or client config changes: [docs/getting-started.md](docs/getting-started.md).
- New environment variable: [docs/configuration.md](docs/configuration.md).
- Credit costs are observations with a date ("October 2026"); update the date when you re-measure.
- Changes to how the assistant should direct Flow belong in `skills/flow-director/`.

## Style

- Match the surrounding code: ESM imports with `.js` extensions, block comments explaining *why* above
  non-obvious Flow behavior, one module per Flow feature in `src/flow/`.
- User-facing text is plain, short English. Say what happened and what to do next.
