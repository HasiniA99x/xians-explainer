# Xians webhook flow explainer

One page with four workflows, picked from the tabs:

| Tab | What it shows |
|-----|---------------|
| GitHub trigger | A labelled PR goes through Xians in nine steps and gets an AI review. |
| PR review | Trigger (label or `@xianix` comment) → Server → Agent → Executor harness → LLM → PR plugin posts → cost back to Agent and Agent Studio. |
| Redeliver | A saved call is re-sent from Agent Studio and runs again under a new request ID. |
| Raise events | Drawn as a flowchart: a run POSTs `before` events (status `started`) and `after` events (`success` / `error`, with cost) to outside listeners, paired by one correlation ID. Red dashed boxes are where an event is dropped or never sent; dashed loops are retries. |

- Click a step (or press **Play**, or use **←/→**) to see what happens there in two or three lines.
- **req** on a step means the delivery's request ID has reached it. The call's own Integrator Workflow and its Processing run both end with that ID, which is how Studio's **Logs** finds them.
- **LLM · $** on a step means a model is called there and it costs tokens; **no LLM · free** means plain code.
- **Code** names the file where that step lives.
- **Show data** has a sample of the data at that step.
- Under the **PR review** tab, two diagrams show the calls behind each PR comment, and what happens when AI credit runs low (today, and a proposed fix).

The URL keeps the tab and step (`index.html#redeliver/admin`), so you can link to it.

## Run it

No dependencies and no build step.

```sh
node server.js      # http://127.0.0.1:8765/#events   (PORT=9000 to change)
```

Opening `index.html` straight from disk still works, but then the live listener is off.

Tests: `node --test` (built-in runner, no packages). They start their own server on a spare port with a temporary event store (`LISTENER_STORE`), so a running listener is never touched.

## Live listener

`server.js` also acts as a raise-events listener, so you can watch real `before` / `after` events from the agent on the **Raise events** tab:

| Endpoint | What it does |
|----------|--------------|
| `POST /listener/before` | Takes a `type: "before"` event (run starting). Replies `202`. |
| `POST /listener/after` | Takes a `type: "after"` event (run finished). Replies `202`. |
| `GET /listener/events` | Everything received so far, as JSON. |
| `GET /listener/stream` | The same, live (Server-Sent Events). The page uses this. |
| `DELETE /listener/events` | Clears the list (the **Clear** button). |

Point a raise-event at it in `rules.json`:

```json
{ "name": "listener-before", "type": "before", "url": "http://127.0.0.1:8765/listener/before", "payload": { "correlationId": "{{correlationId}}", "actors": ["{{pr-author}}", "{{plugin-name}}"] } }
```

The panel pairs each run's before and after events by `correlationId`. The last 200 events are saved to `.listener-events.json` (git-ignored, never served), so a restart keeps them. Only header **names** are kept, never their values, so an API key is never shown. It listens on `127.0.0.1`, so the agent has to run on the same machine. Keep the server running while the agent is live: a `before` event that can't be delivered is retried (up to 10 times) and holds up the run.

## Files

| File | Purpose |
|------|---------|
| `flow-data.js` | The workflows and their steps: names, short lines, IDs and sample data. Edit this to change the content. |
| `app.js` | Draws the tabs, the flow and the detail card; playback and keyboard controls. |
| `styles.css` | Light and dark themes (follows the OS setting). |
| `server.js` | Serves the page and runs the live raise-events listener. |
| `test/server.test.js` | Tests for the server and listener (`node --test`). |

## Sources

Traced from XiansAi.Server, XiansAi.Lib, the-agent, agent-studio and plugins-official (`pr-reviewer`): `main` plus open work for one workflow per call and logs by workflow ID (#659 branches in XiansAi.Server, XiansAi.Lib, the-agent and agent-studio; the earlier request-ID log tag was reverted), run naming (the-agent #106), before/after raise-events (the-agent branch `653-agent-pulse-raise-event-type`) and redelivery (XiansAi.Server #666, agent-studio #175). Sample values are invented; their shapes match the code.
