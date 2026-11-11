# Xians webhook flow explainer

One page, one flow: a GitHub pull-request webhook through Xians in nine steps, from a labelled PR to a posted review, plus **Redeliver** from Agent Studio.

- Click a step (or press **Play**, or use **←/→**) to see what happens there in two or three lines.
- **req** on a step means the delivery's request ID has reached it. That ID is what Studio uses to find all of the delivery's logs.
- **Show data** has a sample of the data at that step.

The URL keeps the selected step (`index.html#agent`), so you can link to it.

## Run it

No dependencies and no build step: open `index.html` in a browser.

## Files

| File | Purpose |
|------|---------|
| `flow-data.js` | The nine steps and redelivery: names, short lines, IDs and sample data. Edit this to change the content. |
| `app.js` | Draws the flow and the detail card; playback and keyboard controls. |
| `styles.css` | Light and dark themes (follows the OS setting). |

## Sources

Traced from XiansAi.Server, XiansAi.Lib, the-agent and agent-studio: `main` plus open PRs for request-ID log tags (XiansAi.Lib #146, XiansAi.Server #661, agent-studio #174), run naming (the-agent #106) and redelivery (XiansAi.Server #666, agent-studio #175). Sample values are invented; their shapes match the code.
