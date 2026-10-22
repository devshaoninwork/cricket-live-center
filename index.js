const API_BASE = "https://api.cricapi.com/v1";
const ALLOWED_ORIGIN = "*";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function normalizedIso(value) {
  if (!value) return "";
  return /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
}

function shortScore(score) {
  if (!Array.isArray(score) || !score.length) return "";
  return score.map(s => `${s.r ?? 0}/${s.w ?? 0}${s.o !== undefined ? ` (${s.o} ov)` : ""}`).join(" · ");
}

function normalizeMatch(m) {
  const teams = Array.isArray(m.teams) ? m.teams : [];
  return {
    id: m.id,
    title: m.name || teams.join(" vs "),
    series: (m.name || "").includes(",") ? m.name.split(",").slice(1).join(",").trim() : "",
    format: (m.matchType || "unknown").toUpperCase(),
    status: m.status || (m.matchEnded ? "Match ended" : "Status unavailable"),
    startTime: normalizedIso(m.dateTimeGMT || m.date),
    venue: m.venue || "",
    scoreSummary: shortScore(m.score) || m.status || "Score unavailable",
    isLive: Boolean(m.matchStarted && !m.matchEnded),
    teams,
    teamInfo: Array.isArray(m.teamInfo) ? m.teamInfo : [],
    rawSeriesId: m.series_id || "",
    matchStarted: Boolean(m.matchStarted),
    matchEnded: Boolean(m.matchEnded),
    bbbEnabled: Boolean(m.bbbEnabled),
    hasSquad: Boolean(m.hasSquad)
  };
}

function normalizeDetail(m) {
  const teams = Array.isArray(m.teams) ? m.teams : [];
  const score = Array.isArray(m.score) ? m.score : [];
  const teamInfo = Array.isArray(m.teamInfo) ? m.teamInfo : [];
  const grouped = new Map(teams.map(t => [t, []]));

  score.forEach((inn, index) => {
    const label = String(inn.inning || "").toLowerCase();
    let teamName = "";
    for (const t of teams) {
      if (label.includes(String(t).toLowerCase())) teamName = t;
    }
    if (!teamName) teamName = teams[index] || "Innings";
    if (!grouped.has(teamName)) grouped.set(teamName, []);
    grouped.get(teamName).push({
      runs: inn.r ?? 0,
      wickets: inn.w ?? 0,
      overs: inn.o ?? "",
      runRate: null
    });
  });

  return {
    match: {
      id: m.id,
      title: m.name || teams.join(" vs "),
      series: (m.name || "").includes(",") ? m.name.split(",").slice(1).join(",").trim() : "",
      format: (m.matchType || "unknown").toUpperCase(),
      status: m.status || "",
      venue: m.venue || "",
      toss: m.tossWinner ? `${m.tossWinner} won the toss${m.tossChoice ? ` and chose to ${m.tossChoice}` : ""}` : "",
      result: m.matchWinner ? `${m.matchWinner} won` : (m.matchEnded ? m.status || "" : ""),
      teams: teams.map(name => ({
        name,
        innings: grouped.get(name) || [],
        logo: (teamInfo.find(t => t.name === name) || {}).img || ""
      })),
      batters: [],
      bowlers: [],
      recentOvers: "",
      playingXI: [],
      updates: [],
      matchStarted: Boolean(m.matchStarted),
      matchEnded: Boolean(m.matchEnded),
      bbbEnabled: Boolean(m.bbbEnabled),
      hasSquad: Boolean(m.hasSquad),
      seriesId: m.series_id || ""
    },
    commentary: [],
    commentaryAvailable: false
  };
}

async function providerJson(path, cacheKey, env, ctx, ttlSeconds = 45) {
  if (!env.CRICKETDATA_API_KEY) {
    throw new Error("Server setup is incomplete: CRICKETDATA_API_KEY secret is missing.");
  }

  const cache = caches.default;
  const cacheRequest = new Request(
    `https://worker-cache.invalid/__cricket_cache/${encodeURIComponent(cacheKey)}`,
    { method: "GET" }
  );

  try {
    const cached = await cache.match(cacheRequest);
    if (cached) return await cached.json();
  } catch (_) {}

  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("apikey", env.CRICKETDATA_API_KEY);
  url.searchParams.set("offset", "0");

  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`CricketData returned HTTP ${response.status}. Check your account quota and API plan.`);
  }

  const payload = await response.json();
  if (payload.status && payload.status !== "success") {
    throw new Error(payload.reason || "CricketData did not return a successful response.");
  }

  try {
    const cachedResponse = new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSeconds}` }
    });
    ctx.waitUntil(cache.put(cacheRequest, cachedResponse));
  } catch (_) {}

  return payload;
}

function matchesFilter(match, params) {
  const team = (params.get("team") || "").trim().toLowerCase();
  const date = (params.get("date") || "").trim();
  const series = (params.get("series") || "").trim().toLowerCase();
  const format = (params.get("format") || "").trim().toLowerCase();
  const teamNames = (match.teams || []).join(" ").toLowerCase();
  const title = String(match.name || "").toLowerCase();
  const teamTokens = team.split(/\s+vs\.?\s+|\s+v\s+/).map(s => s.trim()).filter(Boolean);
  const teamOk = !team || (teamTokens.length > 1
    ? teamTokens.every(token => teamNames.includes(token))
    : `${teamNames} ${title}`.includes(team));
  const dateOk = !date || String(match.date || "").slice(0, 10) === date;
  const seriesOk = !series || title.includes(series) || String(match.series_id || "").toLowerCase() === series;
  const formatOk = !format || String(match.matchType || "").toLowerCase() === format;
  return teamOk && dateOk && seriesOk && formatOk;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": ALLOWED_ORIGIN,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400"
        }
      });
    }
    if (request.method !== "GET") return json({ error: "Only GET requests are supported." }, 405);

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, provider: "CricketData", keyConfigured: Boolean(env.CRICKETDATA_API_KEY) });
      }

      if (url.pathname === "/matches") {
        const payload = await providerJson("currentMatches", "currentMatches-offset-0", env, ctx, 45);
        const data = Array.isArray(payload.data) ? payload.data : [];
        const matches = data.filter(m => matchesFilter(m, url.searchParams)).map(normalizeMatch);
        return json({
          matches,
          source: "CricketData currentMatches",
          totalReturned: matches.length,
          coverageNote: "The current-matches feed may not include every future or historical fixture."
        }, 200, { "cache-control": "public, max-age=15" });
      }

      const commentaryPath = url.pathname.match(/^\/matches\/([0-9a-f-]{36})\/commentary$/i);
      if (commentaryPath) {
        const id = commentaryPath[1];
        const payload = await providerJson(`match_info?id=${encodeURIComponent(id)}`, `match_info-${id}`, env, ctx, 45);
        const m = payload.data || {};
        return json({
          commentary: [],
          available: Boolean(m.bbbEnabled),
          message: m.bbbEnabled
            ? "This match is flagged as ball-by-ball enabled, but the commentary endpoint still needs to be verified against your plan."
            : "CricketData marks ball-by-ball as unavailable for this match."
        });
      }

      const matchPath = url.pathname.match(/^\/matches\/([0-9a-f-]{36})$/i);
      if (matchPath) {
        const id = matchPath[1];
        const payload = await providerJson(`match_info?id=${encodeURIComponent(id)}`, `match_info-${id}`, env, ctx, 45);
        const data = payload.data;
        if (!data || (data.id && data.id !== id)) return json({ error: "Match not found in provider response." }, 404);
        return json(normalizeDetail(data), 200, { "cache-control": "public, max-age=15" });
      }

      return json({
        error: "Not found.",
        routes: ["/health", "/matches?team=&date=&series=&format=", "/matches/{match-id}", "/matches/{match-id}/commentary"]
      }, 404);
    } catch (error) {
      return json({ error: error && error.message ? error.message : "Unexpected server error." }, 502);
    }
  }
};
