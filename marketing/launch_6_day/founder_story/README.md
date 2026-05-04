# Founder Story — "Six Months"

The personal AI-builder identity piece. Pairs with the beach portrait OR with the HeyGen avatar talking head OR with the Sora/Veo "Teaching Claude" b-roll cuts.

## Files in this folder

| File | What it is | Where it goes |
|------|-----------|---------------|
| `IG_CAPTION_long.md` | The full founder story caption (200+ words) | Instagram post body — pair with beach portrait OR finished video |
| `IG_CAPTION_short.md` | Tighter version for image-as-hero | Alt option if the long version feels too much |
| `PINNED_COMMENT.md` | First-comment text to pin under the post | Post under your own post immediately after going live |
| `STORY_REPOST.md` | Story sticker text | Repost feed post to story within 1 hour |
| `HEYGEN_SCRIPT_70s.txt` | Paste-ready 70-second talking head | HeyGen → Fadia Podcast Voice 3 (`gLGTqUJHhyMv7LzN4vnZ`) |
| `HEYGEN_SCRIPT_30s.txt` | Paste-ready 30-second short version | HeyGen — confidence builder for first take |
| `AI_VIDEO_PROMPTS.md` | 4 Sora/Veo/Kling prompts (Hero + Stacks + Sticky Wall + Holding Tool) | OpenArt / Sora / Veo / Kling for B-roll |
| `EDIT_PLAN.md` | Which shot plays under which line of the script | CapCut assembly guide |

## HeyGen settings

- **Voice:** Fadia Podcast — Voice 3 (`gLGTqUJHhyMv7LzN4vnZ`)
- **Speed:** 0.95×
- **Pause between paragraphs:** 0.6s
- **Captions:** OFF (burn them in later via `video-use` pipeline)
- **Aspect:** 9:16 vertical
- **Background music:** OFF

## After HeyGen renders

1. Save the MP4 as `flipit_founder_story.mp4`
2. Drop it in `C:\Users\serka\Claude video editing - nate\raw\`
3. Tell Claude: "founder story is in raw" — captions get burned in via `video-use` to match master.srt style
4. Final captioned MP4 lands in `output/`
