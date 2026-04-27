/* FlipIt freemium access helper.
 * Exposes window.FlipItAccess. Plain script, no modules.
 * 7-day trial -> 3 flips/day forever -> $37 unlocks unlimited.
 */
(function () {
  'use strict';

  var KEY_FIRST_USE = 'flipit_first_use';
  var KEY_PRO = 'flipit_pro';
  var KEY_DAILY = 'flipit_daily_count';
  var TRIAL_DAYS = 7;
  var FREE_DAILY_LIMIT = 3;
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

  function getState() {
    var isPro = safeGet(KEY_PRO) === 'yes';
    var firstUse = safeGet(KEY_FIRST_USE);
    var elapsed = firstUse ? daysSince(firstUse) : 0;
    var isWithinTrial = !isPro && (!firstUse || elapsed < TRIAL_DAYS);
    var daysRemaining = Math.max(0, TRIAL_DAYS - elapsed);
    var daily = readDaily();

    var tier, dailyLimit, canFlip;
    if (isPro) {
      tier = 'pro';
      dailyLimit = Infinity;
      canFlip = true;
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
      isWithinTrial: isWithinTrial,
      daysSinceFirstUse: firstUse ? elapsed : 0,
      daysRemainingInTrial: daysRemaining,
      dailyCount: daily.count,
      dailyLimit: dailyLimit,
      canFlip: canFlip,
      tier: tier
    };
  }

  function recordFlip() {
    var state = getState();
    if (state.tier !== 'free') return;
    var daily = readDaily();
    writeDaily({ date: todayLocalISO(), count: daily.count + 1 });
  }

  function markFirstUseIfMissing() {
    if (!safeGet(KEY_FIRST_USE)) {
      safeSet(KEY_FIRST_USE, new Date().toISOString());
    }
  }

  function setPro() {
    safeSet(KEY_PRO, 'yes');
  }

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
    setPro: setPro,
    clearPro: clearPro,
    reset: reset
  };

  try {
    console.info('[FlipIt] access state:', window.FlipItAccess.getState());
  } catch (e) {
    /* console may be unavailable in some embedded contexts */
  }
})();
