# FlipIt Chrome Extension

One-click "Rate with FlipIt" button on every Instagram post, TikTok video, YouTube video, LinkedIn post, Threads post, Twitter/X post, and Facebook post.

## Install (dev mode, for testing)

1. Open Chrome → `chrome://extensions/`
2. Toggle **Developer mode** (top right) ON
3. Click **Load unpacked**
4. Select this `chrome-extension/` folder
5. Pin the FlipIt icon to your toolbar

You'll now see a floating "🎯 Rate with FlipIt" button on every supported post. Clicking it opens FlipIt with the post URL pre-filled — extraction + flip auto-runs.

## Permissions

- `activeTab` — read the current page's URL only when the user clicks the toolbar icon
- Host permissions for the 8 supported platforms — required for the content script to inject the floating button on those sites

**The extension does NOT scrape post content, read messages, or send anything to a server. It only opens FlipIt with the current page URL.**

## Files

- `manifest.json` — extension config (Manifest V3)
- `content.js` — injects the floating "Rate" button on post pages
- `popup.html` + `popup.js` — toolbar icon click → "open current post in FlipIt"

## Publishing to the Chrome Web Store

Before publishing:
1. Add real icon PNGs (16, 48, 128px) — see https://developer.chrome.com/docs/extensions/reference/manifest/icons. The dev version uses Chrome's default icon.
2. Update `version` in `manifest.json`
3. Zip the folder, upload at https://chrome.google.com/webstore/devconsole/
4. One-time $5 developer registration fee
5. Review typically takes 1-3 days

## Mobile fallback (bookmarklet)

Instagram on iOS/Android doesn't support browser extensions. Use this bookmarklet instead — save it as a bookmark, tap it while viewing any post:

```javascript
javascript:(function(){window.open('https://flipit-app.netlify.app/?url='+encodeURIComponent(location.href),'_blank');})();
```
