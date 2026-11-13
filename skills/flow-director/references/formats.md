# Prompt contracts by format

A contract is a fixed order of blocks for one kind of image. Fill every block in order; leave one out only on
purpose. Fixed formats reward fixed structure: in testing (November 2026) the full thumbnail contract beat a short
"vivid, punchy" prompt on the same model. For one-off creative images, the free-form formula in
`prompting.md` is still the better fit.

Rules for every contract:
- State the aspect in words ("16:9 image"). Flow images: 1:1, 16:9, 9:16, 4:3, 3:4 only.
- With more than one attached image, open with the reference manifest: "Image 1 is [role]. Image 2 is [role]."
- Text policy is explicit every time: either "No text, no logos, no watermark" (props stay "plain, unbranded") or the
  exact words in quotes.
- One image per job. Variants are separate jobs that change one named thing (concept, angle, light, emotion).

## YouTube thumbnail / video cover

1. **Frame:** "Bold YouTube thumbnail, poster-grade, photoreal and high-impact, not a muted cinematic still, [16:9],
   one continuous frame, no split screen." For 9:16 add "faces in the upper two-thirds". For a chart or diagram
   concept, replace photoreal with "clean, simple graphic".
2. **Scene:** what happens, true to the video.
3. **Text:** "No text, no readable labels, no watermark; packaging plain and unbranded." Or, only when asked:
   `Headline text reading exactly "<2-4 WORDS>", huge bold sans-serif with a clean outline, never covering a face.`
4. **Subjects:** large, chest-up or medium close-up, 40-60 % of the frame; "all faces crisply sharp".
5. **Key elements:** only the props that create the question.
6. **Logo** (if attached): "keep the logo's exact shapes, colors and letters, away from faces".
7. **Location:** place, time, weather.
8. **Composition:** one hero on a third, clear scale order, depth, strong subject/background separation.
9. **Background:** vivid high-contrast color field or blurred environment, soft vignette.
10. **Light on people:** "strong key light shaping the face, soft fill, bright rim and hair light around the
    silhouette". Only the rim may be colored.
11. **Grade:** "bright, glossy, saturated, deep blacks, crisp highlights, one cohesive image". Tone it down only for
    a calm or premium brief.

Per photographed person add the identity lock: "Person 1 is the person in image [K]: same face shape, eyes, nose,
mouth, jawline, skin tone, hairline and hair. Don't beautify or restyle. Expression: [x]."

**Concepts** (brainstorm at least five, across several, keep the strongest; combine two only if it still reads at
120 px): posed portrait (default) · action caught mid-moment · before/after (split only if asked) · three steps
start→end · size contrast giant vs tiny · a pile of one object · product as the answer · map or aerial with a
marked route · landscape with one small figure · simple chart · generic chat/DM/review card (no real platform) ·
generic "breaking news" bar (no real network) · "Day N" badge from late in the story · one real element amplified ·
a real frame from the user's video (not a generation).

**One strong emotion and a clear action.** Mixed feelings ("craving with a guilty smile") read as mild at small size;
in testing a single big emotion with a reaching hand beat it. Keep the key object fully visible and facing camera
(a phone lying flat disappears).

**Emotion ladder** when the user wants several faces without naming them: shock, hype, rage, awe, laugh, fear, smug,
charisma, confusion, determination, disgust.

**Edits after picking:** one scope per edit, the picked image attached: expression only · background replaced ·
background recolored · rim light recolored. "Change only [x]. Keep identity, pose, clothing, logo, background,
light and composition exactly the same." Each accepted edit is the source for the next one.

**Hard limits:** at most about 16 images per thumbnail job; never invent claims, numbers or people.

## Product lock (real products)

Flow redraws real products: round holes for pill buttons, new or warped icons, panels resized or moved (field
report, November 2026: 2-3 retries per shot, some never exact). Every prompt with a real product gets:
"Keep the product exactly as in image 1: same shape, proportions, button layout, icons and finish. Add nothing,
remove nothing, change no detail." Then:
- Attach the clearest product photo for every shot; for a product seen from several sides, use a separate shot
  per side with the matching photo.
- In video, let Veo move only the light and the camera around the product, not the product itself; motion is
  where icons drift.
- Check every frame against the photo. When exact icons or text matter for a client, composite the real product
  photo in the edit rather than re-rolling.

## Product: studio / catalog

"[1:1] studio product photo. Image 1 is the product: keep its shape, label, colors and proportions exactly.
[Product] centered, filling about 80 % of the frame, on a seamless [pure white / light grey / brand color]
background, soft studio light. Real product photograph: true material texture, subtle reflections and soft
shading, not a 3D render. No props, no text beyond the product's own label."
Keep it about this short. In blind rating, a longer lighting-by-lighting version looked flat and plastic next to a
short one.

## UGC frame (ad first frame)

"[9:16] candid phone video frame, real person, natural skin texture, everyday lived-in room with real clutter,
window light, not staged. [Who] [the one action, e.g. lifting the lid off a plain box with headphones inside],
[emotion], looking at camera. Plain unbranded packaging, no text." Short is the point: the room should look like
someone's home, not a set.

## Product: lifestyle

"[3:4] lifestyle photo for [platform]. Image 1 is the product: keep it exactly. [Product] in use / at rest in
[place], [time of day light], [2-3 props that fit the buyer's life]. [Lens, angle]. [Mood words: warm, calm,
energetic]. Product is the clear hero on [a third]. [Palette]." Keep the props few and the mood rich.

## Product: close-up with hands or face

"[3:4] tight close-up of hands [holding / applying / pouring] [product], [skin tone, nails, sleeves if relevant],
the product's label facing camera and sharp. Shallow depth of field, soft directional light. [Setting hinted in
the blur]. No face" (or "partial face, lower half only").

## Product: pin

"[9:16] Pinterest-style vertical moodboard image: [product] in [aesthetic: clean girl / cottagecore / quiet luxury /
dark academia / Y2K] styling, layered textures, [palette], soft natural light, airy space at top for a title."

## Product: hero banner

"[16:9] wide website hero image. [Product] on the right third, the left half calm and uncluttered for headline
copy. [Setting / gradient], [light], premium and spacious."

## Product: on a model (try-on)

"[3:4] fashion photo. Image 1 is the garment / accessory: keep its cut, color, pattern and details exactly. A
[age, look] model wearing it, [full body / three-quarter / waist up], [pose], in [studio clean / street / outdoor
natural / editorial / cozy home]. [Light]. The product is the sharpest thing in the frame."

## Product: conceptual

"[1:1] conceptual product image: [product] [levitating / mid-splash / frozen in an explosion of ingredients / on a
sculptural plinth], [surreal element], [color background], high-speed photography look, crisp droplets, dramatic
rim light."

## Product: restyle / seasonal

Attach the existing image: "Same product, same framing. Change the styling to [aesthetic] for [season / holiday:
Christmas, Valentine's, Halloween, Black Friday]: [2-3 props and palette]. Keep the product exactly the same."

## Marketplace listing set (Amazon / Flipkart / Shopify style)

Ask one question at most (which set), then make the set with `generate_images`, the product photo on every job.

| Set | Images |
|---|---|
| Main | 1 main image |
| Product images | Main + 5 secondary |
| A+ content | Main + 7 modules |
| Full | Main + 5 secondary + 7 modules |

- Without a product photo, say "a generic design, not resembling any known brand": a plain "white earbuds case"
  came out looking like a famous brand's product in testing.
- **Main image:** 1:1, pure white background, product alone filling about 85 % of the frame, no props, no text, no
  badges, no watermark, true colors.
- **Secondary:** infographic (product + empty callout space for 3-4 features, added in an editor) · multi-angle
  (front, side, back) · detail (macro of material or mechanism) · lifestyle (in use) · what's in the box (all items
  flat-lay on white).
- **A+ modules** (16:9 or 4:3, one visual system across all): hero banner · pain points (the problem shown) ·
  features (product with callout space) · ingredients / materials · results (before and after, truthful) · how to
  use (three steps) · social proof (a generic review-card space, no invented quotes).
- Feature text, claims and ratings are added by the user in an editor from their real data; never invent them.

## Poster, flyer or banner with text

Nano Banana renders short English text reasonably. Keep each text item under about 5 words, quote it exactly, give
its place ("title at the top in bold condensed sans-serif"), and say "no other text". Long copy, prices and dates
go in an editor afterwards. Check every letter in review.

## Character sheet

See `consistency.md`. Plain light-grey background, even light, full body, neutral pose, fixed traits word for word.

## Keyframe for a video shot

Describe the exact first moment: shot size and angle, pose, where everyone stands, light, style bible. No motion
words (motion goes in the video prompt). Attach character sheets and the product photo.
