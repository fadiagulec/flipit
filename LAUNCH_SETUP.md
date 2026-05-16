# FlipIt — Launch Setup Checklist

After this PR is merged, you must do **3 manual steps** in dashboards before
the Pro paywall actually works. Until you do, anyone can still get Pro for
free by visiting `/thank-you.html` (the bug we just fixed in code is only
half-fixed without these steps).

## 1. Set 2 environment variables in Netlify

**Netlify dashboard → Site settings → Environment variables → Add a variable**

### `STRIPE_SECRET_KEY`
The secret key from Stripe → Developers → API keys.
- For testing: `sk_test_...`
- For production: `sk_live_...`

⚠️ **Never commit this. Never expose it in frontend code.** It only goes in
the Netlify environment variable UI.

### `FLIPIT_TOKEN_SECRET`
Any random 32+ character string. Used to sign Pro tokens with HMAC.
Generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Or any password-generator that produces a 64+ char string.

⚠️ If you ever change this, **all existing Pro tokens stop working** and
your customers will need to re-verify. Pick once, keep forever.

## 2. Update the Stripe Payment Link success URL

Right now your Stripe success URL is just `/thank-you.html`. It needs to
include the session ID so we can verify the payment was real.

**Stripe dashboard → Payment Links → click your FlipIt link → ⚙ → Edit**

Under **After payment** → **Show a confirmation page** → **Custom URL**:

```
https://flipit.earnwith-ai.com/thank-you.html?session_id={CHECKOUT_SESSION_ID}
```

The `{CHECKOUT_SESSION_ID}` is a literal Stripe template — Stripe replaces
it with the real session ID at redirect time. Don't edit it.

## 3. Trigger a Netlify rebuild

After setting the env vars, **redeploy** so the functions pick them up:
- Netlify → Deploys → Trigger deploy → Deploy site

## 4. (Optional) Test the full flow

1. Open https://flipit.earnwith-ai.com/thank-you.html (no `?session_id=`)
   → Should see "⚠️ Pro access could not be activated automatically"
   → No `flipit_pro` token set in localStorage
2. Make a real test purchase via Stripe (use test mode + 4242 card if in
   `STRIPE_SECRET_KEY=sk_test_...`)
   → After payment, you land on /thank-you.html?session_id=cs_test_...
   → "✅ Pro access activated" appears
   → `localStorage.flipit_pro` is now an HMAC token starting with `flpt.`

## 5. (Recommended within 1 week) Set up email gate for trial start

Right now anyone can get a fresh 7-day trial by clearing their localStorage
or opening incognito. To stop trial abuse, add an email-required step
before the first flip. (Not blocking launch, but recommended once you start
seeing organic traffic.)

---

## What this PR fixed

- ✅ **C1:** Anyone could visit /thank-you.html → instant Pro for free
- ✅ **C3:** Stripe payment session is now verified server-side
- ✅ **W4:** Download button is gated behind `gateOrPaywall()`
- ✅ **W5:** Pro fair-use cap (50/day, 1000/month) protects API margin

## Known follow-ups (not blocking launch)

- **C2:** Backend functions don't yet enforce daily quota for unauthenticated
  callers. Power users can bypass the 3/day free limit via DevTools. Will be
  closed in PR #10 with Netlify Blobs persistence.
- **W1:** Trial reset via incognito — fix with email gate (PR #11)
- **W2:** Pro buyers can copy their HMAC token + share. Acceptable leakage
  for $37 lifetime; revisit if abuse becomes visible.

## Required env vars summary

| Variable | Where | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | Already set | Claude API key |
| `STRIPE_SECRET_KEY` | **NEW — set this now** | Stripe secret key |
| `FLIPIT_TOKEN_SECRET` | **NEW — set this now** | Random 64-char HMAC secret |
| `INSTAGRAM_COOKIES_B64` | Optional, on Railway | For IG video downloads |
