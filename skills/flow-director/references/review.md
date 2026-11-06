# Reviewing results, retries and keeping a ledger

## Look at every result

Read the downloaded images yourself and, for videos, a mid and a last frame from `flow_frame`. Name what is wrong;
"looks off" can't be fixed. Check for:

| Defect | Look for |
|---|---|
| Wrong aspect or framing | Not the planned ratio; subject cut off; headroom gone |
| Identity drift | Face shape, hair, skin tone, marks or outfit differ from the sheet |
| Product drift | Label, logo, shape, color or proportions differ from the product photo |
| Style drift | Lighting, palette or medium differs from the style bible or earlier shots |
| Frozen or wrong motion | The clip barely moves, the action isn't the planned one, the camera move is wrong |
| Stray text | Words, captions, UI or garbled letters nobody asked for. Packaging and signs get garbled text even with "No text": name the props as plain or unbranded, or fix with an edit |
| Wrong text | Requested text not exactly as quoted |
| Body errors | Extra fingers or limbs, merged people, extra people |
| Sound | Unwanted music or dialogue, the wrong words, a line cut off at the end |
| Continuity | The first frame doesn't match the previous shot's last frame |

Can't look at images in this client? Say the result is unchecked and let the user review it; don't call it good.

## The first-shot gate

In a multi-shot piece, make shot 1, review it, and show it to the user before making the rest. It is the cheapest
point to find a wrong look, a voice they don't like, or a prompt Flow's agent keeps rewriting. After that, review
each shot before starting the next, since the next one starts from it.

## Retries

- **Free images:** at most 2 retries per image, and change the prompt each time (name the defect and its fix).
  Repeating the same prompt mostly repeats the problem. After that, show the best attempt and say what's off.
- **Paid videos:** never on your own. Tell the user the defect, the fix you'd make and its cost, and wait.
- Retry only the failed or defective item, never the whole set.
- A safety block or refusal: don't push the same idea through. Rephrase only if the request itself was fine and the
  wording tripped it (e.g. a weapon-like prop, a famous name); otherwise tell the user Flow won't make it. Blocks
  are not consistent: in testing (November 2026) a short one-line prompt with a child was blocked once and passed
  in another project, while a specific, clearly harmless version (age, clothing, action, expression) passed both
  times. In the same project, Flow's agent remembers the block, so rephrase rather than resend.
- `needs_answer` and `over_budget` are not failures and spent nothing; answer or report the quote.

## Keep a ledger

For anything longer than a couple of shots, keep a short table in the conversation (or in a file in the user's
working folder if they want one) and update it after each step:

| Shot | Role | Keyframe | Video media id | File | Credits | Status |
|---|---|---|---|---|---|---|
| 1 | hook | kf1.png | 3f2a... | output/shot1.mp4 | 10 | approved |

It lets you resume after an interruption without regenerating approved work: `flow_assets` lists what the project
already has, and `flow_wait` with the media id collects a render that was still running. Never start a second
render of a shot while the first may still be running.

## Deliver

List the files in shot order with a short label each ("shot 2, close-up, she opens the door"), the credits spent,
and anything unchecked or not done. Don't paste media ids, raw JSON or full prompts unless the user asks.
