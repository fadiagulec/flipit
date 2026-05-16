# FlipIt — Chrome Web Store Submission Guide

End-to-end walkthrough for getting FlipIt onto the Chrome Web Store. Allow ~45 minutes for the first submission (most of it is staring at screenshots).

---

## 0. Pre-flight (one-time, before you open the dev console)

- [ ] **Deploy `flippost-site/privacy.html` to Netlify.** Push and wait for the deploy to finish, then load https://flipit.earnwith-ai.com/privacy.html in a regular Chrome window. Confirm it loads with no 404. Chrome's automated review WILL hit this URL and reject if it 404s.
- [ ] **Confirm `flipit-extension-v1.0.0.zip` exists in the repo root** (created by the build step — see "Build the zip" below if you need to regenerate).
- [ ] **Decide on a support email.** Chrome requires a public support email on the listing. Use a forwarding alias if you don't want to publish your personal address. Update the `TODO` in `store-listing.md` → "Support email" before you start.
- [ ] **Take screenshots** (see "Screenshots" section below — you can't submit without at least 1).

---

## 1. Register a developer account ($5, one-time)

URL: **https://chrome.google.com/webstore/devconsole/register**

1. Sign in with the Google account you want to publish under. **Note:** the published listing will show this account's developer name — choose carefully. You can publish under a verified group/organization later, but the first registration is tied to this individual.
2. Pay the **$5 one-time registration fee**. Google Wallet handles this; takes ~30 seconds.
3. Once paid, the URL redirects to your developer dashboard at **https://chrome.google.com/webstore/devconsole/**.

---

## 2. Create the new item

From the developer dashboard:

1. Click **"New Item"** (top right, blue button).
2. Drop or browse to upload `flipit-extension-v1.0.0.zip` (the file at `C:\Users\serka\flipit\flipit-extension-v1.0.0.zip`).
3. After upload, Chrome unpacks the zip and creates a draft listing. You land on the **Store listing** tab.

---

## 3. Fill out the "Store listing" tab

You'll see fields in this order. Each one maps to a section in `store-listing.md`.

| Form field | Where to copy from |
|---|---|
| Item title | `store-listing.md` → "Extension name" |
| Summary (a.k.a. Short description) | `store-listing.md` → "Short description" |
| Description (Detailed description) | `store-listing.md` → "Detailed description" — paste the entire fenced block |
| Category | `Productivity` (per `store-listing.md` recommendation) |
| Language | English (United States) |
| Store icon (128×128) | Auto-populates from `icon-128.png` inside the zip — confirm it shows the FlipIt teal/pink tile |

### Screenshots (at least 1, up to 5)

Specs (one of):
- **1280×800 px** (preferred; renders sharper on the store)
- **640×400 px** (acceptable fallback)
- PNG or JPEG, file size under ~1 MB each

**Specific screenshots to capture** (in this order — the first one is the marketing money shot):

1. **The floating "🎯 Rate with FlipIt" button on an Instagram reel.** Open any public reel (try https://www.instagram.com/reel/ on a popular creator), wait for the button to appear in the bottom-right, and screenshot the full window. Crop/resize to 1280×800.
2. **The FlipIt rating card.** Click the button, let the flip finish, and screenshot the resulting scorecard (the 6-dimension panel + the rewritten script).
3. **The button on TikTok.** Same shot as #1 but on a TikTok video page — proves multi-platform support.
4. **The toolbar popup.** Click the FlipIt icon in the Chrome toolbar to open the popup; screenshot Chrome with the popup visible (you may need to bump the window to ~1280px wide and stretch the screenshot to fit).
5. **(Optional) The image-prompt output panel** — useful if you want to highlight the Sora / Veo / Midjourney integration.

Tip: use Chrome's built-in `DevTools → Cmd/Ctrl+Shift+P → "Capture full size screenshot"` for a clean shot, then resize in any image tool to 1280×800.

### Promotional images (optional but strongly recommended)

| Slot | Size | Required? | Notes |
|---|---|---|---|
| Small promo tile | **440×280 px** | Optional | Appears in category listings and search results — without this you get downranked. Use the FlipIt logo + "Rate & Flip Posts" tagline + the teal→pink gradient background. |
| Marquee promo tile | **1400×560 px** | Optional | Only shown if Google decides to feature you on the homepage. Lower priority — skip until v1.1. |

> TODO: verify on developer.chrome.com before submission that the marquee size is still 1400×560 — Google has tweaked this in the past.

---

## 4. Fill out the "Privacy practices" tab

This is the section that rejects the most extensions. Be thorough.

1. **Single purpose** — paste the block from `store-listing.md` → "Single Purpose statement".
2. **Permission justification → activeTab** — paste from `store-listing.md` → "Permission justifications → activeTab".
3. **Permission justification → host permissions** — paste from `store-listing.md` → "Permission justifications → Host permissions".
4. **Are you using remote code?** → **No**. (All JS is in the bundle.)
5. **Data usage** — answer all "Does the extension collect…" checkboxes per the table in `store-listing.md` → "Data usage disclosures". Every answer is **No**.
6. **Certifications** — tick all three boxes at the bottom (no selling user data, no unrelated use, no creditworthiness).
7. **Privacy policy URL** — paste `https://flipit.earnwith-ai.com/privacy.html`.

---

## 5. Fill out the "Distribution" tab

1. **Visibility**: `Public` (or `Unlisted` if you want to soft-launch with the direct link only).
2. **Regions**: `All regions` (default; uncheck if you have specific compliance reasons).
3. **Pricing**: Free.

---

## 6. Submit

1. Top right of the dashboard: **"Submit for review"**.
2. Confirm in the modal.
3. Status changes to **"Pending review"**.

### Expected review timeline

- **Typical:** 1–3 business days for an extension this simple (single purpose, no remote code, minimal permissions, clear privacy policy).
- **Worst case:** up to ~30 days if it gets flagged for manual review. Don't panic at 7 days.
- You'll get an email at the developer account's address when the status changes.

---

## 7. Common rejection reasons (and why FlipIt avoids them)

| Reason | How FlipIt is safe |
|---|---|
| **Vague single purpose** | The single-purpose statement is one sentence: "open the FlipIt web app with the current tab's URL." |
| **Overbroad host permissions** | We list 8 specific domains, not `<all_urls>`. |
| **Unjustified permissions** | We only request `activeTab` and the 8 host permissions, each with a paragraph of justification. |
| **Missing or broken privacy policy URL** | `flippost-site/privacy.html` is short, honest, and matches the actual extension behavior. **Deploy it before you submit.** |
| **Data practice mismatch** | The privacy form answers all "No" because the extension genuinely collects nothing. The privacy policy says the same thing. They match. |
| **Remote code** | We don't load any. All JS ships in the .zip. |
| **Misleading title / description** | The title and description match what the extension actually does. No "world's #1" claims, no spam keywords. |
| **Functionality not working out of the box** | After install + pin, the button appears on a real Instagram reel immediately. Test this in an incognito profile before submitting. |
| **Single-purpose violation (popup vs content script doing different things)** | Both the popup and content script do the same thing (open FlipIt with the current URL) — they are two entry points to one action. |

---

## 8. After approval

- Public URL: `https://chromewebstore.google.com/detail/<your-extension-id>` (the ID is assigned when you submit — visible in the developer console).
- Update the website's "Install the Chrome extension" link in `flippost-site/index.html` line 53 to point to the store URL instead of the GitHub folder.
- Bump `manifest.json` → `version` for every update (e.g. `1.0.1`); Chrome rejects re-uploads with the same version.

---

## Build the zip (if you need to regenerate it)

From the repo root:

```bash
cd C:/Users/serka/flipit/chrome-extension
zip -r ../flipit-extension-v1.0.0.zip . -x "*.md" -x "store-listing.md" -x "SUBMISSION-GUIDE.md"
```

Then verify:

```bash
unzip -l C:/Users/serka/flipit/flipit-extension-v1.0.0.zip
```

You should see exactly:
- `manifest.json`
- `content.js`
- `popup.html`
- `popup.js`
- `icon-16.png` / `icon-32.png` / `icon-48.png` / `icon-128.png`

The `README.md`, `store-listing.md`, and `SUBMISSION-GUIDE.md` should NOT be in the zip.
