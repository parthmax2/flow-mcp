# Recipes by request type

Pick the recipe by what the user wants to end up with, not by a keyword. When two fit, the more specific one wins.
Each recipe lists the questions worth asking (as labeled options, at most 4, skip any the request already answers),
the plan, and the cost. Images are free, so image recipes can make variants generously. Video recipes follow
SKILL.md steps 3-6.

## Routing

| The user wants | Recipe | Cost |
|---|---|---|
| Product on white / studio / catalog | Product images → studio | Free |
| Product in a real place, in use | Product images → lifestyle | Free |
| Hands holding / applying the product | Product images → close-up | Free |
| Pinterest pin, vertical moodboard | Product images → pin | Free |
| Website / email header | Product images → hero banner | Free |
| Swipeable multi-slide post | Product images → carousel | Free |
| Several static ads for paid social | Product images → ad pack | Free |
| Product worn by a model, lookbook | Product images → on a model | Free |
| Floating, splash, surreal product | Product images → conceptual | Free |
| Same image, new mood or season | Product images → restyle | Free |
| Amazon / Flipkart / Shopify listing images, A+ content | Marketplace set | Free |
| YouTube thumbnail, Shorts or Reels cover | Thumbnail | Free |
| Poster, flyer, event banner with words | Poster | Free |
| Ad video: UGC, unboxing, how-to, review, showcase, TV spot, try-on | Video ad | Credits |
| Short film, story, music video | Story | Credits |
| Explainer, documentary, faceless channel, kids' video, picture story | Narrated piece | Free to credits |
| Real estate, travel, food, fashion, app promo, event promo | Domain recipes | Free to credits |
| Before and after | Before and after | Free / credits |

Tie-breakers: the platform or format wins over the setting ("a Pinterest pin of my candle in a kitchen" is a pin;
"a hero banner of my product in use" is a banner; "a carousel of my product in different scenes" is a carousel);
a specific genre wins over a general one ("close-up of someone applying my serum" is a close-up, not lifestyle).
"Make me something cool for my brand": ask what product or topic, the goal `[sell on a marketplace / awareness /
paid ads / website]`, and for a reference image; then route.

## Aspect ratios

`generate_image` has no aspect setting: state it in the prompt ("vertical 3:4 image"). Flow images come only in 1:1,
16:9, 9:16, 4:3 and 3:4; asked for another (4:5, 2:3, 21:9) the agent stops and asks and nothing is made (tested
November 2026). Use the nearest and tell the user to crop: 4:5 → 3:4, 2:3 → 9:16 or 3:4, 21:9 → 16:9. Videos: 16:9
or 9:16.

## Product images (free)

| Mode | Aspect |
|---|---|
| Studio | 1:1 |
| Lifestyle | 3:4 or 1:1 |
| Close-up with hands | 3:4 |
| Pin | 9:16 (crop to 2:3) |
| Hero banner | 16:9, product on a third |
| Carousel | 1:1 or 3:4, same for every slide |
| Ad pack | 1:1, 3:4 and 9:16 |
| On a model | 3:4 |
| Conceptual | 1:1 or 3:4 |
| Restyle | same as the source |

Ask, by situation:
- **Product photo, "make me photos":** how many `[1 / 3 / 5]`; style `[clean studio / lifestyle / conceptual / with a
  model]`; where used `[Shopify / Instagram / Pinterest / ads / website]`; brand colors (skip if visible).
- **Product photo and a named use** (ads, pin, banner): only the gaps: how many, the offer or mood, what to emphasize.
- **No photo:** ask for one first (much better fidelity). If none, the category, packaging, colors and label words.
- **Existing image, "change the vibe":** restyle; aesthetic `[clean girl / cottagecore / quiet luxury / dark academia
  / Y2K]`; season `[Christmas / Valentine's / Halloween / Diwali / Black Friday / none]`; what must stay.
- **Worn by a model:** model look (suggest 2-3 for the audience); setting `[studio / outdoor / street / editorial /
  cozy home]`; framing `[full body / three-quarter / waist up / close on the product]`.

Make it (prompt contracts in `formats.md`):
- Product photos are uploads: rights confirmation first. Attach the photo to every job: "keep the product's shape,
  label, colors and proportions exactly".
- Variants differ in angle, light, setting and palette, not wording. `generate_images`, one job per variant.
- Carousels and ad packs: one style bible pasted into every job so the set reads as one.
- Labels come out best from the product photo. Without one, quote the label's words; "a plain label" comes out
  blank, and saying nothing lets Flow invent text.
- Rich mood, few objects: a long checklist gave a stiff stock-photo look in testing; mood and lens gave a warmer
  shot, and the user preferred the short prompt in blind rating. See "Fix the must-haves, leave the scene loose" in
  `prompting.md`.

## Marketplace set (free)

Ask one question: which set `[main image / main + 5 secondary / main + A+ modules / full set]`. Then follow the
marketplace contract in `formats.md`. Feature callouts, claims and ratings are left as clean space for the user to
fill in an editor from their real data.

## Thumbnail or cover (free)

A thumbnail opens a question the video answers and reads in under a second at about 120 px wide.

Ask: the video's topic and what it truthfully delivers; who appears (0-3 people: the user, another person with a
photo, or a generated one; never choose silently); an optional style reference thumbnail (described in words, not
uploaded); an optional logo; a 2-4 word headline or none; ratio `[16:9 YouTube / 9:16 Shorts / 3:4 Instagram]`;
one image or a set of about 4.

Brainstorm at least five concepts, keep the strongest, then use the thumbnail contract in `formats.md`. No text in
the image by default. Show every passing variant, let the user pick, then make narrow edits.

## Poster or flyer (free)

Ask: the exact words (title, at most two short lines), the event or offer, the look, the size `[3:4 print / 9:16
story / 16:9 screen]`. Use the poster contract in `formats.md`: short quoted text in the image, everything long
added in an editor.

## Video ad (credits)

Ask: platform and length `[9:16 15 s Reel / 16:9 30 s / 1:1 feed]`; style (below); presenter `[none / generated /
the user, with their photo]`; the lines; budget.

| Style | Looks like | Flow plan |
|---|---|---|
| UGC (default) | A real person filmed on a phone | Generated or user's Flow character, "UGC phone look" (`styles.md`), talking to camera, product in hand |
| How-to | "Here's how to use this" | 3 steps, one per shot, hands and product close-ups |
| Unboxing | "Just got this in the mail" | Box on a table → hands opening → product reveal → reaction |
| Review | A presenter giving an honest opinion | Character speaking to camera, product beside them; true claims only |
| Showcase | The product itself, polished, little presenter | Studio keyframes animated: orbit, slow push, detail macro |
| TV spot | Broadcast commercial | Story arc, cinematic style, a closing product hero shot |
| Try-on | Clothing or accessories on a person | Try-on keyframes (`formats.md`), a turn or walk; UGC or polished |
| Wild card | "Surprise me" | Pick an unexpected style from `styles.md` and say which |

Plan 2-4 shots of 8 s: hook (the problem or the product in motion; the first 2 s matter most), show (in use, the
detail that sells it), payoff (result, product hero shot, the line to remember). Keyframes with the product photo
attached, then animate with `start_frame` so the product stays right. Prices, offers and calls to action go in the
user's editor. For several ad styles at once, make one keyframe set per style first (free) and let the user choose
which to animate.

## Story, short film or music video (credits)

Ask: look, characters (and their photos), sound (dialogue, music, silent), length, budget. Plan with the script
table in `narration.md` (arc roles, through-line, alternating shot sizes). Music videos: `narration.md` → songs.

## Narrated piece: explainer, documentary, channel, kids, picture story

Read `narration.md`. Tell the user up front what Flow can't do (one long voice-over, joining, captions) and offer
options A (spoken in each clip), B (silent clips for their voice-over) or C (free picture story). Pick a style from
`styles.md` → explainer looks. Explainers are calm and diagram-led; channel stories vary shots and cut faster.

## Domain recipes

- **Real estate:** from listing photos (rights first): restyle to golden hour or virtual staging as free image
  edits; video walk-throughs with `start_frame` = the room photo and a slow dolly or gimbal glide, no people,
  "keep the room's layout and furniture exactly". One room per shot.
- **Travel:** an arc of arrival → exploring → the best view → leaving; aerial establishing shots, golden-hour
  style, ambient sound of the place, 9:16 for reels.
- **Food and restaurants:** menu photos as studio or top-down 1:1 with steam and garnish; clips: a slow push on the
  dish, a pour or cheese pull in slow motion, sizzling SFX. Keep each dish's photo attached.
- **Fashion:** lookbook as try-on images, one look per job, same model sheet; clips: a walk toward camera or a turn,
  fabric movement, runway or street style.
- **App or SaaS promo:** Flow can't render the real UI reliably: put the user's real screenshot on a device in a
  free image edit ("place this screenshot on the phone screen exactly"), then animate with a slow orbit; the hook is
  the problem shown in a real-life scene.
- **Event promo:** a poster (above), then a 9:16 teaser: the venue at its best moment, crowd energy, the date added
  in an editor.
- **Education:** narrated piece (above) with the flat vector or whiteboard style; one concept per block; check facts.
- **Kids' stories:** narrated piece, option A with talking characters or C as a picture story; children's looks.

## Before and after

Make the "before" image, then edit it into the "after" with the first attached: "same person, same pose, same
framing, only [change]". For video, use the two as `start_frame` and `end_frame` with a transition prompt. Keep the
change truthful for real products and results.
