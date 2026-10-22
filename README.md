# Cricket Live Center

A static GitHub Pages cricket interface plus a Cloudflare Worker adapter for CricketData. The Worker keeps the API key server-side and converts provider responses to the frontend's common data format.

## Important security step

The API key was included in a shared response while setting up this project. **Regenerate/revoke that key in your CricketData account before deployment.** Do not paste the replacement key into this repository, `config.js`, or the frontend.

## What this version connects

- `currentMatches` → match list, team/date/series/format filtering, status and available scores.
- `match_info` → match details, result, toss, venue and innings scores.
- Commentary endpoint → honestly reports availability; it does not invent commentary. Your sample match had `bbbEnabled: false`, so ball-by-ball data is not available for that match.
- The current-matches feed is not guaranteed to contain every future or historical match. Series schedules/search can be added separately after testing those endpoints and confirming quota.

## Deploy the Worker

1. Create/sign in to a Cloudflare account and open **Workers & Pages**.
2. Create a Worker named `cricket-live-center-api`.
3. Replace its starter code with `worker/index.js`, or deploy from the included Worker folder using Wrangler.
4. Add a secret named `CRICKETDATA_API_KEY` in the Worker settings. Paste your newly regenerated key there only.
5. Deploy the Worker and open `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/health`. It should return `ok: true` and `keyConfigured: true`.
6. Test `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/matches` in a browser. It should return JSON with a `matches` array.

### Wrangler deployment (optional)

From the `worker` folder, install Wrangler and run:

```bash
npx wrangler login
npx wrangler secret put CRICKETDATA_API_KEY
npx wrangler deploy
```

When prompted for the secret, enter your newly regenerated key in the terminal. Do not put it in `wrangler.toml`.

## Connect GitHub Pages to the Worker

1. Open `config.js` in your GitHub repository.
2. Set `apiBaseUrl` to the deployed Worker URL, for example:

```js
window.CRICKET_CONFIG = {
  apiBaseUrl: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",
  refreshIntervalMs: 60000
};
```

3. Commit the change and wait for GitHub Pages to rebuild.
4. Open the website and search for a team. The label should say `API CONNECTED` when the match-list request succeeds.

## Worker endpoints

- `GET /health`
- `GET /matches?team=Qatar%20vs%20Kuwait&date=2026-10-22&series=&format=`
- `GET /matches/{match-id}`
- `GET /matches/{match-id}/commentary`

The Worker caches provider responses briefly to reduce quota usage. The browser refresh interval is set to 60 seconds. This does not guarantee that the provider itself updates every minute.

## Architecture

```text
GitHub Pages frontend → Cloudflare Worker (secret key + short cache) → CricketData API
```

The frontend and Worker are separated from the provider-specific response format, making it easier to replace CricketData later.

## Known limitations

- No batters/bowlers table is shown until the provider endpoint supplies those fields.
- Ball-by-ball commentary is not yet wired because the provided Match Info response does not include commentary, and the example match reports `bbbEnabled: false`.
- Series search, historical fixtures, domestic coverage, rain interruptions, news and playing-XI alerts require additional endpoints and plan/coverage verification.
- Confirm CricketData terms and your account plan permit your intended display and redistribution.
- This is a starter implementation. Test it with your account and a non-production match before relying on it.

## Demo mode

If `apiBaseUrl` is blank, the website remains in its clearly labelled demo mode.
