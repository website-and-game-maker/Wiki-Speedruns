/* Run history + settings. Local first (works offline / logged out), mirrored to Firestore when signed in. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const MAX_LOCAL = 300;

  const S = (WS.store = {});

  S.settings = () => ({ theme: 'auto', showPar: false, hideRefs: true, ...U.store.get('settings', {}) });
  S.setSetting = (k, v) => U.store.set('settings', { ...S.settings(), [k]: v });

  S.localRuns = () => U.store.get('runs', []);

  S.getRun = (id) => S.localRuns().find((r) => r.id === id) || (S._cloud || []).find((r) => r.id === id) || null;

  S.saveRun = async (run) => {
    const runs = S.localRuns().filter((r) => r.id !== run.id);
    runs.unshift(run);
    U.store.set('runs', runs.slice(0, MAX_LOCAL));
    try {
      await WS.fb.saveRun(run);
    } catch (e) {
      console.warn('cloud save failed', e);
    }
  };

  /** Patch fields on a saved run (e.g. once the optimal distance is known). */
  S.updateRun = async (id, patch) => {
    const runs = S.localRuns();
    const i = runs.findIndex((r) => r.id === id);
    let run = i >= 0 ? runs[i] : (S._cloud || []).find((r) => r.id === id);
    if (!run) return;
    run = Object.assign(run, patch);
    if (i >= 0) U.store.set('runs', runs);
    try {
      await WS.fb.saveRun(run);
    } catch (e) { /* ignore */ }
  };

  S.deleteRun = async (id) => {
    U.store.set('runs', S.localRuns().filter((r) => r.id !== id));
    if (S._cloud) S._cloud = S._cloud.filter((r) => r.id !== id);
    try { await WS.fb.deleteRun(id); } catch (e) { /* ignore */ }
  };

  /** Local + cloud runs, de-duplicated, newest first. Uploads local-only runs after sign-in. */
  S.allRuns = async () => {
    const local = S.localRuns();
    let cloud = [];
    try {
      cloud = await WS.fb.myRuns();
      S._cloud = cloud;
    } catch (e) {
      console.warn('cloud runs', e);
    }
    const byId = new Map();
    for (const r of cloud) byId.set(r.id, r);
    const toUpload = [];
    for (const r of local) {
      if (!byId.has(r.id)) {
        byId.set(r.id, r);
        if (WS.fb.user) toUpload.push(r);
      }
    }
    toUpload.slice(0, 50).forEach((r) => WS.fb.saveRun(r).catch(() => {}));
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  };

  // Daily attempt tracking (local). The server enforces first-attempt-only for signed-in players.
  S.dailyAttempt = (dateKey) => U.store.get('daily.' + dateKey, null);
  S.setDailyAttempt = (dateKey, run) =>
    U.store.set('daily.' + dateKey, { runId: run.id, finished: run.finished, clicks: run.clicks, timeMs: run.timeMs });

  S.streak = () => {
    let n = 0;
    const d = new Date();
    // Today counts if played; otherwise start from yesterday so the streak isn't "broken" yet.
    if (!S.dailyAttempt(U.todayKey(d))) d.setUTCDate(d.getUTCDate() - 1);
    for (;;) {
      const a = S.dailyAttempt(U.todayKey(d));
      if (!a || !a.finished) break;
      n++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return n;
  };

  S.stats = (runs) => {
    const done = runs.filter((r) => r.finished);
    const withOpt = done.filter((r) => r.optimal);
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      played: runs.length,
      finished: done.length,
      avgClicks: avg(done.map((r) => r.clicks)),
      avgTime: avg(done.map((r) => r.timeMs)),
      bestTime: done.length ? Math.min(...done.map((r) => r.timeMs)) : null,
      perfect: withOpt.filter((r) => r.clicks <= r.optimal).length,
      efficiency: avg(withOpt.map((r) => Math.min(1, r.optimal / r.clicks))),
    };
  };
})(window);
