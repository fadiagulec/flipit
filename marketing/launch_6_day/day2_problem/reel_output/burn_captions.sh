#!/usr/bin/env bash
# Burn timed hook captions into the Day 2 Reel.
# Source: 5.04s / 24fps / 796x1152 portrait Kling output.
#
# Beat plan (5-second compress):
#   0.0–0.7s   POV: it's 11 PM
#   0.7–1.4s   blank page
#   1.4–2.1s   again.
#   2.2–3.4s   not a discipline problem
#   3.4–4.5s   a starting-line problem
#   4.5–5.0s   FlipIt · link in bio

set -euo pipefail

cd "$(dirname "$0")"

INPUT="$HOME/Downloads/openart-4f727f6fcc77b5283b4556750d9c2cea-500e18d6-227d-42f7-ab51-78509291599e_1777622394221_94793417.mp4"
OUTPUT="day2_blank_page_captioned.mp4"

# Common style fragment
H="fontfile=ariblk.ttf:fontcolor=white:fontsize=64:borderw=4:bordercolor=black@0.85:shadowcolor=black@0.55:shadowx=2:shadowy=3:x=(w-text_w)/2:y=h*0.78"
A="fontfile=ariblk.ttf:fontcolor=#e8734a:fontsize=60:borderw=4:bordercolor=black@0.9:shadowcolor=black@0.55:shadowx=2:shadowy=3:x=(w-text_w)/2:y=h*0.78"
B="fontfile=ariblk.ttf:fontcolor=white:fontsize=52:borderw=4:bordercolor=black@0.85:shadowcolor=black@0.55:shadowx=2:shadowy=3:x=(w-text_w)/2:y=h*0.78"
BR="fontfile=impact.ttf:fontcolor=#c2185b:fontsize=44:borderw=3:bordercolor=white@0.95:x=(w-text_w)/2:y=h*0.92"

# Single-line filter chain (newlines break ffmpeg's filter parser on Windows)
F="drawtext=text='POV\\: it is 11 PM':${H}:enable='between(t,0,0.7)',drawtext=text='BLANK PAGE':${H}:enable='between(t,0.7,1.4)',drawtext=text='AGAIN.':${H}:enable='between(t,1.4,2.1)',drawtext=text='not a discipline problem':${B}:enable='between(t,2.2,3.4)',drawtext=text='a starting-line problem':${A}:enable='between(t,3.4,4.5)',drawtext=text='FlipIt  link in bio':${BR}:enable='between(t,4.5,5.05)'"

ffmpeg -y -i "$INPUT" -vf "$F" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy "$OUTPUT" 2>&1 | tail -6

echo
echo "Output: $(pwd)/$OUTPUT"
ls -lh "$OUTPUT" 2>/dev/null || echo "(output not produced)"
