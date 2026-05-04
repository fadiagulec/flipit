# FlipIt Instagram Launch Campaign — Summary

Single-source-of-truth for everything built so far.

## Status at a glance

| Asset | Status | Location |
|---|---|---|
| 7 Reel scripts (Days 2–8) for Gaia | ✅ Done — paste-ready | `Claude video editing - nate/projects/flipit_week2/` |
| Reel captions + hashtags + pinned comments | ✅ Done | per-day `.md` files in `flipit_week2/` |
| SRT scaffolds (one per day) | ⚠️ Done but timing ~30% fast | `flipit_week2/dayN.srt` |
| Gaia avatar videos | ⏳ Blocked — waiting on HeyGen approval of new uploads | will land in `Claude video editing - nate/raw/` once user generates |
| 4 Instagram carousels, 25 slides @1080×1080 | ✅ Done (priced $37 version) | `flipit/marketing/instagram_carousels/` |
| Free-trial carousel version | 🔜 Pending — user requested pivot | TBD |
| Carousel captions + posting order | ✅ Done | `flipit/marketing/instagram_carousels/POSTING_GUIDE.md` |

---

## 1. Reel campaign (Days 2–8)

7 daily 35–45s Gaia talking-head Reels matching the original `Flipit_launch_no47_captioned.mp4` style.

### Voice & avatar (locked-in)

- **Voice:** `Fadia Podcast - Voice 3` → `gLGTqUJHhyMv7LzN4vnZ`
- **Avatar:** TBD — user is uploading 14 new Gaia photo avatars to the new HeyGen account; pending approval. Once approved, identify them via `python list_heygen.py` from `flipit_week2/`.
- **Captions:** OFF in HeyGen — captions burned in by the `video-use` pipeline post-render to match `master.srt` style.

### Per-day files

| Day | File | Trigger word | Hook angle |
|---|---|---|---|
| 2 | `day2_cheat.md` | CHEAT | Lazy creator's cheat code |
| 3 | `day3_stack.md` | STACK | Canceled $90/mo of tools |
| 4 | `day4_start.md` | START | If I was starting today |
| 5 | `day5_flip.md` | FLIP | Almost got banned (strongest hook) |
| 6 | `day6_demo.md` | DEMO | Watch in real time (needs screen overlay) |
| 7 | `day7_angle.md` | ANGLE | Stop being original (contrarian) |
| 8 | `day8_routine.md` | ROUTINE | 4-min morning routine |

Plus `scripts_only.txt` — all 7 scripts in one paste-ready file.

### Workflow per Reel

1. Open `dayN_*.md`, copy the **SCRIPT** section
2. Paste into HeyGen with Gaia avatar + Fadia Podcast Voice 3, captions OFF
3. Download MP4, drop into `Claude video editing - nate/raw/` named `flipit_week2_dayN.mp4`
4. Tell me when 7 are in `raw/` — I batch through `video-use` to caption all 7
5. Final captioned MP4s land in `output/`
6. Upload to IG using the **CAPTION**, **PINNED COMMENT**, and **STORY REPOST** sections from the same file

### Tooling already wired (in `flipit_week2/`)

- `generate_videos_heygen.py` — batch HeyGen renderer (set up for talking-photo OR avatar type)
- `list_heygen.py` — lists all avatars + voices for the active HeyGen key
- `generate_srts.py` — chunks each script into word-burst SRT (timing needs retune before use)
- `.env` (in `Claude video editing - nate/.env`) — has HeyGen key + voice ID

---

## 2. Instagram carousels (4 total, 25 slides)

All 1080×1080, brand palette: teal `#0d6e66` / magenta `#c2185b` / coral `#e8734a` on cream `#faf8f5`, with dark `#1a1a2e` for CTAs.

### Built so far (priced $37 version)

| # | Folder | Slides | Topic |
|---|---|---|---|
| 1 | `carousel1_reels_flop/` | 5 | "Your reels aren't bad. Your hook is." |
| 2 | `carousel2_before_after/` | 5 | Real before/after flip example |
| 3 | `carousel3_seven_hooks/` | 9 | "7 hooks you can steal today" (highest save-bait) |
| 4 | `carousel4_four_in_one/` | 6 | "FlipIt is 4 tools in one" + $37 CTA |

### Pending — free-trial version

User requested a parallel set using "7 days free" messaging instead of "$37 once". Current $37 versions stay in place for later use; new version regenerates same carousels with free-trial CTAs. Awaiting clarification on exact free-trial copy before re-rendering.

### Tooling

- `render_carousels.py` — Playwright-based renderer. Edit the `CAROUSELS` list at the bottom + re-run for any tweak. ~20s full rebuild.
- `POSTING_GUIDE.md` — captions, pinned comments, hashtags, posting order for all 4 carousels.

### Recommended posting order

| Week | Day | Carousel |
|------|-----|----------|
| 1 | Mon | carousel1 (educational hook) |
| 1 | Wed | carousel3 (save-bait, max reach) |
| 1 | Fri | carousel4 (product explainer) |
| 2 | Tue | carousel2 (proof → conversion) |

---

## 3. Open items

| Item | Owner | Blocking |
|---|---|---|
| HeyGen approves the 14 new Gaia photo avatars | HeyGen | Reel renders |
| Generate 7 Gaia Reels in HeyGen UI | User | Reel captioning |
| Confirm exact "7 days free" copy + landing flow | User | Free-version carousels |
| Retune SRT timing from 0.20s → 0.27s/word | Claude (next session) | Caption pipeline accuracy |
| Decide if user wants single-image posts (quotes, founder note, pricing card) for feed grid variety | User | Optional next deliverable |

---

## 4. Folder map

```
C:/Users/serka/flipit/
├── marketing/
│   ├── CAMPAIGN_SUMMARY.md                ← this file
│   └── instagram_carousels/
│       ├── carousel1_reels_flop/          5 slides, slide_01..05.png + caption.md
│       ├── carousel2_before_after/        5 slides + caption.md
│       ├── carousel3_seven_hooks/         9 slides + caption.md
│       ├── carousel4_four_in_one/         6 slides + caption.md
│       ├── POSTING_GUIDE.md               full caption/comment/hashtag pack
│       └── render_carousels.py            regenerator
└── flippost-site/
    └── flipit-landing-page.html           landing page (source for brand colors)

C:/Users/serka/Claude video editing - nate/
├── .env                                    HEYGEN_API_KEY, GAIA_VOICE_ID, ELEVENLABS_API_KEY
├── projects/
│   ├── flipit_launch/                     completed Day 1 video pipeline (reference)
│   └── flipit_week2/
│       ├── README.md                       posting workflow + DM template
│       ├── day2_cheat.md ... day8_routine.md   per-day script + caption + comment
│       ├── scripts_only.txt                7 scripts in one file (paste-ready)
│       ├── dayN.srt                        scaffold SRTs (timing needs retune)
│       ├── generate_videos_heygen.py       batch renderer
│       ├── list_heygen.py                  avatar/voice lister
│       └── generate_srts.py                SRT scaffolder
├── raw/                                    drop rendered Gaia MP4s here for video-use
└── output/                                 final captioned MP4s land here
```

---

## 5. Reference: original gold-standard video

`Claude video editing - nate/output/Flipit_launch_no47_captioned.mp4`
= `projects/flipit_launch/edit/final_captioned.mp4`

This is the visual + audio target for all 7 new Reels: word-burst all-caps captions, ~40s talking-head Gaia, Fadia Podcast Voice 3, and the same `master.srt` style. The pipeline that produces it is documented in `Claude video editing - nate/CLAUDE.md`.
