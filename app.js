(() => {
  'use strict';

  const config = window.CRICKET_CONFIG || { apiBaseUrl: '', refreshIntervalMs: 60000 };
  const $ = (id) => document.getElementById(id);
  const state = { matches: [], selectedId: null, detail: null, timer: null, busy: false };

  // Sample records are intentionally labelled DEMO. They are not current match information.
  const demoMatches = [{
    id: 'demo-sa-aus-test',
    title: 'South Africa vs Australia',
    series: 'Illustrative Test series · DEMO',
    format: 'Test',
    status: 'Demo fixture — not live',
    startTime: '2026-10-22T04:00:00Z',
    venue: 'Example Cricket Ground',
    scoreSummary: 'Sample score only',
    isLive: false,
    demo: true
  }];

  const demoDetail = {
    match: {
      id: 'demo-sa-aus-test',
      title: 'South Africa vs Australia',
      series: 'Illustrative Test series · DEMO',
      format: 'Test',
      status: 'DEMO DATA — NOT A LIVE MATCH FEED',
      venue: 'Example Cricket Ground',
      toss: 'Illustrative toss information',
      result: '',
      teams: [
        { name: 'Australia', innings: [{ runs: 245, wickets: 6, overs: '78.2', runRate: 3.12 }] },
        { name: 'South Africa', innings: [{ runs: 0, wickets: 0, overs: '0.0', runRate: 0 }] }
      ],
      batters: [
        { name: 'Sample Batter A', runs: 72, balls: 101, fours: 8, sixes: 1, strikeRate: 71.28 },
        { name: 'Sample Batter B', runs: 34, balls: 56, fours: 3, sixes: 0, strikeRate: 60.71 }
      ],
      bowlers: [
        { name: 'Sample Bowler A', overs: '18.2', maidens: 4, runs: 49, wickets: 2, economy: 2.67 },
        { name: 'Sample Bowler B', overs: '15.0', maidens: 2, runs: 53, wickets: 1, economy: 3.53 }
      ],
      recentOvers: 'Sample events only',
      playingXI: [],
      updates: []
    },
    commentary: [
      { id: 'demo-3', over: '78.2', event: 'DEMO', text: 'Sample commentary event. This is not a real ball or live update.', runs: 0, timestamp: '2026-10-22T08:00:00Z' },
      { id: 'demo-2', over: '78.1', event: 'DEMO', text: 'Illustrative ball-by-ball commentary for layout testing only.', runs: 0, timestamp: '2026-10-22T07:59:00Z' },
      { id: 'demo-1', over: '78.0', event: 'DEMO', text: 'Connect a licensed provider adapter to display actual commentary.', runs: 0, timestamp: '2026-10-22T07:58:00Z' }
    ]
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function setNotice(message) {
    const old = document.querySelector('.runtime-notice');
    if (old) old.remove();
    if (!message) return;
    const node = document.createElement('div');
    node.className = 'notice runtime-notice';
    node.textContent = message;
    $('detail-content').prepend(node);
  }

  function setLastUpdated(text) { $('last-updated').textContent = text; }

  async function requestJson(path) {
    if (!config.apiBaseUrl) throw new Error('No live API endpoint configured.');
    const base = config.apiBaseUrl.replace(/\/+$/, '');
    const response = await fetch(base + path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Data endpoint returned HTTP ${response.status}.`);
    return response.json();
  }

  function searchDemo(query, format) {
    return demoMatches.filter(m => {
      const textMatch = !query || m.title.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().split(/\s+vs\.?\s+/).every(part => m.title.toLowerCase().includes(part.trim()));
      return textMatch && (!format || m.format.toLowerCase() === format.toLowerCase());
    });
  }

  async function findMatches() {
    const query = $('team-query').value.trim();
    const date = $('match-date').value;
    const series = $('series').value;
    const format = $('format').value;
    $('match-list').innerHTML = '<div class="empty">Searching matches…</div>';
    try {
      let matches;
      if (config.apiBaseUrl) {
        const params = new URLSearchParams({ team: query, date, series, format });
        const data = await requestJson('/matches?' + params.toString());
        matches = Array.isArray(data.matches) ? data.matches : [];
        $('connection-label').textContent = 'API CONNECTED';
        setNotice('');
      } else {
        matches = searchDemo(query, format);
        $('connection-label').textContent = 'DEMO MODE';
        setNotice('Demo mode: these are illustrative records, not real fixtures or live scores. Deploy the included server-side Worker and set apiBaseUrl in config.js to enable CricketData.');
      }
      state.matches = matches;
      $('match-count').textContent = String(matches.length);
      renderMatches();
      if (matches.length) await selectMatch(matches[0].id);
      else {
        state.selectedId = null;
        $('detail-content').innerHTML = '<div class="empty">No matching records found. In demo mode, try “South Africa vs Australia”. In live mode, the current-matches feed may not include every historical or future fixture.</div>';
      }
    } catch (err) {
      $('match-list').innerHTML = '<div class="empty">Could not load matches.</div>';
      $('detail-content').innerHTML = `<div class="empty">${escapeHtml(err.message)}<br>Check your API endpoint and server logs.</div>`;
      $('connection-label').textContent = 'API ERROR';
    }
  }

  function renderMatches() {
    const list = $('match-list');
    if (!state.matches.length) {
      list.innerHTML = '<div class="empty">No matches found for these filters.</div>';
      return;
    }
    list.innerHTML = state.matches.map(m => `
      <button type="button" class="match-card ${m.id === state.selectedId ? 'selected' : ''}" data-match-id="${escapeHtml(m.id)}">
        <div class="series">${escapeHtml(m.series || 'Cricket match')} · ${escapeHtml(m.format || 'Format unknown')}</div>
        <div class="teams">${escapeHtml(m.title || `${m.team1 || ''} vs ${m.team2 || ''}`)}</div>
        <div class="score">${escapeHtml(m.scoreSummary || m.status || 'Score unavailable')}</div>
        <div class="state">${m.isLive ? '● LIVE' : escapeHtml(m.status || 'Fixture')}</div>
      </button>`).join('');
    list.querySelectorAll('[data-match-id]').forEach(button => {
      button.addEventListener('click', () => selectMatch(button.dataset.matchId));
    });
  }

  function renderRows(items, columns) {
    if (!Array.isArray(items) || !items.length) return '<tr><td colspan="8">No data supplied by provider.</td></tr>';
    return items.map(item => '<tr>' + columns.map(col => `<td>${escapeHtml(item[col] ?? '—')}</td>`).join('') + '</tr>').join('');
  }

  function renderDetail(payload) {
    const m = payload.match || payload;
    const teams = Array.isArray(m.teams) ? m.teams : [];
    const commentary = Array.isArray(payload.commentary) ? payload.commentary : [];
    const demo = state.matches.find(x => x.id === state.selectedId)?.demo || false;
    const scoreCards = teams.map(team => {
      const inns = Array.isArray(team.innings) ? team.innings : [];
      const score = inns.map(i => `${i.runs ?? 0}/${i.wickets ?? 0}`).join(' & ') || '—';
      const overs = inns.map(i => i.overs != null ? `${i.overs} ov` : '').filter(Boolean).join(' / ');
      return `<div class="team-score"><div class="name">${escapeHtml(team.name)}</div><div class="big-score">${escapeHtml(score)}</div><div class="overs">${escapeHtml(overs)}</div></div>`;
    }).join('');
    $('detail-content').innerHTML = `
      <div class="detail-title"><div><div class="eyebrow">${escapeHtml(m.series || 'MATCH DETAILS')}</div><h2>${escapeHtml(m.title || 'Cricket match')}</h2><div class="subtle">${escapeHtml(m.format || '')} · ${escapeHtml(m.venue || 'Venue not supplied')}</div></div><span class="live-pill">${m.isLive ? 'LIVE' : (demo ? 'DEMO' : 'MATCH')}</span></div>
      <p class="subtle">${escapeHtml(m.status || 'Status unavailable')}</p>
      <div class="score-grid">${scoreCards || '<div class="empty">Scorecard not supplied.</div>'}</div>
      <div class="subtle">${m.toss ? 'Toss: ' + escapeHtml(m.toss) : ''}${m.result ? ' · Result: ' + escapeHtml(m.result) : ''}</div>
      <div class="stats-grid">
        <section class="subpanel"><h3>BATTERS</h3><table class="data-table"><thead><tr><th>Player</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${renderRows(m.batters, ['name','runs','balls','fours','sixes','strikeRate'])}</tbody></table></section>
        <section class="subpanel"><h3>BOWLERS</h3><table class="data-table"><thead><tr><th>Player</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>${renderRows(m.bowlers, ['name','overs','maidens','runs','wickets','economy'])}</tbody></table></section>
      </div>
      <section class="subpanel" style="margin-top:16px"><h3>BALL-BY-BALL COMMENTARY</h3><div class="commentary">${commentary.length ? commentary.map(c => `<div class="commentary-item"><div class="over-tag">${escapeHtml(c.over ?? '—')}</div><div><p>${escapeHtml(c.text || c.commentary || 'Event details unavailable')}</p><small>${escapeHtml(c.event || 'BALL')} · ${escapeHtml(c.timestamp || '')}</small></div></div>`).join('') : '<div class="empty">No commentary supplied. Your provider must include a commentary feed for this feature.</div>'}</div></section>
      <div class="notice">${demo ? 'DEMO DATA ONLY — not a real fixture, score, lineup, or commentary feed.' : 'CricketData fields are normalized by the Worker. Commentary appears only when a supported feed is connected; verify licensing before redistribution.'}</div>`;
  }

  async function selectMatch(id) {
    state.selectedId = id;
    renderMatches();
    $('detail-content').innerHTML = '<div class="empty">Loading match details…</div>';
    try {
      let payload;
      if (config.apiBaseUrl) {
        payload = await requestJson('/matches/' + encodeURIComponent(id));
        try {
          const commentary = await requestJson('/matches/' + encodeURIComponent(id) + '/commentary');
          payload.commentary = commentary.commentary || [];
        } catch (_) {
          payload.commentary = payload.commentary || [];
        }
      } else {
        payload = JSON.parse(JSON.stringify(demoDetail));
      }
      state.detail = payload;
      renderDetail(payload);
      setLastUpdated((config.apiBaseUrl ? 'Last checked ' : 'Demo data · Not live') + (config.apiBaseUrl ? new Date().toLocaleTimeString() : ''));
    } catch (err) {
      $('detail-content').innerHTML = `<div class="empty">Unable to load this match: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function refreshSelected() {
    if (!state.selectedId) return findMatches();
    if (!config.apiBaseUrl) {
      setNotice('Demo mode does not update. Connect a real provider to receive live scores and commentary.');
      return;
    }
    await selectMatch(state.selectedId);
  }

  $('search-form').addEventListener('submit', event => { event.preventDefault(); findMatches(); });
  $('refresh-button').addEventListener('click', refreshSelected);
  $('match-date').value = new Date().toISOString().slice(0, 10);
  findMatches();
  if (config.apiBaseUrl) {
    const interval = Math.max(60000, Number(config.refreshIntervalMs) || 60000);
    state.timer = window.setInterval(refreshSelected, interval);
  }
})();
