# flow-mcp vs Higgsfield skills: coverage and roadmap

What [Higgsfield's skills](https://github.com/higgsfield-ai/skills) (MIT, v0.14.0) can make, what flow-mcp can
make, and what is worth adding to flow-mcp. Written November 2026 after reading both skill sets and rendering
side-by-side test images through Flow.

**Cost labels used below:**
- **Free:** local code or skill text. No Flow credits, no outside service.
- **Flow credits:** uses the user's existing Flow credits (videos). Images in Flow are free.
- **Paid add-on:** needs an outside paid service (opt-in, the user's own key).

---

## 1. At a glance

| | Higgsfield skills | flow-mcp |
|---|---|---|
| Skills | 9 | 1 (flow-director) + 18 MCP tools |
| Backend | Higgsfield's paid service and CLI, 30+ models | Google Flow in the user's own Chrome |
| Image models | GPT Image 2.6, Nano Banana 2/Pro, Seedream 5, Flux 2, Recraft, Soul, Z Image | Nano Banana (Flow's) |
| Video models | Seedance 2.5/2.0, Kling 3.0, Veo 3.1, Grok Video, Gemini Omni, Cinema Studio | Veo 3.1 Lite/Fast/Quality, Gemini Omni |
| Image cost | Credits | **Free** |
| Video cost | Credits | Flow credits (free account: 50 a day; 8 s Lite = 10) |
| Max clip | 4-30 s, up to 1080p (4K on Seedance 2.0) | 8 s (10 s with characters), 720p through this server |
| Finished video (assembled, voiced, captioned) | Yes | No: clips only |
| Credit protection | Weak (doesn't estimate cost unless asked) | Strong (budget cap, never auto-retries) |
| Free previews before spending | No | Yes: every keyframe is a free image |

**Summary:** Higgsfield covers far more (audio, assembly, captions, brand, ads, web, 3D). flow-mcp is cheaper (free
images, Flow's subscription for video) and safer with credits. Most of the gap is in local post-production that
flow-mcp can add for free.

---

## 2. What each can make, by type

✅ = does it well. ⚠️ = partly or by hand. ❌ = not at all.

### Images

| Type | Higgsfield | flow-mcp |
|---|---|---|
| Text to image, any subject | ✅ | ✅ free |
| Image edit (change one thing) | ✅ | ✅ free |
| Restyle an image | ✅ | ✅ free |
| Character sheet / consistent person | ✅ trained face model (Soul ID) | ✅ sheet + Flow character, free |
| Product studio / lifestyle / pin / banner / carousel / ad pack / try-on / conceptual | ✅ 10 modes, server-written prompts | ✅ 10 recipes in the skill, free |
| YouTube thumbnail / Shorts cover | ✅ dedicated skill, 4K, text overlay | ⚠️ recipe; no text overlay; 2K max |
| Text-heavy design (posters, UI, typography) | ✅ GPT Image 2.6 | ⚠️ Nano Banana; short English text only |
| Logos and vector (SVG) | ✅ Recraft | ❌ |
| Animated GIF | ✅ | ❌ (can be made locally from a clip) |
| Marketplace cards (Amazon main image, A+ modules) | ✅ | ⚠️ studio-shot recipe only |
| Brand kit (palette, logo, type, mockups, brandbook PDF/PPTX) | ✅ | ❌ |
| 4K images | ✅ | ⚠️ free 2K upscale; 4K on the Flow website |
| Aspect ratios | many | 1:1, 16:9, 9:16, 4:3, 3:4 |

### Video

| Type | Higgsfield | flow-mcp |
|---|---|---|
| Text to video with sound | ✅ | ✅ Flow credits |
| Image to video, start + end frame | ✅ | ✅ |
| Same character across shots, with voice | ✅ Soul ID | ✅ Flow characters with 30 voices |
| Multi-shot story / short film | ✅ | ✅ plan + chained 8 s shots; no joining |
| Restyle a video (anime, clay, film) | ✅ | ✅ Omni edit, ~20 credits |
| Swap a character into footage | ✅ | ✅ Omni edit or swapped first frame |
| Extend a clip | ✅ | ⚠️ last-frame chaining; true Extend is website-only |
| Re-frame 16:9 ↔ 9:16 | ✅ workflow | ❌ (could be done locally by crop) |
| Draw-on-video edit | ✅ | ❌ |
| UGC ad with avatar + product from a URL | ✅ Marketing Studio | ⚠️ by hand: product photo + character |
| Talking presenter overlay | ✅ | ❌ |
| Faceless narrated explainer, full | ✅ | ⚠️ visuals only |
| Picture story (stills + narration) | ✅ | ⚠️ stills only |
| Kids' song video | ✅ | ❌ |
| 1080p / 4K export | ✅ | ❌ (Flow website) |

### Audio and post-production

| Type | Higgsfield | flow-mcp |
|---|---|---|
| Sound inside the clip (dialogue, SFX, ambience) | ✅ | ✅ Veo / Omni |
| Separate voice-over (TTS) | ✅ Seed Audio, ElevenLabs | ❌ |
| Music track | ✅ | ❌ |
| Sound effects alone | ✅ | ❌ |
| Join clips into one video | ✅ ffmpeg scripts with timing checks | ❌ |
| Captions burned in | ✅ local Whisper | ❌ |
| Mix music under voice | ✅ | ❌ |

### Other

| Type | Higgsfield | flow-mcp |
|---|---|---|
| 3D model (GLB) from photos | ✅ | ❌ |
| Websites and browser games | ✅ | ❌ (out of scope) |
| Predict a video's performance | ✅ Virality Predictor | ❌ |

### Rough coverage count

Counting the rows above: Higgsfield does about **38 of 41** well. flow-mcp does about **17** well and **12**
partly. With the free additions in section 3, flow-mcp would do about **27** well.

---

## 3. What to add to flow-mcp

Ranked by value for the effort. All respect the repo rules: Flow is driven only through its page, credits are never
spent without the user, and nothing calls Google endpoints directly.

### Tier 1: free, biggest gain

| # | Addition | What it gives | How | Effort |
|---|---|---|---|---|
| 1 | **`flow_assemble` tool** | One finished video from shots in order, with optional music or voice-over file, fades and loudness level | Local ffmpeg (bundled via `ffmpeg-static`), runs on downloaded mp4s | Medium |
| 2 | **Captions** | Burned-in or `.srt` subtitles from the clips' own dialogue | Local Whisper (`whisper.cpp` / `faster-whisper`), opt-in download of the model | Medium |
| 3 | **Re-frame / crop** | 16:9 → 9:16 or 1:1 versions of a clip or image, subject kept in frame | ffmpeg crop; subject position from a frame the assistant looks at | Small |
| 4 | **Text overlay on images** | Thumbnail headlines, banner copy, prices on ad images in exact fonts | Render with `sharp` + SVG text, presets like Higgsfield's five | Small |
| 5 | **GIF / loop export** | GIF or seamless loop from a clip for web and chat | ffmpeg palette GIF | Small |
| 6 | **Contact sheet** | One image with frames from every shot, for review and for the user to approve | ffmpeg tile from `flow_frame` stills | Small |
| 7 | **Project ledger file** | Shot list, media ids, credits and status saved per project, resumes after a crash | JSON in `FLOW_HOME`, read by a `flow_plan` tool | Small |

### Tier 2: free, skill content only (no code)

| # | Addition | What it gives |
|---|---|---|
| 8 | **More recipes**: marketplace main image rules (white background, product fills 85 %), real-estate walkthrough, food menu, fashion lookbook, app promo, event poster, kids' story, educational explainer, travel reel, music visualiser | Covers more domains with tested question sets and shot plans |
| 9 | **Style presets library** (20-30 named style bibles: editorial collage, paper diorama, claymation, anime, 16mm, noir, Pixar-style 3D, watercolor, vaporwave…) | Consistent looks in one word |
| 10 | **Prompt contracts per format** like Higgsfield's thumbnail contract (test showed it beat our shorter prompt) | Better first results for thumbnails, product shots, posters |
| 11 | **Script tools for narration**: word budget per clip, arc roles, a validator that checks line length before paying | Fewer cut-off or rushed lines |
| 12 | **More eval scenarios** run with `npm run e2e` for the free ones | Catch skill regressions |

### Tier 3: uses Flow credits, worth it when the user asks

| # | Addition | What it gives | Cost |
|---|---|---|---|
| 13 | Drive Flow's **Extend** button | True clip extension instead of last-frame chaining | Flow credits |
| 14 | Drive Flow's **1080p / 4K video export** | Higher-resolution finals | Flow credits / plan |
| 15 | Drive **Insert / Remove with a box** and **camera re-framing** | Precise edits | Flow credits |
| 16 | Drive **Scenebuilder** | Assembly inside Flow itself | Free or credits |
| 17 | **`@me` avatars** and custom voices | The user's own face and voice | Set up on the website first |

Each needs a selector in `src/flow/`, a `flow_status` check, and a `capabilities.ts` entry.

### Tier 4: paid add-ons, opt-in with the user's own key

| # | Addition | What it gives | Cost (approx.) |
|---|---|---|---|
| 18 | **Voice-over (TTS)**: ElevenLabs, OpenAI TTS; free option: local Piper / Kokoro | Narration track for explainers and ads | Free locally; ~$5+/month hosted |
| 19 | **Music**: local royalty-free library first; Suno/Udio-type APIs only if licensed | Music beds | Free library; paid API |
| 20 | **Background removal** (local `rembg`) | Clean product cut-outs and character sheets | Free |
| 21 | **Image upscaling to 4K locally** (Real-ESRGAN) | 4K images without the website | Free, needs GPU for speed |

---

## 4. Domains after the additions

| Domain | What can be made | Needs |
|---|---|---|
| E-commerce | Studio, lifestyle, marketplace main images, carousels, ad packs, 8-15 s product videos with music | Free + #1, #4 |
| Social media | Reels / Shorts with captions, 9:16 crops, thumbnails with headlines, GIFs | #1-#5 |
| Advertising | Storyboards (free), 15-30 s spots, UGC-style clips, variants per platform | #1, #3, Flow credits |
| YouTube | Thumbnails, intros, B-roll, faceless explainers with voice-over and captions | #1, #2, #4, #18 |
| Education | Explainer clips, diagrams-as-scenes, captioned lessons | #1, #2, #18 |
| Film / storytelling | Character sheets, storyboards, multi-shot shorts, music videos to a supplied song | #1, #6 |
| Kids' content | Picture stories, illustrated series with a fixed cast | #1, #18 |
| Real estate / travel | Room or place walkthroughs from photos, reels | #1, #3 |
| Food / restaurants | Menu photos, dish reveal clips | Free + #1 |
| Fashion | Lookbooks, try-on images, runway-style clips | Free + #1 |
| Events / posters | Posters and banners with exact text | #4 |
| Branding | Moodboards and mockups (no logo / vector generation) | #4; logos stay out of scope |

Still out of reach without another backend: vector logos, 3D models, websites, performance prediction, long
single clips over 10 s.

---

## 5. Recommended order

1. `flow_assemble` (#1) and re-frame (#3): turns clips into finished videos.
2. Text overlay (#4) and the prompt contracts (#10): best thumbnails and ads for free.
3. Captions (#2) and local voice-over (#18, Piper/Kokoro): full explainers with no paid service.
4. More recipes and styles (#8, #9) and evals (#12).
5. Flow website features (#13-#17), one at a time, each tested on a free action first.
