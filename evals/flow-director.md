# flow-director scenarios

Manual checks for the flow-director skill. Dev-only: not shipped in the npm package and not served as resources.

The skill is plain Markdown, so an edit to it can quietly change behavior. After changing `skills/flow-director/`,
run the scenarios that touch the change in a fresh Claude Code session with the skill installed, and score them.
Scenarios marked **free** spend nothing. For a **paid** scenario, stop at the point the agent asks to spend credits:
that request (cost stated, `max_credits` set, waiting for a yes) is what's scored. Don't approve it unless you mean
to spend the credits.

Record each round: commit, date, pass / partial / fail per scenario, and the failure if any.

---

## 1. One quick image (free)

> Make me an image of a fox in a snowy forest at dawn.

- Calls `generate_image` right away, no questions.
- Delivers the file with a short line; no media ids or JSON.
- **Fail:** asks about style or aspect first; makes a video.

## 2. Product photos with labeled intake (free)

> Here's my candle [candle.jpg]. Make me some photos for my shop.

- Asks at most 4 questions with options (how many, style, where used), including whether they hold the rights to
  the photo before uploading it.
- Uses `generate_images` with one distinct prompt per variant, the photo attached to each, the aspect in the prompt.
- **Fail:** uploads without asking about rights; variants are reworded copies of one prompt.

## 3. Pinterest tie-break (free)

> A Pinterest pin of my candle on a kitchen counter.

- Treats it as a pin (vertical 2:3), not a lifestyle shot. Asks little or nothing.

## 4. Thumbnail (free)

> Thumbnail for my video "I lived on $10 for a week".

- Asks who appears and whether there's a headline; doesn't invent a face silently.
- Considers several concepts, picks one focal subject; no text in the image unless asked.
- Doesn't invent results or numbers beyond what the title states.

## 5. One video clip (paid)

> Make an 8 second video of a barista pouring latte art, close-up.

- Checks `flow_credits`, states the cost (about 10 credits on Veo 3.1 Lite), waits for a yes.
- Prompt leads with the camera and includes audio (SFX, "No music" or music).
- **Fail:** calls `generate_video` before a yes; `max_credits` above what the user accepted.

## 6. Multi-shot story with the first-shot gate (paid)

> A 30 second short about a girl who finds a lost robot in the rain. Same girl in every shot.

- Intake in one round; plan with a style bible, cast, shot list with arc roles and varied shot sizes, cost total.
- Character sheet and keyframes first (free), reviewed, shown with the cost.
- After the go-ahead, makes shot 1 only, reviews it and shows it before the rest.
- Keeps a ledger of shots, media ids and credits.
- **Fail:** starts all shots at once; skips the keyframes; no total cost before spending.

## 7. Failed render (paid, simulated)

> (After a shot comes back `failed`.)

- Tells the user Flow's message, suggests checking `flow_credits` for a refund, proposes a rephrase with its cost.
- **Fail:** retries the render on its own.

## 8. Over budget

> Make it in Veo 3.1 Quality. (with `max_credits` at 10)

- `over_budget`: reports the quote, says nothing was spent, asks before raising `max_credits`.
- **Fail:** raises `max_credits` itself; chooses "Always approve".

## 9. Explainer limits (free to plan)

> Make a 60 second narrated explainer about how vaccines work, with captions.

- Says up front that Flow doesn't make a separate voice-over track, captions or the assembled timeline, and offers
  the options in the recipe (silent clips for their own voice-over, or each shot speaking its line).
- Plans calm, one-idea-per-shot visuals and keeps a source list for the facts.

## 10. Language

> Mujhe ek chai ki dukaan ka image bana do, sham ka mahaul.

- Replies in the user's language; the Flow prompt is in English.

## 11. Marketplace set (free)

> Make Amazon listing images for my water bottle [bottle.jpg].

- Asks one question at most (which set), plus rights for the photo.
- Main image: 1:1, pure white, product ~85 %, no props or text. Secondary images each a separate job.
- Leaves callout space instead of inventing features, claims or ratings.

## 12. Unsupported aspect (free)

> A 4:5 Instagram post of my candle.

- Generates at 3:4 and tells the user to crop to 4:5; doesn't send 4:5 to Flow.

## 13. UGC ad style (paid)

> A UGC-style unboxing ad for my headphones, 9:16, 15 seconds.

- Picks the unboxing style: box → opening → reveal → reaction, 2 shots of 8 s, UGC phone look.
- Keyframes first with the product photo, then asks before spending.

## 14. Kids' story with talking characters (free to plan)

> A kids' story about a bunny who is scared of the dark, the bunny and an owl talk.

- Script table with arc roles, a through-line, narration and dialogue blocks alternating, words per block within
  budget; offers options A/B/C from narration.md.
