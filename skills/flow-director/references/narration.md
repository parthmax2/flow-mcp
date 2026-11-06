# Scripts for narrated, story and music pieces

For explainers, documentaries, story channels, picture stories, kids' videos and music videos. Write the script
before any keyframe; the visuals follow the words.

What Flow can and can't do here: it makes clips with their own sound (dialogue, narration spoken in-clip, SFX,
ambience, music) in 8 s pieces (10 s with characters). It doesn't make one long voice-over track or burn captions.
`flow_assemble` joins the finished clips locally and can lay a voice-over or music file the user supplies over them.
Say this up front and offer the fitting option:

| Option | How | Best for |
|---|---|---|
| **A. Spoken in each clip** | Each shot speaks its own narration line or dialogue (a Flow character's voice, or a narrator described identically every time) | Short pieces, talking characters |
| **B. Silent clips for a separate voice-over** | Every shot "No dialogue. No music.", timed to the script; the user records or makes the voice-over; `flow_assemble` joins the clips and lays it on (`audio`, `clip_audio_volume: 0`) | Longer explainers, a consistent narrator |
| **C. Picture story** | Free stills, one per beat, for the user to pan and zoom over a voice-over in an editor | Cheapest; stories, history, kids |

## The script table

Make it first and show it with the plan:

| Block | Arc role | Line (spoken words) | Visual: shot size + what we see | Through-line | Assets |
|---|---|---|---|---|---|
| 1 | hook | "In 1912, the unsinkable ship left port." | WIDE: the liner leaving a misty harbor | the ship's bell, polished | ship, captain |

- **Arc:** a hook block, one or more build blocks, a turn, a payoff. A hook raises a question in its first seconds.
- **Through-line:** one prop, place or character that appears in every block and changes with the story (the bell
  polished → cracked → under water), with a resolution in the payoff.
- **Shots:** start every visual with its size (WIDE, MEDIUM, CU, DETAIL) and alternate sizes block to block. For a
  fast-cut channel style, an 8 s block can hold 2-4 shots with timestamps (`prompting.md`); for a calm explainer,
  one deliberate shot per block.
- **Each visual shows what its line says.** Don't let a block drift into generic B-roll. No over-the-shoulder shot
  unless a shoulder is really in frame.
- **Assets:** name the characters, places and props each block uses; attach their sheets to that block's keyframe.
- **Facts:** for history and science, research, keep the facts in the lines checkable, and keep a short source list
  for delivery.

## Line length

Natural pace is about 2.5 words a second. Per block:

| Clip | Narration words | Kids' narration | Notes |
|---|---|---|---|
| 8 s | 15-18 | 13-16 | finish about 1 s before the end |
| 10 s (characters) | 20-23 | 17-21 | |
| Picture story beat | any; time each beat to its sentence | | |

- One flowing sentence or two per block; never split a sentence across blocks.
- No padding or repeated phrases to fill time. A shorter last block is fine.
- In option A, write the delivery once per narrator and repeat it word for word: "A warm, clear female narrator
  says, starting right away: '...'". Keep narration out of shots with on-screen dialogue.
- If a take comes back rushed or cut off, rewrite it shorter (with the user's OK for the credits). Never ask for
  faster speech; never plan to speed audio up.

## Talking characters (kids' and story videos)

Alternate: narration blocks show no speaker; dialogue blocks have one or two named Flow characters, one short turn
each, that follow from the last scene and lead into the next. Use `characters: [...]` so each speaks in their voice.
Check the words and the lip movement in review; if Flow can't get usable dialogue, say so rather than swapping in a
silent clip.

## Kids' content

Simple words for the age, one idea per block, characters with big recognizable features and visible reactions, the
action named by the narration clearly on screen. Upbeat music only if wanted. Never frightening; review every frame.

## Songs and music videos

- **The user's own song:** plan blocks to its sections (intro, verse, chorus, bridge), one visual idea per line,
  a repeated chorus visual. Generate "No music. No dialogue." and lay the song on with `flow_assemble` (`audio`:
  the song, `clip_audio_volume: 0`); cut-to-the-beat timing still needs an editor. Avoid lip-sync unless
  the user accepts it won't match.
- **A short sung clip from Flow:** Veo can sing a few lines in a clip. Keep the lyric to what fits 8 s (two short
  lines), state the style ("a cheerful children's song, female voice, ukulele, 100 BPM"), quote the lyrics exactly,
  and tell the user a full-length song isn't something Flow makes in one piece.
- **Writing lyrics:** steady meter (about eight syllables a line, one syllable per beat), four-line verses, a chorus
  that repeats word for word.

## Picture stories (option C)

Free images, so be generous with beats: one distinct image per sentence or phrase, never the same picture twice to
fill time. For a variation of the previous frame (same scene, the character turns), attach the previous image and
describe only the change. Keep the style bible and character sheets on every frame. Deliver the frames numbered in
order with the line each belongs to, so the user can time them in an editor.

## Replacing part of a finished piece

When the user wants to change one block of a piece already made: regenerate only that block (its keyframe, then its
clip, with the user's OK for the credits), start it from the previous block's last frame and make sure it ends near
the next block's first frame (use that as `end_frame`). Keep everything else; deliver the new clip with its block
number so it drops into the edit.
