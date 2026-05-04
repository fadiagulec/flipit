"""Build JS payloads to upload PNGs into Canva via JS DataTransfer injection.

Strategy:
- Stage 1: Init JS — create window.__cv = [] and find the file input.
- Stage 2: For each PNG, append {name, b64} to window.__cv via individual JS calls
           (sized to stay under any single-call limit).
- Stage 3: Final JS — build DataTransfer from window.__cv, set on input,
           dispatch change event.

We emit shell commands to run via the Claude in Chrome MCP javascript_tool.
"""

import base64
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent

INIT_JS = """
(()=>{window.__cv=[];const inp=Array.from(document.querySelectorAll('input[type=file]')).find(i=>!i.hasAttribute('webkitdirectory'));window.__cvInp=inp;return 'init '+(inp?'OK':'NO_INPUT');})()
""".strip()

PUSH_TEMPLATE = """
(()=>{window.__cv=window.__cv||[];window.__cv.push({n:`__NAME__`,b:`__B64__`});return 'pushed '+window.__cv.length;})()
""".strip()

DISPATCH_JS = """
(()=>{const dt=new DataTransfer();window.__cv.forEach(o=>{const bin=atob(o.b);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);dt.items.add(new File([u],o.n,{type:'image/png'}));});const inp=window.__cvInp||Array.from(document.querySelectorAll('input[type=file]')).find(i=>!i.hasAttribute('webkitdirectory'));if(!inp)return 'NO_INPUT';inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));return 'dispatched '+inp.files.length+' files';})()
""".strip()


def collect_files():
    files = []
    for d in sorted(ROOT.glob('day*')):
        if not d.is_dir():
            continue
        for png in sorted(d.glob('*.png')):
            with open(png, 'rb') as fh:
                b64 = base64.b64encode(fh.read()).decode()
            # Use a clean name for Canva
            files.append({
                'name': f'{d.name}_{png.name}',
                'b64': b64,
                'size': len(b64),
            })
    return files


def main():
    files = collect_files()
    print(f'collected {len(files)} files', file=sys.stderr)

    out_dir = ROOT / 'js_payloads'
    out_dir.mkdir(exist_ok=True)

    # Init
    (out_dir / '00_init.js').write_text(INIT_JS, encoding='utf-8')

    # One push per file
    for i, f in enumerate(files, start=1):
        js = PUSH_TEMPLATE.replace('__NAME__', f['name']).replace('__B64__', f['b64'])
        (out_dir / f'{i:02d}_push.js').write_text(js, encoding='utf-8')

    # Dispatch
    (out_dir / '99_dispatch.js').write_text(DISPATCH_JS, encoding='utf-8')

    print(f'wrote {len(files)+2} payloads to {out_dir}', file=sys.stderr)
    # Print sizes
    for p in sorted(out_dir.glob('*.js')):
        print(f'  {p.name}: {p.stat().st_size} bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
