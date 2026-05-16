# FlipIt — Chrome Web Store Listing

Copy-paste-ready content for every field in the developer console submission form.

---

## Extension name (45 char max)

```
FlipIt — Rate & Flip Posts
```

(26 chars. Already matches `manifest.json` → `name`.)

---

## Short description (132 char max)

```
Rate any Instagram/TikTok/YouTube post for viral potential and flip it into your own viral script — one click, no copy-paste.
```

(125 chars. Already matches `manifest.json` → `description`.)

---

## Detailed description (up to 16,000 chars)

Paste this entire block into the "Detailed description" field.

```
FlipIt turns any social media post into instant intelligence: a 6-dimension viral-potential score and a new, original viral script you can post yourself — all in one click.

—— WHAT IT DOES ——

Open any Instagram reel, TikTok video, YouTube video, LinkedIn post, Threads post, Twitter/X post, Facebook post, or Facebook reel. A small floating "🎯 Rate with FlipIt" button appears in the bottom-right corner. Click it once.

A new tab opens to FlipIt with the post URL pre-filled. FlipIt automatically:

  1. Extracts the post (caption, transcript, key visuals)
  2. Scores it on 6 dimensions — Hook, Pacing, Emotional Pull, Curiosity Gap, Replay Value, Sharability
  3. Generates a brand-new viral script using the same hook structure, rewritten for YOUR niche
  4. Optionally generates AI image / video prompts you can drop straight into Sora, Veo, Midjourney, or Runway

No copy-pasting URLs. No leaving the post. No friction.

—— WHO IT'S FOR ——

  • Content creators studying what makes viral posts work
  • Marketers reverse-engineering competitor angles
  • Agencies scaling content production across niches
  • UGC creators looking for proven hook formulas
  • Anyone who's ever thought "I wish I could remix that post for my own audience"

—— FEATURES ——

  • One-click rating on 8 platforms: Instagram, TikTok, YouTube (long-form + Shorts), LinkedIn, Threads, Twitter/X, Facebook
  • 6-dimension viral potential score, calibrated to short-form social
  • Auto-flip: brand new viral script in your niche, written in your voice
  • Smart routing: the button only appears on actual post pages (not the home feed), so it never gets in your way
  • Single-Page-App aware: works on Instagram and TikTok's client-side navigation without reloads
  • Dismissable: a one-tap "×" hides the button for the session if you just want to scroll
  • Toolbar popup fallback: click the FlipIt icon to flip whatever tab you're on, even on sites where the floating button isn't injected

—— PRIVACY (THIS PART MATTERS) ——

FlipIt is built to be paranoid-friendly:

  • The extension does NOT read the contents of pages you visit
  • The extension does NOT scrape post text, comments, DMs, or messages
  • The extension has NO background worker — it can't run when you're not on a supported site
  • The extension does NOT use cookies, analytics, ads, or fingerprinting
  • The ONLY data the extension touches is the URL of the tab you're on, and ONLY when you click the FlipIt button
  • That URL is passed to flipit.earnwith-ai.com in a new tab — exactly as if you'd copy-pasted it yourself

Full privacy policy: https://flipit.earnwith-ai.com/privacy.html

—— HOW TO USE ——

  1. Pin the FlipIt icon to your toolbar after installing
  2. Open any reel, video, or post on a supported platform
  3. Click the floating "🎯 Rate with FlipIt" button (bottom-right of the page) — OR click the FlipIt toolbar icon → "Rate / Flip Current Post"
  4. A new tab opens with your viral score and a brand-new script ready to use

—— FREE TO USE ——

The Chrome extension is free. FlipIt itself is free for a generous number of flips per day; paid plans unlock higher daily limits and the trending feed.

—— SUPPORT ——

Open an issue: https://github.com/fadiagulec/flipit
Web app: https://flipit.earnwith-ai.com
```

---

## Category

**Recommendation: `Productivity`**

Reasoning: FlipIt's pitch is "save the copy-paste step." Productivity ranks higher for creator/marketer search terms than "Social & Communication," which is dominated by chat-style tools. Secondary fit would be "Social & Communication" if Productivity rejects.

---

## Language

`English (United States)`

---

## Suggested search terms / keywords (5-10)

Use these in the listing copy where natural; the store ranks based on description content rather than a dedicated keywords field.

```
viral script generator
instagram script
tiktok script
content creator tools
viral post rater
hook generator
reel script
script writer extension
ai content tool
ugc tools
```

---

## Single Purpose statement

Chrome requires you describe the one purpose your extension serves. Paste this into the "Single purpose" field on the **Privacy practices** tab.

```
FlipIt has a single purpose: when the user clicks its toolbar icon or the floating button it injects on supported social-media post pages, it opens a new tab to the FlipIt web app with the current page's URL pre-filled, so the user can rate that post's viral potential and generate a remixed script. The extension performs no other function — it does not read page content, communicate with servers, run background tasks, or modify the host page beyond injecting a single dismissable button.
```

---

## Permission justifications

Paste each block into the matching field on the **Privacy practices** → "Permissions justification" form.

### `activeTab`

```
We use activeTab so that when the user clicks the FlipIt toolbar icon (the popup's "Rate / Flip Current Post" button), we can read the URL of the tab they are currently on and pass that URL as a query parameter to the FlipIt web app, which opens in a new tab. This is the only purpose. We do not read the page's contents, DOM, cookies, or any other data — only the top-level URL, and only at the moment the user explicitly clicks our button. activeTab is the minimum privilege required to do this; we deliberately did not request "tabs" or "<all_urls>" access.
```

### Host permissions (instagram.com, tiktok.com, youtube.com, linkedin.com, threads.net, facebook.com, twitter.com, x.com)

```
We declare host permissions for the 8 supported social-media platforms so that our content script can inject a single floating "Rate with FlipIt" button onto post pages on those sites. The content script does not read, scrape, or transmit any page content; it only appends one button element to the DOM and listens for the user clicking it. We explicitly scope the matches list to each platform's domain rather than using broad patterns like "<all_urls>" because the extension has no use for any other site. Each domain corresponds to a platform whose post URLs the FlipIt web app supports as input.
```

### Why no `storage`, `tabs`, `scripting`, `background`, or remote code

```
FlipIt does not request the "storage" permission because the only piece of state it persists is a single per-session "hide button" flag, which we keep in the page's own sessionStorage — no chrome.storage access is needed. We do not request "tabs" because activeTab is sufficient. We do not request "scripting" because all injection happens via the static content_scripts declaration. We do not declare a background service worker because all logic runs inline in the content script and popup. We do not load or execute any remote code; all JavaScript shipped in the extension is in the bundle and is reviewable inside the .zip.
```

---

## Data usage disclosures (Chrome's privacy form)

For each "Does your extension collect or use…" checkbox:

| Category | Answer |
|---|---|
| Personally identifiable information | **No** |
| Health information | **No** |
| Financial and payment information | **No** |
| Authentication information | **No** |
| Personal communications | **No** |
| Location | **No** |
| Web history | **No** |
| User activity (clicks, mouse movement, scroll, keystrokes) | **No** |
| Website content (text, images, audio recordings, video recordings) | **No** |

### Certifications (all three checkboxes — tick all)

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Privacy policy URL

```
https://flipit.earnwith-ai.com/privacy.html
```

(Make sure `flippost-site/privacy.html` is deployed on Netlify before submitting — see SUBMISSION-GUIDE.md.)

---

## Homepage URL

```
https://flipit.earnwith-ai.com
```

---

## Support email

```
contact@earnwith-ai.com
```

---

## Mature content

`No` — does not contain mature content.

---

## Ads in extension

`No` — extension does not contain ads.
