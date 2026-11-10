# Xians webhook flow explainer

An interactive page that follows one GitHub pull-request event through Xians: XiansAi.Server, MongoDB, the server-triggered **Integrator Workflow**, the agent's webhook handler, the agent-started **Processing Workflow** and the executor container. It ends with the review on the PR and the delivery in Agent Studio.

Every step is a **debug point**. Select it to see:

- the data that exists at that point (request, stored row, signal payload, Temporal start, reply, container env…),
- the IDs known there (request ID, delivery ID, workflow IDs, container),
- what happens, in plain words,
- where in the code it happens.

## Run it

There are no dependencies and no build step. Open `index.html` in a browser.

To serve it over HTTP instead (so the "Copy" buttons can use the clipboard API on every browser):

```bash
npx serve .            # or: python -m http.server 8080
```

## Scenarios

| Tab | What it shows |
|-----|---------------|
| Review runs | A labelled PR matches `github-pull-request-review`; the agent starts a Processing run and the review is posted. |
| No rule matched | A PR opened without the label: recorded and answered `ignored`, nothing runs. |
| Signature fails | `X-Hub-Signature-256` doesn't match the vault secret: answered `ignored`, nothing runs. |
| Redelivered from Studio | A developer re-sends a recorded call. Comes from open PRs XiansAi.Server #666 / agent-studio #175. |

The URL keeps the scenario and step (`index.html#review/rules`), so you can link to a specific step.

## Files

| File | Purpose |
|------|---------|
| `flow-data.js` | Lanes, steps, sample data, scenarios, workflows and ID trace. Edit this to change the content. |
| `app.js` | Draws the swimlane diagram and the debug panel; playback and keyboard controls. |
| `styles.css` | Light and dark themes (follows the OS setting). |

## Sources

Traced from the code in XiansAi.Server, XiansAi.Lib, the-agent (`main` plus the run naming from the-agent #106) and agent-studio. The sample values are invented, but their names and shapes match the code: field names, headers, env vars, workflow IDs and volume names. If the code changes, update the matching step in `flow-data.js`. Each step lists the files it was traced from.
