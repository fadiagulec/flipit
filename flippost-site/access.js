/* FlipIt freemium access helper.
 * Exposes window.FlipItAccess. Plain script, no modules.
 * 7-day trial -> 3 flips/day forever -> $57 unlocks unlimited.
 */
(function () {
  'use strict';

  var KEY_FIRST_USE = 'flipit_first_use';
  var KEY_PRO = 'flipit_pro';
  var KEY_DAILY = 'flipit_daily_count';
  var TRIAL_DAYS = 7;
  var FREE_DAILY_LIMIT = 3;
  // Fair-use caps on Pro tier — protects Anthropic API margin against the
  // <1% of users who would hammer "unlimited" (100+ flips/day for weeks).
  // Average user does ~5/day; 50/day is 10x that. 99% never hit either cap.
  var PRO_DAILY_LIMIT = 50;
  var PRO_MONTHLY_LIMIT = 1000;
  var KEY_PRO_DAILY = 'flipit_pro_daily';
  var KEY_PRO_MONTHLY = 'flipit_pro_monthly';
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  function todayLocalISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function readDaily() {
    var raw = safeGet(KEY_DAILY);
    if (!raw) return { date: todayLocalISO(), count: 0 };
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.date !== todayLocalISO()) {
        return { date: todayLocalISO(), count: 0 };
      }
      return { date: parsed.date, count: Number(parsed.count) || 0 };
    } catch (e) {
      return { date: todayLocalISO(), count: 0 };
    }
  }

  function writeDaily(obj) {
    safeSet(KEY_DAILY, JSON.stringify(obj));
  }

  function daysSince(isoString) {
    if (!isoString) return 0;
    var t = Date.parse(isoString);
    if (isNaN(t)) return 0;
    return Math.floor((Date.now() - t) / MS_PER_DAY);
  }

  // Returns the stored Pro token if it's a well-formed, non-expired HMAC
  // token. Aggressively clears legacy/invalid values (e.g. 'yes' from the
  // pre-Stripe-verification flow) so they can't unlock Pro for free.
  function getProToken() {
    var raw = safeGet(KEY_PRO);
    if (!raw) return null;
    if (!/^flpt\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
      safeRemove(KEY_PRO);
      return null;
    }
    try {
      var parts = raw.slice('flpt.'.length).split('.');
      var b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      // Pad to multiple of 4 for atob
      while (b64.length % 4) b64 += '=';
      var json = atob(b64);
      var payload = JSON.parse(json);
      if (!payload || typeof payload.exp !== 'number') return null;
      if (Math.floor(Date.now() / 1000) >= payload.exp) {
        safeRemove(KEY_PRO);
        return null;
      }
      return raw;
    } catch (e) {
      safeRemove(KEY_PRO);
      return null;
    }
  }

  function readProUsage() {
    var today = todayLocalISO();
    var month = today.slice(0, 7);
    var dailyRaw = safeGet(KEY_PRO_DAILY);
    var monthlyRaw = safeGet(KEY_PRO_MONTHLY);
    var dailyObj = { date: today, count: 0 };
    var monthlyObj = { month: month, count: 0 };
    try {
      var pd = JSON.parse(dailyRaw || '{}');
      if (pd && pd.date === today) dailyObj.count = Number(pd.count) || 0;
    } catch (e) { /* ignore */ }
    try {
      var pm = JSON.parse(monthlyRaw || '{}');
      if (pm && pm.month === month) monthlyObj.count = Number(pm.count) || 0;
    } catch (e) { /* ignore */ }
    return { daily: dailyObj, monthly: monthlyObj };
  }

  function writeProUsage(obj) {
    safeSet(KEY_PRO_DAILY, JSON.stringify(obj.daily));
    safeSet(KEY_PRO_MONTHLY, JSON.stringify(obj.monthly));
  }

  function getState() {
    var proToken = getProToken();
    var isPro = !!proToken;
    var firstUse = safeGet(KEY_FIRST_USE);
    var elapsed = firstUse ? daysSince(firstUse) : 0;
    var isWithinTrial = !isPro && (!firstUse || elapsed < TRIAL_DAYS);
    var daysRemaining = Math.max(0, TRIAL_DAYS - elapsed);
    var daily = readDaily();
    var proUsage = readProUsage();

    var tier, dailyLimit, canFlip, proCapHit;
    if (isPro) {
      tier = 'pro';
      dailyLimit = PRO_DAILY_LIMIT;
      var hitDaily = proUsage.daily.count >= PRO_DAILY_LIMIT;
      var hitMonthly = proUsage.monthly.count >= PRO_MONTHLY_LIMIT;
      proCapHit = hitDaily ? 'daily' : (hitMonthly ? 'monthly' : null);
      canFlip = !proCapHit;
    } else if (isWithinTrial) {
      tier = 'trial';
      dailyLimit = Infinity;
      canFlip = true;
    } else {
      tier = 'free';
      dailyLimit = FREE_DAILY_LIMIT;
      canFlip = daily.count < FREE_DAILY_LIMIT;
    }

    return {
      isPro: isPro,
      proToken: proToken,
      isWithinTrial: isWithinTrial,
      daysSinceFirstUse: firstUse ? elapsed : 0,
      daysRemainingInTrial: daysRemaining,
      dailyCount: daily.count,
      dailyLimit: dailyLimit,
      canFlip: canFlip,
      tier: tier,
      proDailyCount: proUsage.daily.count,
      proDailyLimit: PRO_DAILY_LIMIT,
      proMonthlyCount: proUsage.monthly.count,
      proMonthlyLimit: PRO_MONTHLY_LIMIT,
      proCapHit: proCapHit || null
    };
  }

  function recordFlip() {
    var state = getState();
    if (state.tier === 'free') {
      var daily = readDaily();
      writeDaily({ date: todayLocalISO(), count: daily.count + 1 });
      return;
    }
    if (state.tier === 'pro') {
      var pu = readProUsage();
      pu.daily.count += 1;
      pu.monthly.count += 1;
      writeProUsage(pu);
    }
    // 'trial' tier: don't track usage during trial
  }

  function markFirstUseIfMissing() {
    if (!safeGet(KEY_FIRST_USE)) {
      safeSet(KEY_FIRST_USE, new Date().toISOString());
    }
  }

  // setPro is intentionally NOT exported anymore. Pro access can only be
  // granted by /thank-you.html → POST /.netlify/functions/issue-pro-token,
  // which requires a real Stripe-verified session_id. Storing the returned
  // HMAC token directly in localStorage is what activates Pro.

  function clearPro() {
    safeRemove(KEY_PRO);
  }

  function reset() {
    safeRemove(KEY_FIRST_USE);
    safeRemove(KEY_PRO);
    safeRemove(KEY_DAILY);
  }

  window.FlipItAccess = {
    getState: getState,
    recordFlip: recordFlip,
    markFirstUseIfMissing: markFirstUseIfMissing,
    clearPro: clearPro,
    reset: reset
  };

  // Monkey-patch window.fetch so every request to /.netlify/functions/*
  // automatically carries the user's Pro token (if any). This means each
  // gated function can re-verify the HMAC server-side instead of trusting
  // localStorage alone — closing the bug where anyone could set
  // localStorage.flipit_pro and unlock unlimited.
  if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__flipitFetchPatched) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var urlStr = (typeof input === 'string') ? input : (input && input.url) || '';
        var isGatedFn = urlStr.indexOf('/.netlify/functions/') !== -1
          && urlStr.indexOf('/issue-pro-token') === -1; // don't loop the issuer
        if (isGatedFn) {
          var token = getProToken();
          if (token) {
            init = init || {};
            // Headers may be a Headers instance, plain object, or undefined.
            if (init.headers instanceof Headers) {
              init.headers.set('X-Flipit-Pro', token);
            } else if (init.headers && typeof init.headers === 'object') {
              init.headers = Object.assign({}, init.headers, { 'X-Flipit-Pro': token });
            } else {
              init.headers = { 'X-Flipit-Pro': token };
            }
          }
        }
      } catch (e) { /* fall through to normal fetch */ }
      return originalFetch(input, init);
    };
    window.__flipitFetchPatched = true;
  }

  // Debug-only — opt-in via ?debug=1. Was leaking tier/quota state on
  // every page load to anyone who opened DevTools.
  try {
    if (typeof window !== 'undefined' && window.location && /[?&]debug=1\b/.test(window.location.search)) {
      console.info('[FlipIt] access state:', window.FlipItAccess.getState());
    }
  } catch (e) { /* ignore */ }
})();
