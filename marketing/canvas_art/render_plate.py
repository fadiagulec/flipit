"""
Reflected Order — Plate I
A museum-quality specimen plate of twelve studies in axial reflection.

Rendered at 2x then downsampled to 1500x1875 for crisp output.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
FONT_DIR = ROOT / "fonts"

# ---------------------------------------------------------------------------
# DESIGN TOKENS
# ---------------------------------------------------------------------------

# canvas
SCALE = 2  # supersample factor
W, H = 1500 * SCALE, 1875 * SCALE

# palette
BONE      = (243, 238, 226)   # unbleached linen
INK       = (24, 31, 46)      # deep navy ink
INK_SOFT  = (24, 31, 46, 70)  # transparent navy for hairlines
TERRACOTTA= (177, 75, 49)     # the single accent
GHOST     = (24, 31, 46, 30)  # very faint guides

# margins (generous)
M_TOP    = 110 * SCALE
M_BOT    = 130 * SCALE
M_LEFT   = 120 * SCALE
M_RIGHT  = 120 * SCALE

# fonts
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size * SCALE)

# ---------------------------------------------------------------------------
# CANVAS
# ---------------------------------------------------------------------------

img = Image.new("RGB", (W, H), BONE)
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
od = ImageDraw.Draw(overlay)


def hairline(x1, y1, x2, y2, alpha=80, width=1):
    od.line([(x1, y1), (x2, y2)], fill=(*INK, alpha), width=width * SCALE)

def fineline(x1, y1, x2, y2, color=INK, width=2):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width * SCALE)


# ---------------------------------------------------------------------------
# HEADER  (thin top band)
# ---------------------------------------------------------------------------

mono_xs = font("DMMono-Regular.ttf", 13)
mono_sm = font("DMMono-Regular.ttf", 14)
mono_md = font("DMMono-Regular.ttf", 16)
serif_italic_xl = font("InstrumentSerif-Italic.ttf", 96)
serif_italic_md = font("InstrumentSerif-Italic.ttf", 26)
italiana_xl = font("Italiana-Regular.ttf", 138)

# top hairline strip
header_y = M_TOP
draw.text((M_LEFT, header_y), "PLATE  I", font=mono_md, fill=INK)
right_label = "REFLECTED ORDER  ·  VOL. I  ·  MMXXVI"
rw = draw.textlength(right_label, font=mono_md)
draw.text((W - M_RIGHT - rw, header_y), right_label, font=mono_md, fill=INK)

# rule under header
rule_y = header_y + 36 * SCALE
fineline(M_LEFT, rule_y, W - M_RIGHT, rule_y, color=INK, width=1)

# ---------------------------------------------------------------------------
# TITLE BLOCK
# ---------------------------------------------------------------------------

title_y = rule_y + 70 * SCALE
draw.text((M_LEFT, title_y), "Reflected Order", font=italiana_xl, fill=INK)

subtitle_y = title_y + 168 * SCALE
draw.text(
    (M_LEFT, subtitle_y),
    "twelve studies in axial variation",
    font=serif_italic_md,
    fill=INK,
)

# right-side metadata, set as field notes
meta_y = title_y + 18 * SCALE
meta_lines = [
    ("CATALOGUE", "RO·001"),
    ("DOMAIN",    "REFRAME"),
    ("METHOD",    "AXIAL"),
    ("EDITION",   "I / I"),
]
for i, (k, v) in enumerate(meta_lines):
    y = meta_y + i * 28 * SCALE
    draw.text((W - M_RIGHT - 240 * SCALE, y), k, font=mono_xs, fill=INK)
    draw.text((W - M_RIGHT - 110 * SCALE, y), v, font=mono_xs, fill=INK)

# rule above grid
grid_top_rule = subtitle_y + 64 * SCALE
fineline(M_LEFT, grid_top_rule, W - M_RIGHT, grid_top_rule, color=INK, width=1)

# tick marks along the rule (horological)
for i in range(0, 41):
    x = M_LEFT + (W - M_LEFT - M_RIGHT) * i / 40
    h = 6 * SCALE if i % 5 else 12 * SCALE
    hairline(x, grid_top_rule, x, grid_top_rule + h, alpha=130, width=1)


# ---------------------------------------------------------------------------
# SPECIMEN GRID — 4 columns x 3 rows
# ---------------------------------------------------------------------------

GRID_TOP    = grid_top_rule + 80 * SCALE
GRID_BOT    = H - M_BOT - 110 * SCALE
GRID_LEFT   = M_LEFT
GRID_RIGHT  = W - M_RIGHT
COLS, ROWS  = 4, 3

cell_w = (GRID_RIGHT - GRID_LEFT) / COLS
cell_h = (GRID_BOT - GRID_TOP) / ROWS


def cell_origin(col, row):
    return GRID_LEFT + col * cell_w, GRID_TOP + row * cell_h


# Faint grid guides — barely a whisper
for c in range(1, COLS):
    x = GRID_LEFT + c * cell_w
    hairline(x, GRID_TOP - 14 * SCALE, x, GRID_BOT + 14 * SCALE, alpha=15, width=1)
for r in range(1, ROWS):
    y = GRID_TOP + r * cell_h
    hairline(GRID_LEFT, y, GRID_RIGHT, y, alpha=15, width=1)


def specimen_axis(cx, cy_top, cy_bot, alpha=140):
    # the central reflective axis of each specimen — a hairline
    hairline(cx, cy_top, cx, cy_bot, alpha=alpha, width=1)


# Drawing primitives operating in cell-local coordinates
# Each specimen draws into a cell: x0,y0 (origin), padded
PAD_X = 60 * SCALE
PAD_Y = 70 * SCALE
LABEL_GAP = 26 * SCALE


def draw_label(x0, y0, plate_num, kind):
    # plate number top-left
    draw.text((x0 + PAD_X - 20 * SCALE, y0 + PAD_Y - 36 * SCALE),
              f"{plate_num:02d}", font=mono_xs, fill=INK)
    # kind tag bottom-left
    bw = draw.textlength(kind, font=mono_xs)
    draw.text((x0 + cell_w - PAD_X - bw + 20 * SCALE,
               y0 + cell_h - PAD_Y - 4 * SCALE),
              kind, font=mono_xs, fill=INK)


def specimen_box(col, row):
    # returns the working interior of the cell as a tuple
    x0, y0 = cell_origin(col, row)
    ix0 = x0 + PAD_X
    iy0 = y0 + PAD_Y
    ix1 = x0 + cell_w - PAD_X
    iy1 = y0 + cell_h - PAD_Y
    cx  = (ix0 + ix1) / 2
    cy  = (iy0 + iy1) / 2
    return x0, y0, ix0, iy0, ix1, iy1, cx, cy


# ---- 12 specimens -----------------------------------------------------------
# Each is a "pair across the axis" — same DNA, subtle reframe.

# 01 — twin bars, right slightly shorter
def s01(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    bw = 26 * SCALE
    h_l = (iy1 - iy0) * 0.78
    h_r = (iy1 - iy0) * 0.62
    # left bar
    draw.rectangle([cx - 60 * SCALE - bw, iy1 - h_l, cx - 60 * SCALE, iy1], fill=INK)
    # right bar
    draw.rectangle([cx + 60 * SCALE, iy1 - h_r, cx + 60 * SCALE + bw, iy1], fill=INK)
    draw_label(x0, y0, 1, "i. bar")

# 02 — half-circles facing axis (filled / outline)
def s02(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    r = 78 * SCALE
    # left filled
    draw.pieslice([cx - 60 * SCALE - r, cy - r, cx - 60 * SCALE + r, cy + r],
                  start=270, end=90, fill=INK)
    # right outline
    draw.arc([cx + 60 * SCALE - r, cy - r, cx + 60 * SCALE + r, cy + r],
             start=90, end=270, fill=INK, width=4 * SCALE)
    draw_label(x0, y0, 2, "ii. arc")

# 03 — twin squares, right rotated subtly (drawn as polygon)
def s03(col, row):
    import math
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    sz = 110 * SCALE
    # left axis-aligned square
    draw.rectangle([cx - 60 * SCALE - sz, cy - sz/2, cx - 60 * SCALE, cy + sz/2],
                   outline=INK, width=4 * SCALE)
    # right rotated ~7°
    a = math.radians(7)
    crx = cx + 60 * SCALE + sz/2
    cry = cy
    pts = [(-sz/2, -sz/2), (sz/2, -sz/2), (sz/2, sz/2), (-sz/2, sz/2)]
    rot = [(crx + p[0]*math.cos(a) - p[1]*math.sin(a),
            cry + p[0]*math.sin(a) + p[1]*math.cos(a)) for p in pts]
    draw.polygon(rot, outline=INK)
    # restate with thicker lines
    for i in range(4):
        draw.line([rot[i], rot[(i+1)%4]], fill=INK, width=4 * SCALE)
    draw_label(x0, y0, 3, "iii. drift")

# 04 — twin triangles, one inverted
def s04(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    sz = 110 * SCALE
    # left: filled, point-up
    draw.polygon([(cx - 60 * SCALE - sz, cy + sz/2),
                  (cx - 60 * SCALE,       cy + sz/2),
                  (cx - 60 * SCALE - sz/2, cy - sz/2)], fill=INK)
    # right: outline, point-down
    draw.polygon([(cx + 60 * SCALE,       cy - sz/2),
                  (cx + 60 * SCALE + sz,  cy - sz/2),
                  (cx + 60 * SCALE + sz/2, cy + sz/2)], outline=INK)
    for pts in [[(cx + 60 * SCALE, cy - sz/2), (cx + 60 * SCALE + sz, cy - sz/2)],
                [(cx + 60 * SCALE + sz, cy - sz/2), (cx + 60 * SCALE + sz/2, cy + sz/2)],
                [(cx + 60 * SCALE + sz/2, cy + sz/2), (cx + 60 * SCALE, cy - sz/2)]]:
        draw.line(pts, fill=INK, width=4 * SCALE)
    draw_label(x0, y0, 4, "iv. invert")

# 05 — two 5x5 dot grids, one with a single shifted dot
def s05(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    n = 5
    spacing = 22 * SCALE
    dr = 4 * SCALE
    # left grid
    grid_w = (n-1) * spacing
    lx = cx - 70 * SCALE - grid_w
    ly = cy - grid_w / 2
    for i in range(n):
        for j in range(n):
            cxd = lx + j * spacing
            cyd = ly + i * spacing
            draw.ellipse([cxd-dr, cyd-dr, cxd+dr, cyd+dr], fill=INK)
    # right grid — same, but center dot is shifted up-right
    rx = cx + 70 * SCALE
    ry = cy - grid_w / 2
    for i in range(n):
        for j in range(n):
            cxd = rx + j * spacing
            cyd = ry + i * spacing
            if i == 2 and j == 2:
                cxd += 8 * SCALE
                cyd -= 8 * SCALE
                draw.ellipse([cxd-dr-1, cyd-dr-1, cxd+dr+1, cyd+dr+1], fill=INK)
            else:
                draw.ellipse([cxd-dr, cyd-dr, cxd+dr], fill=INK) if False else \
                    draw.ellipse([cxd-dr, cyd-dr, cxd+dr, cyd+dr], fill=INK)
    draw_label(x0, y0, 5, "v. lattice")

# 06 — paired arcs, one above one below
def s06(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    r = 95 * SCALE
    # left: arc opening downward (top half)
    draw.arc([cx - 60 * SCALE - r, cy - r, cx - 60 * SCALE + r, cy + r],
             start=180, end=360, fill=INK, width=4 * SCALE)
    # right: arc opening upward (bottom half)
    draw.arc([cx + 60 * SCALE - r, cy - r, cx + 60 * SCALE + r, cy + r],
             start=0, end=180, fill=INK, width=4 * SCALE)
    draw_label(x0, y0, 6, "vi. tide")

# 07 — twin horizontal lines: a measured span and its (shorter) reframed echo
def s07(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    # left: solid measure with caliper-style end caps
    L1_left  = ix0 + 24 * SCALE
    L1_right = cx - 24 * SCALE
    fineline(L1_left, cy, L1_right, cy, width=3)
    fineline(L1_left, cy - 14 * SCALE, L1_left, cy + 14 * SCALE, width=3)
    fineline(L1_right, cy - 14 * SCALE, L1_right, cy + 14 * SCALE, width=3)
    # tiny dot above to mark the midpoint of the span
    mid_l = (L1_left + L1_right) / 2
    draw.ellipse([mid_l - 3*SCALE, cy - 26 * SCALE - 3*SCALE,
                  mid_l + 3*SCALE, cy - 26 * SCALE + 3*SCALE], fill=INK)
    # right: dashed echo — same form, voiced differently
    L2_left  = cx + 32 * SCALE
    L2_right = ix1 - 32 * SCALE
    dash_len = 12 * SCALE
    gap_len  = 8 * SCALE
    x = L2_left
    while x < L2_right:
        x_end = min(x + dash_len, L2_right)
        fineline(x, cy, x_end, cy, width=3)
        x += dash_len + gap_len
    fineline(L2_left,  cy - 14 * SCALE, L2_left,  cy + 14 * SCALE, width=3)
    fineline(L2_right, cy - 14 * SCALE, L2_right, cy + 14 * SCALE, width=3)
    mid_r = (L2_left + L2_right) / 2
    draw.ellipse([mid_r - 3*SCALE, cy + 22 * SCALE - 3*SCALE,
                  mid_r + 3*SCALE, cy + 22 * SCALE + 3*SCALE], fill=INK)
    draw_label(x0, y0, 7, "vii. span")

# 08 — mirrored stepped form
def s08(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    step = 22 * SCALE
    n = 5
    base_y = cy + (n * step) / 2
    # left ascending toward axis
    for i in range(n):
        x_l_right = cx - 60 * SCALE
        x_l_left = x_l_right - (i+1) * step
        y_top = base_y - (i+1) * step
        draw.rectangle([x_l_left, y_top, x_l_right, base_y], outline=INK, width=3*SCALE)
    # right descending from axis (same shape, flipped horizontally + value inverted)
    for i in range(n):
        x_r_left = cx + 60 * SCALE
        x_r_right = x_r_left + (n - i) * step
        y_top = base_y - (n - i) * step
        if i == 0:
            draw.rectangle([x_r_left, y_top, x_r_right, base_y], fill=INK)
        else:
            draw.rectangle([x_r_left, y_top, x_r_right, base_y], outline=INK, width=3*SCALE)
    draw_label(x0, y0, 8, "viii. stair")

# 09 — THE ANOMALY: two filled rectangles, ONE TERRACOTTA
def s09(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    rw, rh = 100 * SCALE, 130 * SCALE
    # left navy
    draw.rectangle([cx - 60 * SCALE - rw, cy - rh/2, cx - 60 * SCALE, cy + rh/2], fill=INK)
    # right terracotta
    draw.rectangle([cx + 60 * SCALE, cy - rh/2, cx + 60 * SCALE + rw, cy + rh/2], fill=TERRACOTTA)
    draw_label(x0, y0, 9, "ix. flip")

# 10 — concentric circles, one with offset center
def s10(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    # left: 3 concentric, perfectly centered
    cx_l = cx - 110 * SCALE
    for r in (78*SCALE, 50*SCALE, 22*SCALE):
        draw.ellipse([cx_l - r, cy - r, cx_l + r, cy + r], outline=INK, width=3*SCALE)
    # right: 3 concentric, but centers progressively offset
    cx_r = cx + 110 * SCALE
    offsets = [(0,0), (8*SCALE, -4*SCALE), (16*SCALE, -10*SCALE)]
    for r, (dx, dy) in zip((78*SCALE, 50*SCALE, 22*SCALE), offsets):
        draw.ellipse([cx_r + dx - r, cy + dy - r, cx_r + dx + r, cy + dy + r],
                     outline=INK, width=3*SCALE)
    draw_label(x0, y0, 10, "x. orbit")

# 11 — mirrored L-shapes with different proportions
def s11(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    t = 22 * SCALE
    # left L (open right-down)
    L_h = 130 * SCALE
    L_w = 90 * SCALE
    lx = cx - 60 * SCALE - L_w
    ly = cy - L_h/2
    draw.rectangle([lx, ly, lx + t, ly + L_h], fill=INK)
    draw.rectangle([lx, ly + L_h - t, lx + L_w, ly + L_h], fill=INK)
    # right L (open left-down) — but taller, narrower
    L_h2 = 150 * SCALE
    L_w2 = 70 * SCALE
    rx = cx + 60 * SCALE + L_w2
    ry = cy - L_h2/2
    draw.rectangle([rx - t, ry, rx, ry + L_h2], fill=INK)
    draw.rectangle([rx - L_w2, ry + L_h2 - t, rx, ry + L_h2], fill=INK)
    draw_label(x0, y0, 11, "xi. limb")

# 12 — two grids of negative space, one with a gap
def s12(col, row):
    x0, y0, ix0, iy0, ix1, iy1, cx, cy = specimen_box(col, row)
    specimen_axis(cx, iy0, iy1)
    n = 4
    spacing = 28 * SCALE
    cell = 22 * SCALE
    grid_w = n * spacing
    # left: complete 4x4
    lx = cx - 60 * SCALE - grid_w
    ly = cy - grid_w/2
    for i in range(n):
        for j in range(n):
            x = lx + j * spacing
            y = ly + i * spacing
            draw.rectangle([x, y, x + cell, y + cell], outline=INK, width=2*SCALE)
    # right: same grid but missing (i=1, j=2)
    rx = cx + 60 * SCALE
    ry = cy - grid_w/2
    for i in range(n):
        for j in range(n):
            if i == 1 and j == 2:
                continue
            x = rx + j * spacing
            y = ry + i * spacing
            draw.rectangle([x, y, x + cell, y + cell], outline=INK, width=2*SCALE)
    draw_label(x0, y0, 12, "xii. omission")


# Place all twelve in the grid (column, row)
specimens = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12]
positions = [(c, r) for r in range(ROWS) for c in range(COLS)]
for fn, (c, r) in zip(specimens, positions):
    fn(c, r)


# ---------------------------------------------------------------------------
# FOOTER — sparse anchor
# ---------------------------------------------------------------------------

bottom_rule_y = GRID_BOT + 80 * SCALE
fineline(M_LEFT, bottom_rule_y, W - M_RIGHT, bottom_rule_y, color=INK, width=1)

# tick marks — mirrored on bottom rule
for i in range(0, 41):
    x = M_LEFT + (W - M_LEFT - M_RIGHT) * i / 40
    h = 6 * SCALE if i % 5 else 12 * SCALE
    hairline(x, bottom_rule_y - h, x, bottom_rule_y, alpha=130, width=1)

# left-anchor: italic phrase (subtle reference)
phrase = "see it. flip it."
draw.text((M_LEFT, bottom_rule_y + 32 * SCALE),
          phrase, font=serif_italic_md, fill=INK)

# right-anchor: figure range
fig_range = "fig.  i — xii"
fr_w = draw.textlength(fig_range, font=mono_md)
draw.text((W - M_RIGHT - fr_w, bottom_rule_y + 36 * SCALE),
          fig_range, font=mono_md, fill=INK)

# very small footnote, centered, well below the phrase
foot = "an inquiry into the structural memory of forms when observed twice"
fw = draw.textlength(foot, font=mono_xs)
draw.text(((W - fw) / 2, bottom_rule_y + 88 * SCALE),
          foot, font=mono_xs, fill=INK)


# ---------------------------------------------------------------------------
# Compose hairline overlay onto base
# ---------------------------------------------------------------------------

img_rgba = img.convert("RGBA")
final = Image.alpha_composite(img_rgba, overlay).convert("RGB")

# Downsample with LANCZOS for crispness
final = final.resize((W // SCALE, H // SCALE), Image.LANCZOS)

out = ROOT / "reflected_order_plate_i.png"
final.save(out, format="PNG", optimize=True)
print(f"saved · {out} · {out.stat().st_size//1024} KB")
