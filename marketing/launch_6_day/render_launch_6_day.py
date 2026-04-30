"""
Render the FlipIt 6-day launch push assets.

Outputs per day in `launch_6_day/dayN_<theme>/`:
  carousel_slide_01.png ... slide_NN.png   (1080x1080)
  static_post.png                          (1080x1350)

Brand palette (from landing page):
  cream  #faf8f5
  dark   #1a1a2e
  teal   #0d6e66 / #0a9b8e
  pink   #c2185b
  coral  #e8734a
  border #e8e4de
"""

from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent

SQ = 1080            # carousel
PORT_W, PORT_H = 1080, 1350  # static feed post

# ----------------------- BASE CSS -----------------------------------------

BASE_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Space+Grotesk:wght@500;700&family=Caveat:wght@500;700&family=Special+Elite&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
html, body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
.slide {
  padding: 88px 80px;
  display: flex; flex-direction: column;
  position: relative;
  color: #1a1a2e;
  background: #faf8f5;
}
.slide.dark  { background: #1a1a2e; color: #faf8f5; }
.slide.teal  { background: linear-gradient(135deg, #0d6e66, #0a9b8e); color: #fff; }
.slide.pink  { background: linear-gradient(135deg, #c2185b, #e8734a); color: #fff; }
.slide.coral { background: #e8734a; color: #fff; }

.brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 28px;
  letter-spacing: -0.5px;
  color: inherit;
  opacity: 0.9;
}
.slide.cream .brand { color: #0d6e66; }

.badge {
  display: inline-block;
  background: rgba(13,110,102,0.12);
  color: #0d6e66;
  padding: 10px 22px;
  border-radius: 30px;
  font-size: 18px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 32px;
  align-self: flex-start;
}
.badge.pink   { background: rgba(194,24,91,0.12);  color: #c2185b; }
.badge.coral  { background: rgba(232,115,74,0.12); color: #e8734a; }
.badge.dark   { background: rgba(255,255,255,0.15); color: #fff; }
.badge.invert { background: rgba(255,255,255,0.18); color: #fff; }

h1 {
  font-weight: 900;
  font-size: 110px;
  line-height: 1.02;
  letter-spacing: -3px;
  margin-bottom: 28px;
}
h1.medium { font-size: 92px; }
h1.small  { font-size: 78px; }
h1.gradient {
  background: linear-gradient(135deg, #0d6e66 0%, #c2185b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
h2 {
  font-weight: 800;
  font-size: 64px;
  line-height: 1.1;
  letter-spacing: -1.5px;
  margin-bottom: 24px;
}
h3 {
  font-weight: 800;
  font-size: 48px;
  line-height: 1.15;
  letter-spacing: -1px;
  margin-bottom: 18px;
}
.body {
  font-size: 36px;
  font-weight: 500;
  line-height: 1.4;
  color: inherit;
  opacity: 0.85;
}
.body.lg { font-size: 42px; line-height: 1.35; }
.body strong { font-weight: 800; opacity: 1; }

.kicker {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 22px;
  text-transform: uppercase;
  letter-spacing: 2.5px;
  margin-bottom: 18px;
  opacity: 0.6;
}

.footer {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.swipe {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 2px;
  opacity: 0.55;
}
.pagecount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  font-weight: 700;
  opacity: 0.4;
  letter-spacing: 1.5px;
}
.spacer { flex: 1; }

.divider {
  width: 80px;
  height: 6px;
  background: #c2185b;
  border-radius: 3px;
  margin: 24px 0 36px;
}
.divider.teal  { background: #0d6e66; }
.divider.coral { background: #e8734a; }
.divider.white { background: #fff; }

.card {
  background: #fff;
  border-radius: 32px;
  padding: 56px 52px;
  border: 2px solid #e8e4de;
}
.card.flipped { border: 3px solid #0d6e66; }
.card .label {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px; font-weight: 700; letter-spacing: 2.5px;
  text-transform: uppercase;
  margin-bottom: 18px;
  color: #999;
}
.card.flipped .label { color: #0d6e66; }
.card .text {
  font-size: 32px; line-height: 1.45; color: #444; font-weight: 500;
}

.numbered {
  background: #fff;
  border-radius: 28px;
  padding: 56px 52px;
  border: 2px solid #e8e4de;
  margin: auto 0;
}
.numbered .num {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 180px;
  line-height: 0.9;
  background: linear-gradient(135deg, #0d6e66, #c2185b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 28px;
  letter-spacing: -8px;
}
.numbered h3 {
  font-size: 56px; font-weight: 900; letter-spacing:-1.5px; margin-bottom:18px;
  color: #1a1a2e;
}
.numbered p {
  font-size: 30px; color:#444; line-height:1.4; font-weight:500;
}

.tool-row {
  display:flex; flex-direction:column;
  gap: 22px;
  margin: auto 0;
}
.tool-row .row {
  display:flex; align-items:center; gap: 28px;
  background: #fff;
  border-radius: 22px;
  padding: 26px 32px;
  border: 2px solid #e8e4de;
}
.tool-row .ico {
  width: 84px; height:84px; border-radius:18px;
  display:flex; align-items:center; justify-content:center;
  font-family:'Space Grotesk',sans-serif; font-weight:700;
  font-size: 36px; color:#fff; flex-shrink:0;
}
.tool-row .ico.teal  { background: linear-gradient(135deg,#0d6e66,#0a9b8e); }
.tool-row .ico.pink  { background: linear-gradient(135deg,#c2185b,#e8734a); }
.tool-row .ico.coral { background: #e8734a; }
.tool-row .ico.dark  { background: #1a1a2e; }
.tool-row .name { font-weight:800; font-size:34px; color:#1a1a2e; line-height:1.05; }
.tool-row .sub  { font-size: 22px; color:#666; font-weight:500; margin-top:4px; }

.cta-price {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 220px;
  line-height: 1;
  letter-spacing: -10px;
}
.cta-sub {
  font-size: 30px;
  font-weight: 600;
  margin-top: 16px;
  opacity: 0.85;
}
.cta-link {
  margin-top: auto;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 28px;
  letter-spacing: 1px;
  border: 3px solid currentColor;
  padding: 24px 40px;
  border-radius: 18px;
  display: inline-flex;
  align-self: flex-start;
  text-transform: uppercase;
}

.handwritten { font-family:'Caveat',cursive; font-weight:700; }
.typewriter  { font-family:'Special Elite',monospace; }

.struck { text-decoration: line-through; opacity: 0.55; }

.countdown {
  display:inline-block;
  background:#1a1a2e; color:#fff;
  font-family:'Space Grotesk',sans-serif; font-weight:700;
  padding:14px 28px; border-radius:14px;
  font-size:24px; letter-spacing:2px; text-transform:uppercase;
  margin-bottom: 24px;
}
"""

CAROUSEL_CSS = BASE_CSS + """
.slide { width: 1080px; height: 1080px; }
html, body { width: 1080px; height: 1080px; }
"""

PORTRAIT_CSS = BASE_CSS + """
.slide { width: 1080px; height: 1350px; padding: 110px 90px; }
html, body { width: 1080px; height: 1350px; }
"""


def page(content: str, body_class: str, css: str, w: int, h: int) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{css}</style></head>
<body><div class="slide {body_class}" style="width:{w}px;height:{h}px;">{content}</div></body></html>"""


# ============================================================================
# DAY 1 - LAUNCH
# ============================================================================

day1_carousel = [
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<span class="badge pink">Launch day</span>
<h1>FlipIt is</h1>
<h1 class="gradient">live.</h1>
<p class="body lg" style="margin-top:24px;">See it. Flip it. Post it.<br>Go viral.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">01 / 06</span>
</div>
"""),
    ("coral", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#fff;opacity:0.8;">The problem</div>
<h1 class="small">You don't need<br>more ideas.</h1>
<p class="body lg" style="margin-top:18px;">You need to stop staring<br>at the blank page.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.7;">02 / 06</span>
</div>
"""),
    ("teal", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#fff;opacity:0.8;">The flip</div>
<h1 class="medium">Paste any URL.</h1>
<h1 class="medium" style="opacity:0.85;">Fresh script in 30s.</h1>
<p class="body lg" style="margin-top:18px;">Same proven structure.<br>Your angle. Your voice.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.7;">03 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;">What you get</div>
<h2>4 tools, one app.</h2>
<div class="tool-row">
  <div class="row"><div class="ico teal">01</div><div><div class="name">Script flipper</div><div class="sub">Fresh script from any URL in 30s.</div></div></div>
  <div class="row"><div class="ico pink">02</div><div><div class="name">Hook generator</div><div class="sub">7 scroll-stopping hooks per post.</div></div></div>
  <div class="row"><div class="ico coral">03</div><div><div class="name">Caption + hashtag pack</div><div class="sub">Auto-tuned to your niche.</div></div></div>
  <div class="row"><div class="ico dark">04</div><div><div class="name">Watermark-free downloads</div><div class="sub">Reels, TikToks, Shorts. Clean.</div></div></div>
</div>
<div class="footer" style="margin-top:32px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">04 / 06</span>
</div>
"""),
    ("dark", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#e8734a;">Launch price</div>
<div class="cta-price" style="color:#fff;">$<span style="background:linear-gradient(135deg,#0a9b8e,#e8734a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">37</span></div>
<p class="cta-sub" style="color:#faf8f5;">One time. Lifetime.<br>No subs. No usage caps. No upsells.</p>
<div class="footer" style="margin-top:auto;">
  <span class="swipe" style="color:#fff;">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">05 / 06</span>
</div>
"""),
    ("pink", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<h1 class="small">Comment <strong>FLIPIT</strong></h1>
<h1 class="small">— I'll DM you<br>the link.</h1>
<p class="body lg" style="margin-top:24px;">Launch price moves<br>once we hit 100 sales.</p>
<div class="cta-link" style="margin-top:auto;color:#fff;border-color:#fff;">Get FlipIt · link in bio →</div>
<div class="footer" style="margin-top:32px;">
  <span></span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">06 / 06</span>
</div>
"""),
]

day1_static = ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<div class="handwritten" style="font-size:140px;color:#c2185b;line-height:1;margin-bottom:48px;">Today is the day.</div>
<p class="body lg" style="font-size:38px;line-height:1.5;">2 years ago I was a creator burning out writing scripts from scratch.</p>
<p class="body lg" style="font-size:38px;line-height:1.5;margin-top:22px;">Today I'm shipping the tool I wish I'd had — to creators who feel the same way I did.</p>
<p class="body lg" style="font-size:38px;line-height:1.5;margin-top:22px;"><strong>Launch price live now.</strong> $37 lifetime.<br>Comment <strong>FLIPIT</strong> for the link.</p>
<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;">
  <div class="handwritten" style="font-size:64px;color:#0d6e66;">— Fadia</div>
  <div class="kicker" style="margin:0;">flipit.app</div>
</div>
""")


# ============================================================================
# DAY 2 - PROBLEM
# ============================================================================

day2_carousel = [
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<span class="badge coral">Save this</span>
<h1>5 reasons your</h1>
<h1>last reel</h1>
<h1 class="gradient">never got filmed.</h1>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">01 / 06</span>
</div>
"""),
]
problems = [
    ("01", "The hook didn't punch.", "You tried to make it perfect, then you hated it."),
    ("02", "You wrote chronologically.", "Setup → middle → point. The algorithm needs the point first."),
    ("03", "You tried to be original from zero.", "Originality compounds — it doesn't appear out of nowhere."),
    ("04", "You wrote alone.", "No reference, no remix, just a blinking cursor."),
    ("05", "You were missing a system.", "Paste → flip → post. That's the system. Try FlipIt."),
]
for i, (num, head, body) in enumerate(problems, start=2):
    accent = "#c2185b" if i % 2 == 0 else "#0d6e66"
    day2_carousel.append(("cream", f"""
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;">Reason {num}</div>
<div class="numbered">
  <div class="num" style="background:linear-gradient(135deg,{accent},#e8734a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">{num}</div>
  <h3>{head}</h3>
  <p>{body}</p>
</div>
<div class="footer" style="margin-top:48px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">{i:02d} / 06</span>
</div>
"""))

day2_static = ("coral", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<h1 style="color:#fff;font-size:120px;line-height:1.05;">"You don't<br>need more<br>ideas.</h1>
<h1 style="color:#1a1a2e;font-size:120px;line-height:1.05;">You need to<br>stop starting<br>from zero."</h1>
<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;">
  <div class="kicker" style="margin:0;color:#fff;opacity:0.8;">FlipIt · $37 lifetime</div>
  <div class="kicker" style="margin:0;color:#fff;opacity:0.8;">link in bio</div>
</div>
""")


# ============================================================================
# DAY 3 - PROOF
# ============================================================================

day3_carousel = [
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<span class="badge pink">Real flip · receipts</span>
<h1>Same viral post.</h1>
<h1>3 niches.</h1>
<h1 class="gradient">3 winning hooks.</h1>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">01 / 07</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#999;">The original</div>
<h2 style="font-size:54px;color:#666;">A cooking reel.<br>2.4M views.</h2>
<div class="card" style="margin-top:32px;flex:1;display:flex;flex-direction:column;justify-content:center;">
  <div class="label">Original hook</div>
  <p class="text">"The 20-second pasta nobody is teaching you. Watch what happens when you skip the sauce."</p>
  <div style="margin-top:auto;padding-top:24px;display:flex;gap:18px;">
    <span class="badge" style="margin:0;background:rgba(232,115,74,0.18);color:#e8734a;">2.4M views</span>
    <span class="badge" style="margin:0;background:rgba(13,110,102,0.12);color:#0d6e66;">cooking</span>
  </div>
</div>
<div class="footer" style="margin-top:32px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">02 / 07</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#0d6e66;">Flip 1 · Fitness niche</div>
<h2 style="font-size:54px;color:#0d6e66;">Same structure. New angle.</h2>
<div class="card flipped" style="margin-top:32px;flex:1;display:flex;flex-direction:column;justify-content:center;">
  <div class="label">Flipped hook</div>
  <p class="text" style="font-size:36px;color:#1a1a2e;font-weight:700;line-height:1.3;">"The 20-second meal that's quietly wrecking your gut."</p>
  <p class="text" style="margin-top:18px;">Same problem-reveal-payoff. Audience: fitness. Result: relevant.</p>
</div>
<div class="footer" style="margin-top:32px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">03 / 07</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#c2185b;">Flip 2 · Content marketing</div>
<h2 style="font-size:54px;color:#c2185b;">Same structure. New angle.</h2>
<div class="card" style="border-color:#c2185b;border-width:3px;margin-top:32px;flex:1;display:flex;flex-direction:column;justify-content:center;">
  <div class="label" style="color:#c2185b;">Flipped hook</div>
  <p class="text" style="font-size:36px;color:#1a1a2e;font-weight:700;line-height:1.3;">"Your content is a recipe. You skipped the seasoning."</p>
  <p class="text" style="margin-top:18px;">Borrowed metaphor. Audience: marketers. Result: shareable.</p>
</div>
<div class="footer" style="margin-top:32px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">04 / 07</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#e8734a;">Flip 3 · Personal finance</div>
<h2 style="font-size:54px;color:#e8734a;">Same structure. New angle.</h2>
<div class="card" style="border-color:#e8734a;border-width:3px;margin-top:32px;flex:1;display:flex;flex-direction:column;justify-content:center;">
  <div class="label" style="color:#e8734a;">Flipped hook</div>
  <p class="text" style="font-size:36px;color:#1a1a2e;font-weight:700;line-height:1.3;">"I budget like a chef. 3 ingredients only."</p>
  <p class="text" style="margin-top:18px;">Cross-domain analogy. Audience: finance. Result: memorable.</p>
</div>
<div class="footer" style="margin-top:32px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">05 / 07</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#0d6e66;">The trick</div>
<div class="divider teal"></div>
<h2>Structure is the moat.</h2>
<h2 class="gradient">Angle is yours.</h2>
<p class="body lg" style="margin-top:18px;">Same proven shape (problem → reveal → payoff).<br>Different audience. Different reach. Different result.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">06 / 07</span>
</div>
"""),
    ("teal", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<h1 class="small">Try it tonight.</h1>
<p class="body lg" style="margin-top:24px;">Paste a viral URL in your niche.<br>Get 3 fresh angles in 30 seconds.</p>
<p class="body lg" style="margin-top:24px;"><strong>Comment PROOF — I'll DM you the link.</strong></p>
<div class="cta-link" style="margin-top:auto;color:#fff;border-color:#fff;">$37 lifetime · link in bio →</div>
<div class="footer" style="margin-top:32px;">
  <span></span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">07 / 07</span>
</div>
"""),
]

day3_static = ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<div style="display:flex;gap:24px;flex:1;">
  <div class="card" style="flex:1;display:flex;flex-direction:column;justify-content:center;background:#f0ebe2;border-color:#d8d2c4;">
    <div class="label" style="color:#999;">Before</div>
    <div class="typewriter" style="font-size:32px;color:#666;line-height:1.4;margin-top:14px;">Tuesday, 11:47 PM<br><br>blank doc.<br>blinking cursor.<br>nothing to film.<br><br>close laptop.</div>
  </div>
  <div class="card flipped" style="flex:1;display:flex;flex-direction:column;justify-content:center;">
    <div class="label" style="color:#0d6e66;">After</div>
    <div class="typewriter" style="font-size:32px;color:#1a1a2e;line-height:1.4;margin-top:14px;">Tuesday, 11:47 PM<br><br>paste URL.<br>flip.<br>script ready.<br><br>filming in 5 min.</div>
  </div>
</div>
<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#c2185b;color:#fff;padding:22px 44px;border-radius:18px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:36px;letter-spacing:2px;box-shadow:0 12px 30px rgba(0,0,0,0.18);">30 SECONDS</div>
<div style="margin-top:32px;display:flex;justify-content:space-between;align-items:flex-end;">
  <div class="kicker" style="margin:0;">FlipIt · receipts > promises</div>
  <div class="kicker" style="margin:0;">comment PROOF</div>
</div>
""")


# ============================================================================
# DAY 4 - STACK
# ============================================================================

day4_carousel = [
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<span class="badge">The math</span>
<h1>FlipIt replaces</h1>
<h1 class="gradient">4 tools.</h1>
<p class="body lg" style="margin-top:24px;">$75/mo of subs.<br>One $37 payment.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">01 / 06</span>
</div>
"""),
]
stack_tools = [
    ("teal",  "01", "Script flipper",        "Paste URL, get a fresh script in 30s.",       "Replaces · $19/mo"),
    ("pink",  "02", "Hook generator",        "7 hook variations per post.",                 "Replaces · $29/mo"),
    ("coral", "03", "Caption + hashtag pack","Auto-tuned to your niche.",                   "Replaces · $15/mo"),
    ("dark",  "04", "Watermark-free downloads","Reel, TikTok, YT Short, all clean.",        "Replaces · $12/mo"),
]
for i, (color, num, name, desc, replaces) in enumerate(stack_tools, start=2):
    day4_carousel.append(("cream", f"""
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;">Tool {num} of 04</div>
<div class="numbered" style="display:flex;flex-direction:column;gap:8px;">
  <div style="display:flex;align-items:center;gap:32px;">
    <div class="tool-icon-lg" style="width:140px;height:140px;border-radius:30px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:60px;color:#fff;flex-shrink:0;background:{'linear-gradient(135deg,#0d6e66,#0a9b8e)' if color=='teal' else 'linear-gradient(135deg,#c2185b,#e8734a)' if color=='pink' else '#e8734a' if color=='coral' else '#1a1a2e'};">{num}</div>
    <div style="flex:1;">
      <h3 style="font-size:54px;margin-bottom:8px;">{name}</h3>
      <p style="font-size:30px;color:#444;font-weight:500;">{desc}</p>
    </div>
  </div>
  <div style="margin-top:28px;padding:18px 24px;background:rgba(232,115,74,0.12);border-radius:14px;color:#e8734a;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:24px;letter-spacing:1.5px;text-transform:uppercase;">{replaces}</div>
</div>
<div class="footer" style="margin-top:48px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">{i:02d} / 06</span>
</div>
"""))

day4_carousel.append(("dark", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#e8734a;">The math</div>
<h1 class="small" style="color:#fff;">$75/mo subs</h1>
<h1 class="medium" style="color:#fff;opacity:0.45;text-decoration:line-through;">$900/yr</h1>
<h1 class="medium" style="margin-top:32px;background:linear-gradient(135deg,#0a9b8e,#e8734a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">→ $37 once.</h1>
<p class="body lg" style="color:#faf8f5;margin-top:24px;">Pays for itself in 12 days.<br>Keeps paying every month after.</p>
<div class="cta-link" style="margin-top:auto;color:#fff;border-color:#fff;">Comment STACK · link in bio →</div>
<div class="footer" style="margin-top:32px;">
  <span></span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">06 / 06</span>
</div>
"""))

day4_static = ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:24px;">My creator stack · audited</div>
<div class="card" style="margin-top:24px;flex:1;display:flex;flex-direction:column;justify-content:center;background:#fffdf6;background-image:repeating-linear-gradient(transparent,transparent 58px,#e8e4de 58px,#e8e4de 60px);">
  <div class="typewriter struck" style="font-size:36px;line-height:1.65;color:#1a1a2e;">ScriptGen Pro &nbsp;&nbsp;— $19/mo</div>
  <div class="typewriter struck" style="font-size:36px;line-height:1.65;color:#1a1a2e;">HookBank &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— $29/mo</div>
  <div class="typewriter struck" style="font-size:36px;line-height:1.65;color:#1a1a2e;">CaptionAI &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— $15/mo</div>
  <div class="typewriter struck" style="font-size:36px;line-height:1.65;color:#1a1a2e;">ClipPull &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— $12/mo</div>
  <div style="height:2px;background:#1a1a2e;margin:28px 0;"></div>
  <div class="typewriter" style="font-size:42px;color:#0d6e66;font-weight:700;">FlipIt &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— $37 once ✓</div>
</div>
<div style="margin-top:32px;display:flex;justify-content:space-between;align-items:flex-end;">
  <div class="kicker" style="margin:0;">comment STACK · link in bio</div>
  <div class="kicker" style="margin:0;color:#0d6e66;">FlipIt</div>
</div>
""")


# ============================================================================
# DAY 5 - STORY
# ============================================================================

day5_carousel = [
    ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<span class="badge pink">Founder note</span>
<div class="handwritten" style="font-size:160px;color:#1a1a2e;line-height:1;">18 months.</div>
<div class="handwritten" style="font-size:160px;color:#c2185b;line-height:1;">0 viral posts.</div>
<div class="handwritten" style="font-size:160px;color:#0d6e66;line-height:1;">1 lesson.</div>
<div class="footer" style="margin-top:48px;">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">01 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;">Month 1–6</div>
<div class="divider"></div>
<h2>I tried to be original.</h2>
<h2 class="gradient">I failed every Tuesday.</h2>
<p class="body lg" style="margin-top:18px;">Three hours per script. One reel a week. None of them were anything I was proud of.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">02 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#0d6e66;">Month 7–12</div>
<div class="divider teal"></div>
<h2>Then I started studying<br>viral posts as <em style="font-style:italic;">templates</em>,</h2>
<h2 class="gradient">not as winners.</h2>
<p class="body lg" style="margin-top:18px;">Output went up. Confidence went up. Tuesdays got tolerable.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">03 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#e8734a;">Month 13–18</div>
<div class="divider coral"></div>
<h2>I systemized the flip<br>into a 30-second workflow.</h2>
<h2 class="gradient">Now I post 4× a day.</h2>
<p class="body lg" style="margin-top:18px;">Same niche. Real engagement. Zero blank-page sessions.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">04 / 06</span>
</div>
"""),
    ("pink", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#fff;opacity:0.85;">The realization</div>
<div class="handwritten" style="font-size:120px;color:#fff;line-height:1.05;">"You don't need<br>to be original.</div>
<div class="handwritten" style="font-size:120px;color:#1a1a2e;line-height:1.05;margin-top:24px;">You need to be<br>a great reframer."</div>
<div class="footer" style="margin-top:48px;">
  <span class="swipe" style="color:#fff;">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.7;">05 / 06</span>
</div>
"""),
    ("teal", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<h1 class="small">That workflow<br>is FlipIt.</h1>
<p class="body lg" style="margin-top:24px;">Same realization. Same workflow.<br>Now it lives in a tool.</p>
<p class="body lg" style="margin-top:18px;"><strong>Comment STORY — I'll send it over.</strong></p>
<div class="cta-link" style="margin-top:auto;color:#fff;border-color:#fff;">$37 lifetime · link in bio →</div>
<div class="footer" style="margin-top:32px;">
  <span></span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">06 / 06</span>
</div>
"""),
]

day5_static = ("cream", """
<div class="brand">FlipIt</div>
<div class="spacer"></div>
<div style="background:#fff;padding:60px 60px 40px;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.18);transform:rotate(-2deg);align-self:center;width:80%;">
  <div style="background:linear-gradient(135deg,#1a1a2e,#0d6e66);width:100%;height:520px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
    <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#fff;font-size:120px;letter-spacing:-4px;opacity:0.9;">flip<span style="color:#e8734a;">.</span></div>
  </div>
  <div class="handwritten" style="font-size:64px;color:#1a1a2e;text-align:center;margin-top:32px;line-height:1.15;">"You don't need to be original.<br>You need to be a great reframer."</div>
</div>
<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:32px;">
  <div class="kicker" style="margin:0;">tape this above your desk</div>
  <div class="kicker" style="margin:0;color:#0d6e66;">FlipIt · link in bio</div>
</div>
""")


# ============================================================================
# DAY 6 - CLOSE
# ============================================================================

day6_carousel = [
    ("coral", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="countdown" style="background:#1a1a2e;color:#fff;">Ends 11:59 PM ET</div>
<h1 style="color:#fff;">Last day at</h1>
<h1 style="color:#1a1a2e;font-size:200px;letter-spacing:-8px;">$37.</h1>
<p class="body lg" style="margin-top:18px;color:#fff;">Tomorrow it's $59. Same product.<br>Just a less smart deal.</p>
<div class="footer">
  <span class="swipe" style="color:#fff;">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.7;">01 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#0d6e66;">Lifetime access</div>
<div class="divider teal"></div>
<h2>Pay once. Use forever.</h2>
<p class="body lg" style="margin-top:18px;">No subs. No usage caps. No "pro tier" gotcha.<br>Same login on every device, every year.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">02 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#c2185b;">All 4 tools</div>
<div class="divider"></div>
<h2>Scripts. Hooks.<br>Captions. Downloads.</h2>
<p class="body lg" style="margin-top:18px;">One paste-and-flip workflow. Four jobs done. Zero subscription drama.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">03 / 06</span>
</div>
"""),
    ("cream", """
<div class="brand">FlipIt</div>
<div class="kicker" style="margin-top:36px;color:#e8734a;">Every platform</div>
<div class="divider coral"></div>
<h2>Instagram. TikTok.<br>YouTube. LinkedIn.</h2>
<h2>Facebook. X. Threads.</h2>
<p class="body lg" style="margin-top:18px;">If it's a public post, FlipIt can pull it, flip it, and ship it watermark-free.</p>
<div class="footer">
  <span class="swipe">Swipe →</span>
  <span class="pagecount">04 / 06</span>
</div>
"""),
    ("teal", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#fff;opacity:0.85;">Free updates · forever</div>
<h1 class="small" style="color:#fff;">Every new feature.<br>Every new platform.</h1>
<h1 class="small" style="color:#fff;opacity:0.85;">Included.</h1>
<p class="body lg" style="margin-top:24px;color:#fff;">No "FlipIt 2.0 upgrade" email. Ever.</p>
<div class="footer">
  <span class="swipe" style="color:#fff;">Swipe →</span>
  <span class="pagecount" style="color:#fff;opacity:0.7;">05 / 06</span>
</div>
"""),
    ("dark", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="countdown" style="background:#e8734a;color:#fff;">Tonight · 11:59 PM ET</div>
<div style="display:flex;align-items:flex-end;gap:32px;margin-bottom:24px;">
  <div class="cta-price" style="color:#fff;font-size:200px;">$37</div>
  <div style="color:#fff;font-size:80px;font-weight:700;font-family:'Space Grotesk',sans-serif;line-height:1;padding-bottom:24px;">→ $59</div>
</div>
<p class="cta-sub" style="color:#faf8f5;">No extensions. No "I missed it" exceptions.<br>Comment <strong>LAST</strong> — I'll DM you the link.</p>
<div class="cta-link" style="margin-top:auto;color:#fff;border-color:#fff;">Get FlipIt · link in bio →</div>
<div class="footer" style="margin-top:32px;">
  <span></span>
  <span class="pagecount" style="color:#fff;opacity:0.6;">06 / 06</span>
</div>
"""),
]

day6_static = ("dark", """
<div class="brand" style="color:#fff;">FlipIt</div>
<div class="spacer"></div>
<div class="kicker" style="color:#e8734a;letter-spacing:6px;">— TONIGHT —</div>
<div style="display:flex;align-items:center;justify-content:center;gap:48px;margin:32px 0;">
  <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#fff;font-size:200px;letter-spacing:-8px;line-height:1;">$37</div>
  <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#e8734a;font-size:96px;line-height:1;">→</div>
  <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#999;font-size:140px;letter-spacing:-6px;line-height:1;">$59</div>
</div>
<div style="text-align:center;color:#faf8f5;font-size:32px;font-weight:600;margin-top:24px;letter-spacing:1px;">launch price ends 11:59 PM ET</div>
<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:48px;">
  <div class="handwritten" style="font-size:64px;color:#0a9b8e;">— Fadia</div>
  <div class="kicker" style="margin:0;color:#fff;opacity:0.6;">flipit.app</div>
</div>
""")


# ============================================================================
# REGISTRY
# ============================================================================

DAYS = [
    ("day1_launch",   day1_carousel, day1_static),
    ("day2_problem",  day2_carousel, day2_static),
    ("day3_proof",    day3_carousel, day3_static),
    ("day4_stack",    day4_carousel, day4_static),
    ("day5_story",    day5_carousel, day5_static),
    ("day6_close",    day6_carousel, day6_static),
]


def main():
    total_slides = sum(len(c) for _, c, _ in DAYS)
    print(f"Rendering {len(DAYS)} days · {total_slides} carousel slides + {len(DAYS)} static posts")

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # square context
        sq_ctx = browser.new_context(viewport={"width": SQ, "height": SQ}, device_scale_factor=2)
        sq_page = sq_ctx.new_page()

        # portrait context
        pt_ctx = browser.new_context(viewport={"width": PORT_W, "height": PORT_H}, device_scale_factor=2)
        pt_page = pt_ctx.new_page()

        for day_name, carousel, static in DAYS:
            day_dir = ROOT / day_name
            day_dir.mkdir(exist_ok=True)
            print(f"\n=== {day_name} ===")

            # carousel
            for i, (body_class, content) in enumerate(carousel, start=1):
                html = page(content, body_class, CAROUSEL_CSS, SQ, SQ)
                sq_page.set_content(html, wait_until="networkidle")
                out = day_dir / f"carousel_slide_{i:02d}.png"
                sq_page.screenshot(path=str(out), full_page=False, omit_background=False,
                                   clip={"x": 0, "y": 0, "width": SQ, "height": SQ})
                print(f"  carousel_slide_{i:02d}.png  ({out.stat().st_size//1024} KB)")

            # static post
            body_class, content = static
            html = page(content, body_class, PORTRAIT_CSS, PORT_W, PORT_H)
            pt_page.set_content(html, wait_until="networkidle")
            out = day_dir / "static_post.png"
            pt_page.screenshot(path=str(out), full_page=False, omit_background=False,
                               clip={"x": 0, "y": 0, "width": PORT_W, "height": PORT_H})
            print(f"  static_post.png         ({out.stat().st_size//1024} KB)")

        browser.close()
    print("\nDONE")


if __name__ == "__main__":
    main()
