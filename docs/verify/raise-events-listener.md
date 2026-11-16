# Verify: raise-events listener and Before/After sections

Date: 2026-11-16 · Change: `server.js` (new), Live listener panel and Before/After sections on the Raise events tab (`app.js`, `index.html`, `styles.css`, `flow-data.js`), README.

There are no scope or ADR files in this repo. The criteria below come from the request that built the feature.

Tests: `test/server.test.js`, run with `node --test` (13 tests, all passing). Each run starts its own server on a spare port with a temporary event store, so it never touches a listener already running on 8765.

## Acceptance criteria

| # | Criterion | How it was checked | Result |
|---|-----------|--------------------|--------|
| 1 | Page loads on `127.0.0.1`, `localhost` and `[::1]` | Test, plus `curl` against the running server | Pass |
| 2 | A before and an after POST with one `correlationId` show as one row, with actors | Test (stored as a pair), headless Edge screenshot of the panel, and two **real** runs from the agent (`2d93aa4b…`, `4eb6540c…`) | Pass |
| 3 | Payload as an object or a one-item array | Test | Pass |
| 4 | Header values never stored or shown, only names | Test: an `X-Api-Key` value is absent from `/listener/events` and from the store file | Pass |
| 5 | Non-JSON body accepted and flagged; an empty body is accepted | Test | Pass |
| 6 | GET on `/listener/before`: 405 for clients, 302 to `/#events` for a browser | Test | Pass |
| 7 | Unknown listener path or type → 404 | Test | Pass |
| 8 | `.git`, `.listener-events.json` and paths outside the folder not served | Test: dotfiles, encoded `..`, encoded backslashes, sibling repo | Pass |
| 9 | Live updates: the stream sends a snapshot, then each event | Test | Pass |
| 10 | Events survive a restart; Clear empties the list and the store | Test (restart inside the test) and a restart of the real server, which kept its 2 events | Pass |

## Edge cases tried

- A body over 1 MB → 413, connection closed. Pass.
- 205 events → only the last 200 are kept. Pass.
- `/../README.md` → 200. URL parsing normalises it to this folder's own README, so nothing escapes. The test was corrected; it was a wrong expectation, not a defect.
- A browser tab whose live connection drops (the server restarts) → the page now reconnects by itself. Checked by restarting the server with the page open.

## Fixed during this pass

- `LISTENER_STORE` env var added so tests can use a temporary store instead of the real `.listener-events.json`.

## Open risks

- **Listener is loopback only.** An agent on another machine cannot reach it. A tunnel (cloudflared) works but makes the panel and Clear public, with no auth.
- **No auth on POST or DELETE.** Fine on loopback. Add a shared token before exposing it.
- **A down listener delays the agent.** The agent retries a failed `before` delivery up to 10 times before starting the run. Keep `node server.js` running while rules.json points here.
- **UI checked by screenshot, not automated.** No browser test framework in this zero-dependency repo.
