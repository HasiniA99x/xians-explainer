# Xians webhook flow explainer

One page with three workflows, picked from the tabs:

| Tab | What it shows |
|-----|---------------|
| GitHub trigger | A labelled PR goes through Xians in nine steps and gets an AI review. |
| PR review | Trigger (label or `@xianix` comment) → Server → Agent → Executor harness → LLM → PR plugin posts → cost back to Agent and Agent Studio. |
| Redeliver | A saved call is re-sent from Agent Studio and runs again under a new request ID. |

- Click a step (or press **Play**, or use **←/→**) to see what happens there in two or three lines.
- **req** on a step means the delivery's request ID has reached it. That ID is what Studio uses to find all of the delivery's logs.
- **LLM · $** on a step means a model is called there and it costs tokens; **no LLM · free** means plain code.
- **Code** names the file where that step lives.
- **Show data** has a sample of the data at that step.
- Under the **PR review** tab, two diagrams show the calls behind each PR comment, and what happens when AI credit runs low (today, and a proposed fix).

The URL keeps the tab and step (`index.html#redeliver/admin`), so you can link to it.

## Run it

No dependencies and no build step: open `index.html` in a browser.

## Files

| File | Purpose |
|------|---------|
| `flow-data.js` | The workflows and their steps: names, short lines, IDs and sample data. Edit this to change the content. |
| `app.js` | Draws the tabs, the flow and the detail card; playback and keyboard controls. |
| `styles.css` | Light and dark themes (follows the OS setting). |

## Sources

Traced from XiansAi.Server, XiansAi.Lib, the-agent, agent-studio and plugins-official (`pr-reviewer`): `main` plus open PRs for request-ID log tags (XiansAi.Lib #146, XiansAi.Server #661, agent-studio #174), run naming (the-agent #106) and redelivery (XiansAi.Server #666, agent-studio #175). Sample values are invented; their shapes match the code.
