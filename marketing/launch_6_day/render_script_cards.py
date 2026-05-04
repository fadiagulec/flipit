"""
Render HeyGen script cards as 1080x1350 PNGs — one per day + founder story.

These cards live in Canva alongside the carousel slides + static posts. While
Fadia is in HeyGen on one device, she pulls up the script card on Canva on
another, copies the script, pastes into HeyGen.
"""

from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
W, H = 1080, 1350

DAYS = [
    {
        "folder": "day1_launch",
        "day_num": "01",
        "theme": "LAUNCH",
        "trigger": "FLIPIT",
        "subtitle": "It's finally live",
        "duration": "~38s",
        "accent": "#c2185b",
    },
    {
        "folder": "day2_problem",
        "day_num": "02",
        "theme": "BLANK PAGE",
        "trigger": "BLANK",
        "subtitle": "Stop starting from zero",
        "duration": "~36s",
        "accent": "#e8734a",
    },
    {
        "folder": "day3_proof",
        "day_num": "03",
        "theme": "PROOF",
        "trigger": "PROOF",
        "subtitle": "Real-time demo, no edits",
        "duration": "~42s",
        "accent": "#0d6e66",
    },
    {
        "folder": "day4_stack",
        "day_num": "04",
        "theme": "STACK",
        "trigger": "STACK",
        "subtitle": "Replaces $90/mo of subs",
        "duration": "~35s",
        "accent": "#c2185b",
    },
    {
        "folder": "day5_story",
        "day_num": "05",
        "theme": "STORY",
        "trigger": "STORY",
        "subtitle": "18 months. 1 lesson.",
        "duration": "~44s",
        "accent": "#0d6e66",
    },
    {
        "folder": "day6_close",
        "day_num": "06",
        "theme": "CLOSE",
        "trigger": "LAST",
        "subtitle": "Last call · $37 → $59",
        "duration": "~33s",
        "accent": "#1a1a2e",
    },
    {
        "folder": "founder_story",
        "day_num": "★",
        "theme": "FOUNDER STORY",
        "trigger": "DM",
        "subtitle": "Six Months · the AI-builder identity piece",
        "duration": "~70s",
        "accent": "#c2185b",
        "script_file": "HEYGEN_SCRIPT_70s.txt",
    },
]


CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Space+Grotesk:wght@500;700&family=Crimson+Pro:wght@400;500;600&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
html, body {
  width: 1080px; height: 1350px;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
.card {
  width: 1080px; height: 1350px;
  background: #faf8f5;
  padding: 80px 80px 70px;
  display: flex; flex-direction: column;
  position: relative;
}
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 32px;
}
.brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 26px; color: #0d6e66;
  letter-spacing: -0.5px;
}
.duration {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 18px;
  color: #1a1a2e; opacity: 0.5;
  letter-spacing: 1.5px; text-transform: uppercase;
}
.day-row {
  display: flex; align-items: baseline; gap: 24px;
  margin-bottom: 8px;
}
.day-num {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 110px;
  letter-spacing: -5px;
  line-height: 1;
}
.theme {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 28px;
  letter-spacing: 4px; text-transform: uppercase;
  color: #1a1a2e; opacity: 0.65;
}
.subtitle {
  font-family: 'Crimson Pro', serif;
  font-weight: 400; font-style: italic;
  font-size: 32px; color: #1a1a2e; opacity: 0.7;
  margin-bottom: 20px;
}
.divider {
  width: 80px; height: 4px; border-radius: 2px;
  margin: 8px 0 30px;
}
.script-label {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 16px;
  letter-spacing: 2.5px; text-transform: uppercase;
  color: #1a1a2e; opacity: 0.45;
  margin-bottom: 16px;
}
.script-body {
  font-family: 'Crimson Pro', serif;
  font-weight: 500; font-size: 24px; line-height: 1.5;
  color: #1a1a2e;
  white-space: pre-wrap;
  flex: 1;
  overflow: hidden;
}
.footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 24px;
  padding-top: 22px;
  border-top: 1px solid rgba(26,26,46,0.12);
}
.trigger-block {
  display: flex; align-items: center; gap: 14px;
}
.trigger-label {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 14px;
  color: #1a1a2e; opacity: 0.5;
  letter-spacing: 2px; text-transform: uppercase;
}
.trigger-word {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 22px;
  padding: 8px 18px; border-radius: 8px;
  color: #fff;
  letter-spacing: 1.5px;
}
.heygen-tag {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 14px;
  color: #1a1a2e; opacity: 0.45;
  letter-spacing: 2px; text-transform: uppercase;
}
"""


def render(day, script):
    accent = day["accent"]
    is_founder = day["folder"] == "founder_story"
    body_class = "" if not is_founder else "founder"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="card">
  <div class="header">
    <div class="brand">FlipIt</div>
    <div class="duration">HeyGen · {day['duration']}</div>
  </div>

  <div class="day-row">
    <div class="day-num" style="color:{accent};">{day['day_num']}</div>
    <div class="theme">{day['theme']}</div>
  </div>
  <div class="subtitle">{day['subtitle']}</div>
  <div class="divider" style="background:{accent};"></div>

  <div class="script-label">Paste this into HeyGen</div>
  <div class="script-body">{script}</div>

  <div class="footer">
    <div class="trigger-block">
      <span class="trigger-label">Trigger word</span>
      <span class="trigger-word" style="background:{accent};">{day['trigger']}</span>
    </div>
    <div class="heygen-tag">Voice 3 · captions OFF</div>
  </div>
</div></body></html>"""

    return html


def main():
    out_dir = ROOT / "script_cards"
    out_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
        page = ctx.new_page()

        for day in DAYS:
            script_file = day.get("script_file", "HEYGEN_SCRIPT.txt")
            script_path = ROOT / day["folder"] / script_file
            if not script_path.exists():
                print(f"  SKIP {day['folder']} (no {script_file})")
                continue
            script = script_path.read_text(encoding="utf-8").strip()

            html = render(day, script)
            page.set_content(html, wait_until="networkidle")
            out = out_dir / f"{day['folder']}_script_card.png"
            page.screenshot(path=str(out), full_page=False, omit_background=False,
                            clip={"x": 0, "y": 0, "width": W, "height": H})
            print(f"  {out.name}  ({out.stat().st_size//1024} KB)")

        browser.close()
    print("DONE")


if __name__ == "__main__":
    main()
