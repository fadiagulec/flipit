"""Generate flippost-site/og-share.png — the Open Graph share card.

Idempotent: safe to re-run. Overwrites the output file each time.

Output: 1200x630 PNG with FlipIt brand teal vertical gradient,
wordmark, tagline, center flip-arrow decoration, and a small
"Made with FlipIt" badge in the bottom-right corner.

Usage:
    pip install --user Pillow
    python scripts/generate_og_share.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write(
        "Pillow is required. Install with: pip install --user Pillow\n"
    )
    sys.exit(1)


# --- Layout / brand constants ----------------------------------------------
WIDTH, HEIGHT = 1200, 630

# Brand teal gradient endpoints
TOP_COLOR = (13, 110, 102)      # #0d6e66
BOTTOM_COLOR = (10, 155, 142)   # #0a9b8e
DARK_OVERLAY = (8, 80, 74)      # darker teal for badge fill

WHITE = (255, 255, 255)
SOFT_WHITE = (255, 255, 255, 38)   # for the soft center decoration


# --- Font helpers ----------------------------------------------------------
def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Best-effort font load; falls back through several OS paths."""
    candidates = []
    if bold:
        candidates += [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\seguisb.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/Library/Fonts/Arial Bold.ttf",
        ]
    candidates += [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


# --- Drawing helpers -------------------------------------------------------
def _vertical_gradient(size: tuple[int, int],
                        top: tuple[int, int, int],
                        bottom: tuple[int, int, int]) -> Image.Image:
    """Return an RGB image with a smooth top->bottom gradient."""
    w, h = size
    base = Image.new("RGB", size, top)
    pixels = base.load()
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            pixels[x, y] = (r, g, b)
    return base


def _text_size(draw: ImageDraw.ImageDraw, text: str,
               font: ImageFont.ImageFont) -> tuple[int, int]:
    """Get pixel width/height of `text` rendered with `font`."""
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        return draw.textsize(text, font=font)


def _draw_center_decoration(img: Image.Image) -> None:
    """Soft white circular halo behind the center decoration."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    cx, cy = WIDTH // 2, HEIGHT // 2 + 30
    r = 200
    # Two concentric soft rings
    od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 22))
    od.ellipse([cx - r + 30, cy - r + 30, cx + r - 30, cy + r - 30],
               fill=(255, 255, 255, 14))
    img.alpha_composite(overlay)

    # Flip-arrow glyph in the center (large)
    d = ImageDraw.Draw(img)
    glyph_font = _load_font(220, bold=True)
    glyph = "↻"  # clockwise open circle arrow — renders broadly
    gw, gh = _text_size(d, glyph, glyph_font)
    d.text(((WIDTH - gw) // 2, cy - gh // 2 - 10),
           glyph, font=glyph_font, fill=(255, 255, 255, 235))


def _rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int,
                   fill) -> None:
    try:
        draw.rounded_rectangle(xy, radius=radius, fill=fill)
    except AttributeError:
        # Older Pillow fallback: plain rect
        draw.rectangle(xy, fill=fill)


def _draw_badge(img: Image.Image) -> None:
    """Bottom-right pill: 'Made with FlipIt'."""
    d = ImageDraw.Draw(img)
    badge_font = _load_font(28, bold=True)
    text = "Made with FlipIt"
    tw, th = _text_size(d, text, badge_font)
    pad_x, pad_y = 26, 14
    bw, bh = tw + pad_x * 2, th + pad_y * 2
    margin = 36
    x1 = WIDTH - margin - bw
    y1 = HEIGHT - margin - bh
    x2 = x1 + bw
    y2 = y1 + bh

    # Pill background — darker teal with subtle alpha
    pill = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    _rounded_rect(pd, (x1, y1, x2, y2), radius=bh // 2,
                  fill=(*DARK_OVERLAY, 220))
    img.alpha_composite(pill)

    d.text((x1 + pad_x, y1 + pad_y - 2), text,
           font=badge_font, fill=WHITE)


def build() -> Image.Image:
    bg = _vertical_gradient((WIDTH, HEIGHT), TOP_COLOR, BOTTOM_COLOR)
    img = bg.convert("RGBA")

    _draw_center_decoration(img)

    d = ImageDraw.Draw(img)

    # Wordmark — top centered
    wordmark_font = _load_font(140, bold=True)
    wordmark = "FlipIt"
    ww, wh = _text_size(d, wordmark, wordmark_font)
    d.text(((WIDTH - ww) // 2, 70), wordmark,
           font=wordmark_font, fill=WHITE)

    # Tagline — middle
    tag_font = _load_font(52, bold=True)
    tag = "See It. Flip It. Post It. Go Viral."
    tw, th = _text_size(d, tag, tag_font)
    d.text(((WIDTH - tw) // 2, HEIGHT - 200), tag,
           font=tag_font, fill=WHITE)

    _draw_badge(img)

    return img.convert("RGB")


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "flippost-site" / "og-share.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    img = build()
    img.save(out_path, format="PNG", optimize=True)

    size_kb = out_path.stat().st_size / 1024
    print(f"Wrote {out_path} ({img.size[0]}x{img.size[1]}, {size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
