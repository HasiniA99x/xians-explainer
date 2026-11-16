# AGENTS.md

Static explainer page plus a small Node server (`server.js`) that also acts as a raise-events listener. No dependencies, no build step.

- **Run:** `node server.js` → http://127.0.0.1:8765/#events
- **Test:** `node --test` (Node's built-in test runner; tests live in `test/`). Keep it dependency-free: no npm packages.
- **Tests must not touch a running listener:** start the server on a spare `PORT` with `LISTENER_STORE` pointing at a temp file, as `test/server.test.js` does.
- **Content** lives in `flow-data.js`; drawing and the live panel in `app.js`; styles in `styles.css` (light/dark tokens on `:root`).
- **Never commit** `.listener-events.json` (received events; ignored in `.gitignore`).
- Verification notes go in `docs/verify/`.
