// PlayHQ / play.cricket.com.au in-page collector — paste the WHOLE file into the
// browser's javascript tool while a play.cricket.com.au tab is open. Installs `window.__ov`.
//
//   __ov.start(plan)   kick off a run in the background (returns immediately)
//   __ov.status()      progress / errors — poll this
//   __ov.exportInfo()  gzip+base64 the store, returns {chunks, chars, records}
//   __ov.export(i)     chunk i of that export (built-in browser pane path)
//   __ov.download(n)   blob download of the store (Claude in Chrome path)
//   __ov.clear()       wipe the IndexedDB store
//
// Everything persists in IndexedDB (db "ov-playhq"), so a page reload does NOT lose
// collected data and a re-run with {resume:true} skips match-level work already done.
// Plan shape and the endpoint catalogue: see SKILL.md and references/endpoints.md.
(() => {
  const BASE = "https://grassrootsapiproxy.cricket.com.au";
  const ov = (window.__ov = window.__ov || {});
  ov.version = "2.0.0";
  ov.opts = Object.assign({ minGapMs: 120, timeoutMs: 20000, retries: 3, concurrency: 3 }, ov.opts);
  ov.stats = { calls: 0, ok: 0, retries: 0, failed: 0, bytes: 0 };
  ov.errors = [];
  ov._status = {
    phase: "idle",
    done: 0,
    total: 0,
    current: null,
    startedAt: null,
    finishedAt: null,
  };

  // Default "this is a junior / pathway grade" test — juniors stay isolated (never blended
  // into senior stats). Override per plan with {includeJuniors:true} or your own gradeFilter.
  ov.JUNIOR_RE =
    /\b(year\s?\d{1,2}|u\s?\d{1,2}s?\b|under\s?\d{1,2}s?\b|junior|primary|stage\s?\d|blast|woolworths|pathway|school)\b/i;

  // ---------------------------------------------------------------- IndexedDB store
  const DB = "ov-playhq";
  const STORE = "records";
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(
      (d) =>
        new Promise((res, rej) => {
          const t = d.transaction(STORE, mode);
          const s = t.objectStore(STORE);
          const out = fn(s);
          t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
          t.onerror = () => rej(t.error);
          t.onabort = () => rej(t.error);
        }),
    );
  }
  ov.put = (kind, id, data, meta) =>
    tx("readwrite", (s) =>
      s.put({
        key: `${kind}:${id}`,
        kind,
        id,
        meta: meta || {},
        fetchedAt: new Date().toISOString(),
        data,
      }),
    );
  ov.get = (key) =>
    db().then(
      (d) =>
        new Promise((res, rej) => {
          const r = d.transaction(STORE).objectStore(STORE).get(key);
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => rej(r.error);
        }),
    );
  ov.all = () =>
    db().then(
      (d) =>
        new Promise((res, rej) => {
          const r = d.transaction(STORE).objectStore(STORE).getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => rej(r.error);
        }),
    );
  ov.keys = async (prefix) =>
    (await ov.all()).map((r) => r.key).filter((k) => !prefix || k.startsWith(prefix));
  ov.count = async (prefix) => (await ov.keys(prefix)).length;
  ov.clear = () => tx("readwrite", (s) => s.clear()).then(() => "store cleared");

  // ---------------------------------------------------------------- API
  let lastCall = 0;
  let queue = Promise.resolve();
  function throttle() {
    // Serialise the *start* of calls so we never burst the proxy, whatever the concurrency.
    queue = queue.then(async () => {
      const wait = lastCall + ov.opts.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
    });
    return queue;
  }
  function url(path, params) {
    // Build with URL + searchParams (never string-concatenate query strings).
    const u = new URL(BASE + path);
    u.searchParams.set("jsconfig", "eccn:true"); // camelCase keys; omit and shapes change
    for (const [k, v] of Object.entries(params || {}))
      if (v != null) u.searchParams.set(k, String(v));
    return u.toString();
  }
  ov.api = async function (path, params) {
    let attempt = 0;
    for (;;) {
      await throttle();
      ov.stats.calls++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), ov.opts.timeoutMs);
      try {
        const r = await fetch(url(path, params), {
          headers: { accept: "application/json" },
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if (r.status === 204) {
          ov.stats.ok++;
          return null;
        }
        if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (!r.ok) {
          ov.stats.failed++;
          return { __error: `HTTP ${r.status}` };
        }
        const text = await r.text();
        ov.stats.bytes += text.length;
        ov.stats.ok++;
        return text ? JSON.parse(text) : null;
      } catch (e) {
        clearTimeout(timer);
        attempt++;
        if (attempt > ov.opts.retries) {
          ov.stats.failed++;
          ov.errors.push({ path, error: String(e && e.message), at: new Date().toISOString() });
          return { __error: String(e && e.message) };
        }
        ov.stats.retries++;
        await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
      }
    }
  };

  // Discovery endpoints (organisation-scoped)
  ov.seasons = (orgId) => ov.api(`/fixturesladders/organisations/${orgId}/seasons`);
  ov.teams = (orgId, seasonId) =>
    ov.api(`/fixturesladders/organisations/${orgId}/teams`, { seasonId });
  ov.grades = (orgId, seasonId) =>
    ov.api(`/fixturesladders/organisations/${orgId}/grades`, { seasonId });
  ov.competitionSeasons = (orgId, seasonId) =>
    ov.api(`/fixturesladders/organisations/${orgId}/competition-seasons`, {
      seasonId,
      responseModifier: "includeGrades",
    });
  // Grade-scoped
  ov.gradeMeta = (gradeId) => ov.api(`/fixturesladders/grades/${gradeId}`);
  ov.gradeTeams = (gradeId) => ov.api(`/fixturesladders/grades/${gradeId}/teams`);
  ov.rounds = (gradeId) => ov.api(`/scores/grades/${gradeId}/rounds`);
  ov.matches = (gradeId) => ov.api(`/scores/grades/${gradeId}/matches`);
  ov.ladder = (gradeId) => ov.api(`/fixturesladders/grades/${gradeId}/ladders`);
  ov.batting = (gradeId) => ov.api(`/participants/grades/${gradeId}/batting-statistics`);
  ov.bowling = (gradeId) => ov.api(`/participants/grades/${gradeId}/bowling-statistics`);
  ov.fielding = (gradeId) => ov.api(`/participants/grades/${gradeId}/fielding-statistics`);
  // Match-scoped
  ov.scorecard = (matchId, orgId) =>
    ov.api(`/scores/matches/${matchId}`, {
      responseModifier: "IncludeScorecard",
      organisationId: orgId,
    });
  ov.balls = (matchId) => ov.api(`/scores/matches/${matchId}/balls`);

  const GRADE_KINDS = {
    matches: ov.matches,
    ladder: ov.ladder,
    batting: ov.batting,
    bowling: ov.bowling,
    fielding: ov.fielding,
    rounds: ov.rounds,
    gradeTeams: ov.gradeTeams,
  };

  // ---------------------------------------------------------------- discovery
  // Returns one entry per grade the organisation is involved in for the chosen seasons.
  // Associations answer /grades directly; clubs answer [] there, so fall back to /teams and
  // collect each team's grade (this also records which of the org's teams sit in the grade).
  ov.discover = async function (orgId, o) {
    o = Object.assign({ seasons: "current", includeJuniors: false, gradeFilter: null }, o || {});
    const s = await ov.seasons(orgId);
    let seasons = (s && s.seasons) || [];
    if (o.seasons === "current") seasons = seasons.filter((x) => x.isCurrentSeason);
    else if (Array.isArray(o.seasons))
      seasons = seasons.filter((x) => o.seasons.includes(x.name) || o.seasons.includes(x.id));
    else if (o.seasons !== "all")
      throw new Error("seasons must be 'current', 'all' or an array of names/ids");
    const out = new Map();
    for (const season of seasons) {
      const g = await ov.grades(orgId, season.id);
      const list = (g && g.grades) || [];
      for (const gr of list)
        out.set(gr.id, {
          gradeId: gr.id,
          gradeName: gr.name,
          seasonId: season.id,
          seasonName: season.name,
          sourceOrgId: orgId,
          ownerOrgId: orgId,
          ownerOrgName: null,
          ownerOrgShort: null,
          teamIds: [],
          teamNames: [],
          viaTeams: false,
        });
      const t = await ov.teams(orgId, season.id);
      for (const team of (t && t.teams) || []) {
        const gr = team.grade;
        if (!gr) continue;
        const e = out.get(gr.id) || {
          gradeId: gr.id,
          gradeName: gr.name,
          seasonId: season.id,
          seasonName: season.name,
          sourceOrgId: orgId,
          ownerOrgId: gr.owningOrganisation && gr.owningOrganisation.id,
          ownerOrgName: gr.owningOrganisation && gr.owningOrganisation.name,
          ownerOrgShort: gr.owningOrganisation && gr.owningOrganisation.shortName,
          teamIds: [],
          teamNames: [],
          viaTeams: true,
        };
        e.teamIds.push(team.id);
        e.teamNames.push(team.name);
        out.set(gr.id, e);
      }
    }
    let grades = [...out.values()];
    if (!o.includeJuniors) grades = grades.filter((g) => !ov.JUNIOR_RE.test(g.gradeName));
    if (o.gradeFilter) grades = grades.filter((g) => o.gradeFilter.test(g.gradeName));
    ov.grades_ = grades;
    return grades;
  };

  // ---------------------------------------------------------------- run
  function latestStart(m) {
    const ds = (m.matchSchedule || [])
      .map((x) => x.startDateTime)
      .filter(Boolean)
      .sort();
    return ds.length ? ds[ds.length - 1] : null;
  }
  function selectMatches(list, mode, since) {
    if (mode === "none") return [];
    return list.filter((m) => {
      if (mode === "all") return true;
      if (m.status !== "COMPLETED" && m.statusId !== 3) return false;
      if (mode === "since") return since && (latestStart(m) || "") >= since;
      return true; // 'completed'
    });
  }
  async function pool(items, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.max(1, n) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    });
    await Promise.all(workers);
  }

  ov.run = async function (plan) {
    plan = Object.assign(
      {
        seasons: "current",
        includeJuniors: false,
        gradeFilter: null,
        kinds: ["matches", "ladder", "batting", "bowling", "fielding"],
        balls: "none",
        scorecards: "none",
        since: null,
        resume: true,
      },
      plan,
    );
    if (!plan.orgId) throw new Error("plan.orgId (organisation GUID) is required");
    if ((plan.balls === "since" || plan.scorecards === "since") && !plan.since)
      throw new Error("plan.since (ISO date) is required for 'since' modes");
    const st = ov._status;
    Object.assign(st, {
      phase: "discover",
      done: 0,
      total: 0,
      current: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      plan,
    });
    ov.errors = [];
    ov.stats = { calls: 0, ok: 0, retries: 0, failed: 0, bytes: 0 };
    const grades = await ov.discover(plan.orgId, plan);
    await ov.put("plan", st.startedAt, plan, { orgId: plan.orgId });
    for (const g of grades)
      await ov.put("grade", g.gradeId, g, { gradeId: g.gradeId, seasonId: g.seasonId });
    st.phase = "grades";
    st.total = grades.length * plan.kinds.length;
    const matchWork = [];
    await pool(grades, ov.opts.concurrency, async (g) => {
      for (const kind of plan.kinds) {
        const fn = GRADE_KINDS[kind];
        if (!fn) throw new Error(`unknown kind ${kind}`);
        st.current = `${kind} ${g.gradeName} (${g.seasonName})`;
        const data = await fn(g.gradeId);
        if (data && !data.__error)
          await ov.put(kind, g.gradeId, data, {
            gradeId: g.gradeId,
            seasonId: g.seasonId,
            gradeName: g.gradeName,
          });
        if (kind === "matches" && data && data.matches) {
          for (const m of selectMatches(data.matches, plan.balls, plan.since))
            matchWork.push({ kind: "balls", matchId: m.id, gradeId: g.gradeId });
          for (const m of selectMatches(data.matches, plan.scorecards, plan.since))
            matchWork.push({ kind: "scorecard", matchId: m.id, gradeId: g.gradeId });
        }
        st.done++;
      }
    });
    st.phase = "matches";
    st.total += matchWork.length;
    const have = new Set(plan.resume ? await ov.keys() : []);
    await pool(matchWork, ov.opts.concurrency, async (w) => {
      const key = `${w.kind}:${w.matchId}`;
      st.current = key;
      if (have.has(key)) {
        st.done++;
        return;
      }
      const data =
        w.kind === "balls" ? await ov.balls(w.matchId) : await ov.scorecard(w.matchId, plan.orgId);
      if (data && !data.__error) await ov.put(w.kind, w.matchId, data, { gradeId: w.gradeId });
      st.done++;
    });
    st.phase = "done";
    st.current = null;
    st.finishedAt = new Date().toISOString();
    return ov.status();
  };
  ov.start = function (plan) {
    ov._run = ov.run(plan).catch((e) => {
      ov._status.phase = "error";
      ov.errors.push({ path: "run", error: String(e && e.message) });
    });
    return "started — poll __ov.status()";
  };
  ov.status = function () {
    const s = ov._status;
    return {
      phase: s.phase,
      done: s.done,
      total: s.total,
      current: s.current,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      stats: ov.stats,
      errors: ov.errors.slice(-10),
      errorCount: ov.errors.length,
    };
  };

  // ---------------------------------------------------------------- export
  async function gzipB64(str) {
    const cs = new CompressionStream("gzip");
    const w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(str));
    w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  ov.dump = async function (o) {
    o = o || {};
    let records = await ov.all();
    if (o.kinds) records = records.filter((r) => o.kinds.includes(r.kind));
    return {
      version: ov.version,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      records,
    };
  };
  ov.exportInfo = async function (o) {
    o = Object.assign({ chunkChars: 800000 }, o || {});
    const d = await ov.dump(o);
    const json = JSON.stringify(d);
    ov._export = await gzipB64(json);
    ov._chunkChars = o.chunkChars;
    return {
      records: d.records.length,
      jsonChars: json.length,
      chars: ov._export.length,
      chunks: Math.ceil(ov._export.length / o.chunkChars),
      chunkChars: o.chunkChars,
    };
  };
  ov.export = function (i) {
    if (!ov._export) throw new Error("call exportInfo() first");
    const n = ov._chunkChars;
    return ov._export.slice(i * n, (i + 1) * n);
  };
  ov.download = async function (name) {
    const d = await ov.dump();
    const blob = new Blob([JSON.stringify(d)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name || `playhq_dump_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return `download triggered: ${a.download} (${d.records.length} records, ${blob.size} bytes)`;
  };
  return `__ov ${ov.version} installed on ${location.origin}`;
})();
