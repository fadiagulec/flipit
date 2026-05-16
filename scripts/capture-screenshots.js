// Capture Chrome Web Store screenshots for FlipIt at 1280x800.
//
// Strategy:
//  - Try real flipit.earnwith-ai.com screenshots (no login wall) for shots 1 & 2.
//  - For shots 3 & 4, attempt a real post URL (Instagram / TikTok / YouTube);
//    if login walls appear, fall back to local mockup HTML pages that visually
//    represent the extension button overlaid on a generic short-form video UI.
//  - Always render the local rating-card mockup as shot 5.
//
// Output: submission-assets/screenshot-1.png … screenshot-5.png

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'submission-assets');
const MOCK = path.join(__dirname, 'mockups');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const CLIP = { x: 0, y: 0, width: 1280, height: 800 };

function fileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

async function snapMockup(browser, htmlPath, outName) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(fileUrl(htmlPath), { waitUntil: 'load', timeout: 30000 });
  // Mockups are static; small wait for fonts/gradients to settle.
  await page.waitForTimeout(500);
  const out = path.join(OUT, outName);
  await page.screenshot({ path: out, clip: CLIP });
  await ctx.close();
  console.log('  wrote', out);
}

async function snapLive(browser, url, outName, opts = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.log('  navigation failed:', e.message);
    await ctx.close();
    return false;
  }
  await page.waitForTimeout(opts.wait || 2500);
  // Detect obvious login walls.
  const bodyText = await page.evaluate(() => document.body && document.body.innerText.toLowerCase()).catch(() => '');
  if (opts.checkLogin && /(log in|sign up|to continue|create new account)/.test(bodyText) && bodyText.length < 3000) {
    console.log('  login wall detected, skipping live capture for', outName);
    await ctx.close();
    return false;
  }
  if (opts.injectFab) {
    // Inject a visual replica of the FlipIt button so the screenshot shows what
    // the extension renders. The real extension renders this identically.
    await page.evaluate(() => {
      const existing = document.getElementById('flipit-fab-button');
      if (existing) existing.remove();
      const btn = document.createElement('button');
      btn.id = 'flipit-fab-button';
      btn.type = 'button';
      btn.textContent = '\u{1F3AF} Rate with FlipIt';
      btn.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'right:24px',
        'z-index:2147483647',
        'background:linear-gradient(135deg,#ff7e5f,#feb47b)',
        'color:#fff',
        'border:none',
        'padding:12px 18px',
        'border-radius:999px',
        'font-size:14px',
        'font-weight:700',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'box-shadow:0 12px 28px rgba(0,0,0,0.45)',
        'display:inline-flex',
        'align-items:center',
        'gap:8px'
      ].join(';');
      const close = document.createElement('span');
      close.textContent = '×';
      close.style.cssText = 'margin-left:6px;opacity:0.85;font-weight:900;padding:0 4px;border-radius:50%';
      btn.appendChild(close);
      document.body.appendChild(btn);
    });
    await page.waitForTimeout(300);
  }
  const out = path.join(OUT, outName);
  await page.screenshot({ path: out, clip: CLIP });
  await ctx.close();
  console.log('  wrote', out);
  return true;
}

(async () => {
  console.log('Launching Chromium…');
  const browser = await chromium.launch({ headless: true });

  // Shot 1 — FlipIt homepage (real)
  console.log('Shot 1: FlipIt homepage');
  const s1 = await snapLive(browser, 'https://flipit.earnwith-ai.com/', 'screenshot-1.png', { wait: 2500 });
  if (!s1) {
    console.log('  homepage failed, using score-card mockup as fallback');
    await snapMockup(browser, path.join(MOCK, 'score-card.html'), 'screenshot-1.png');
  }

  // Shot 2 — Instagram-style mockup with FlipIt button (mockup; explicit non-Instagram branding)
  console.log('Shot 2: Reel-style page + FlipIt button mockup');
  await snapMockup(browser, path.join(MOCK, 'ig-reel.html'), 'screenshot-2.png');

  // Shot 3 — Short-form video-style mockup with FlipIt button
  console.log('Shot 3: Short-form video mockup + FlipIt button');
  await snapMockup(browser, path.join(MOCK, 'tiktok-style.html'), 'screenshot-3.png');

  // Shot 4 — FlipIt rating-card mockup (brand-matched, shows the score + flipped script)
  console.log('Shot 4: Rating card + flipped script mockup');
  await snapMockup(browser, path.join(MOCK, 'score-card.html'), 'screenshot-4.png');

  // Shot 5 — FlipIt homepage with a URL pre-filled (real, deep-link)
  console.log('Shot 5: FlipIt homepage with deep-link');
  const s5 = await snapLive(
    browser,
    'https://flipit.earnwith-ai.com/?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FCxYz123%2F',
    'screenshot-5.png',
    { wait: 3000 }
  );
  if (!s5) {
    console.log('  deep-link failed, using score-card mockup as fallback');
    await snapMockup(browser, path.join(MOCK, 'score-card.html'), 'screenshot-5.png');
  }

  await browser.close();
  console.log('Done. Files:');
  for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.png'))) {
    console.log('  ' + path.join(OUT, f));
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
