/*
 * The Xians webhook flows: a GitHub trigger, a PR review (trigger, harness, LLM cost, results back) and a redelivery. Traced from XiansAi.Server, XiansAi.Lib, the-agent, agent-studio and plugins-official
 * (main plus open PRs: Lib #146, Server #661/#666, Studio #174/#175, agent #106). Values are made up;
 * their shapes match the code.
 */
(function () {
  const ID = {
    githubDelivery: '8c3f2e10-7b1d-11f1-9a4c-2f6d0e1b5a77',
    requestId: '3f9a6c2e-41d8-4b7e-9c55-0a1e7d2b8f64',
    deliveryId: '019a6b2e-5c41-7a10-9d3e-6f2b1c8e4a90',
    integrator: 'acme:Xianix AI-DLC Agent:Integrator Workflow:hooks',
    newRequestId: 'b71e0d4c-9a2f-4c61-8e3b-5d7a1f0c2e98',
    newDeliveryId: '019a6b4f-0e12-7c33-8a51-2b9d4e7f1c06',
  }
  ID.processing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.requestId}`
  ID.newProcessing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.newRequestId}`

  /**
   * `sys` picks the colour. `req` = the request ID has reached this step.
   * `llm` = a model is called here (costs tokens). `free` = plain code, no LLM cost. `src` = where the code lives.
   */
  const steps = [
    {
      id: 'github', sys: 'github', name: 'GitHub', action: 'PR labelled',
      lines: [
        'Someone adds the <code>ai-dlc/pr/pr-review</code> label.',
        'GitHub sends the event to the Xians webhook URL.',
      ],
      ids: { 'GitHub delivery': ID.githubDelivery },
      data: { event: 'pull_request', action: 'labeled', label: 'ai-dlc/pr/pr-review', pr: 42, repo: 'acme/payments-api' },
    },
    {
      id: 'server', sys: 'server', name: 'Xians Server', action: 'Gives a request ID', req: true,
      lines: [
        'Checks the API key in the URL.',
        'Creates a new <b>request ID</b>. It follows this delivery everywhere.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { path: '/api/user/webhooks/builtin', auth: 'apikeyId → ok', requestId: ID.requestId },
    },
    {
      id: 'mongo', sys: 'mongo', name: 'MongoDB', action: 'Saves the call', req: true,
      lines: [
        'Stores the headers and body as one delivery.',
        'This is what you see — and can redeliver — in Agent Studio.',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { collection: 'webhook_incomings', _id: ID.deliveryId, request_id: ID.requestId, keeps: 'newest 100 per webhook' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'Queues it', req: true,
      lines: [
        'One long-lived workflow receives every delivery.',
        'It hands this one to the agent.',
      ],
      ids: { 'Workflow': ID.integrator },
      data: { temporal: 'signal-with-start', workflowId: ID.integrator, signal: 'HandleInboundChatOrData' },
    },
    {
      id: 'agent', sys: 'handler', name: 'Agent', action: 'Checks & matches', req: true,
      lines: [
        'Verifies the GitHub signature, then matches <code>rules.json</code>.',
        'Answers GitHub <b>200</b> straight away.',
      ],
      stop: 'No match or bad signature → answers “ignored” and stops here.',
      ids: { 'Request ID': ID.requestId },
      data: { signature: 'passed', matched: 'github-pull-request-review', replyToGitHub: { status: 200, body: { status: 'success', matchCount: 1 } } },
    },
    {
      id: 'processing', sys: 'processing', name: 'Processing Workflow', action: 'Starts the run', req: true,
      lines: [
        'One run per matched rule.',
        'Its ID ends with the request ID, so Studio can find it.',
      ],
      ids: { 'Run': ID.processing },
      data: { workflowId: ID.processing, memo: { requestId: ID.requestId } },
    },
    {
      id: 'executor', sys: 'executor', name: 'Executor', action: 'Claude reviews', req: true, llm: true,
      lines: [
        'A Docker container runs Claude Code.',
        'The <code>pr-reviewer</code> plugin reviews PR #42.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { image: '99xio/xianix-executor:latest', plugin: 'pr-reviewer', prompt: '/pr-review 42', model: 'claude-sonnet-4-5' },
    },
    {
      id: 'review', sys: 'github', name: 'GitHub', action: 'Review posted',
      lines: ['A summary and inline comments appear on the PR.'],
      data: { pr: 'acme/payments-api#42', summary: 1, inlineComments: 4, took: '≈ 3.5 min' },
    },
    {
      id: 'studio', sys: 'studio', name: 'Agent Studio', action: 'See logs · Redeliver', req: true,
      lines: [
        '<b>Logs</b> opens every log tagged with this request ID.',
        'No tagged logs → the button reads <b>No logs</b>.',
        '<b>Redeliver</b> sends the saved call again (see the Redeliver tab).',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { logsLink: `/settings/logs?requestId=${ID.requestId}` },
    },
  ]

  /** Redeliver: a developer re-sends a saved call from Agent Studio. */
  const redeliverSteps = [
    {
      id: 'click', sys: 'studio', name: 'Agent Studio', action: 'Click Redeliver',
      lines: [
        'Open a delivery and click <b>Redeliver now</b>.',
        'Needs the <code>webhooks:redeliver</code> permission (Developer or Tenant Admin).',
      ],
      ids: { 'Original delivery': ID.deliveryId },
      data: { button: 'Redeliver now', delivery: ID.deliveryId, user: 'dev-jane@acme.io' },
    },
    {
      id: 'admin', sys: 'server', name: 'Admin API', action: 'Signs a claim',
      lines: [
        'Loads the saved call.',
        'Signs a claim: valid 5 minutes, <b>one use</b> only.',
      ],
      stop: 'Already being redelivered → 409, nothing is sent.',
      ids: { 'Original delivery': ID.deliveryId },
      data: { endpoint: `POST …/incomings/${ID.deliveryId}/redeliver`, claim: { signed: 'HMAC', expires: '5 min', uses: 1 } },
    },
    {
      id: 'server', sys: 'server', name: 'Xians Server', action: 'Calls itself', req: true,
      lines: [
        'POSTs the saved body and headers to the webhook\'s own URL.',
        'Gives the call a <b>new request ID</b>.',
      ],
      ids: { 'New request ID': ID.newRequestId },
      data: { url: '(the webhook\'s own URL, on the server\'s own address)', header: 'X-Xians-Redelivery: <signed claim>', requestId: ID.newRequestId },
    },
    {
      id: 'mongo', sys: 'mongo', name: 'MongoDB', action: 'Saves a new row', req: true,
      lines: [
        'A new delivery row, linked to the original.',
        'The original row stays unchanged.',
      ],
      ids: { 'New delivery': ID.newDeliveryId, 'Redelivery of': ID.deliveryId },
      data: { _id: ID.newDeliveryId, request_id: ID.newRequestId, redelivery_of: ID.deliveryId, triggered_by: 'dev-jane@acme.io' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'Queues it', req: true,
      lines: ['Same as a call from GitHub: the long-lived workflow hands it to the agent.'],
      ids: { 'Workflow': ID.integrator },
      data: { workflowId: ID.integrator, requestId: ID.newRequestId },
    },
    {
      id: 'agent', sys: 'handler', name: 'Agent', action: 'Checks & matches', req: true,
      lines: [
        'Verifies the signature and matches <code>rules.json</code> again.',
        'Answers <b>200</b>.',
      ],
      ids: { 'Request ID': ID.newRequestId },
      data: { signature: 'passed', matched: 'github-pull-request-review', reply: { status: 200 } },
    },
    {
      id: 'processing', sys: 'processing', name: 'Processing Workflow', action: 'Starts a new run', req: true,
      lines: ['A new run, named after the <b>new</b> request ID.'],
      ids: { 'Run': ID.newProcessing },
      data: { workflowId: ID.newProcessing, memo: { requestId: ID.newRequestId } },
    },
    {
      id: 'executor', sys: 'executor', name: 'Executor', action: 'Reviews again', req: true, llm: true,
      lines: ['Claude Code reviews the PR again and posts the review.'],
      ids: { 'Request ID': ID.newRequestId },
      data: { plugin: 'pr-reviewer', prompt: '/pr-review 42', pr: 'acme/payments-api#42' },
    },
    {
      id: 'result', sys: 'studio', name: 'Agent Studio', action: 'Shows the result', req: true,
      lines: [
        'Toast: <b>Redelivered · answered 200 in 1.4 s</b>.',
        'The new row has a <b>Redelivery</b> badge and its own Logs.',
      ],
      stop: 'No answer in time → “Could not confirm the redelivery”, and the list refreshes.',
      ids: { 'New delivery': ID.newDeliveryId, 'New request ID': ID.newRequestId },
      data: { toast: 'Redelivered · answered 200 in 1.4 s', newRow: { badge: 'Redelivery', redeliveryOf: ID.deliveryId }, logsLink: `/settings/logs?requestId=${ID.newRequestId}` },
    },
  ]

  /** PR review: trigger → harness → LLM (paid) vs scripts (free) → results back. High-level components only. */
  const prReviewSteps = [
    {
      id: 'trigger', sys: 'github', name: 'GitHub', action: 'Label or @xianix', free: true,
      lines: [
        'Add the <code>ai-dlc/pr/pr-review</code> label, push to a labelled PR, or comment <code>@xianix …</code>.',
        'GitHub sends the event to the Xians webhook URL.',
      ],
      data: { label: { event: 'pull_request', action: 'labeled | opened | synchronize' }, comment: { event: 'issue_comment', action: 'created', body: '@xianix …' } },
    },
    {
      id: 'server', sys: 'server', name: 'Xians Server', action: 'Receives & saves', req: true, free: true,
      lines: [
        'Checks the API key, gives a <b>request ID</b>, saves the call.',
        'Hands it to the agent.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { requestId: ID.requestId, saved: 'webhook_incomings', to: 'Integrator Workflow' },
    },
    {
      id: 'agent', sys: 'handler', name: 'Agent', action: 'Matches a rule', req: true, free: true,
      lines: [
        'Verifies the signature and matches <code>rules.json</code>. No LLM here.',
        'The rule sets the plugin, prompt, <b>model</b> and <b>budget</b>, then starts a run.',
      ],
      stop: 'No match → “ignored”, nothing runs and nothing is spent.',
      data: { label: { rule: 'github-pull-request-review', prompt: 'Run /pr-review 42', model: 'claude-sonnet-4-5', maxBudgetUsd: 3 }, comment: { rule: 'github-pr-agent-comment-instruction', prompt: 'You are @xianix … decide if it is for you, then reply', model: 'claude-sonnet-4-5', maxBudgetUsd: 5 } },
      src: 'the-agent/TheAgent/Knowledge/rules.json',
    },
    {
      id: 'harness', sys: 'executor', name: 'Executor', action: 'Prepares the harness', req: true, free: true,
      lines: [
        'A Docker container per run: fetches the repo, makes a fresh worktree.',
        'Installs the PR plugin and runtimes, writes a repo map, adds host context to the prompt.',
      ],
      data: { image: '99xio/xianix-executor', worktree: '/workspace/exec-<id>', plugin: 'pr-reviewer@xianix-plugins-official', context: ['CLAUDE.md', '.xianix/repomap.txt'], optionalPaid: 'Haiku repo notes only if XIANIX-CONTEXT-LLM=1' },
      src: 'the-agent/Executor/run_prompt.sh',
    },
    {
      id: 'lead', sys: 'llm', name: 'Executor', action: 'Claude starts', req: true, llm: true,
      lines: [
        'Claude Code runs the prompt with the rule\'s model.',
        'Hard cap: the rule\'s budget (no budget → $10). Small side tasks go to cheaper Haiku.',
      ],
      stop: 'Budget used up → the run stops; cost so far is still reported.',
      data: { model: 'claude-sonnet-4-5', max_budget_usd: 3, sideTasks: 'claude-haiku-4-5', permission_mode: 'bypassPermissions' },
      src: 'the-agent/Executor/execute_plugin.py',
    },
    {
      id: 'scripts', sys: 'plugin', name: 'PR plugin', action: 'Runs its scripts', req: true, free: true,
      lines: [
        'Claude calls the plugin\'s scripts: platform, access, “Review in progress”, first or re-review, pick a tier.',
        'Scripts are plain code. Only Claude\'s turns between them cost tokens.',
      ],
      data: { scripts: ['check-permissions.sh', 'gh-start-comment.sh', 'gh-detect-prior.sh', 'review-tier.sh'], tier: 'haiku | specialists' },
      src: 'plugins-official/plugins/pr-reviewer/scripts/',
    },
    {
      id: 'review', sys: 'llm', name: 'PR plugin', action: 'Sub-agents review', req: true, llm: true,
      lines: [
        'Normal PR → 2 cheap Haiku finders.',
        'Risky code (auth, payments, migrations…) → specialists; security and performance on the bigger model.',
      ],
      data: { cheap: ['bugs (haiku)', 'security (haiku)'], specialists: { code: 'haiku', test: 'haiku', security: 'lead model', performance: 'lead model' } },
      src: 'plugins-official/plugins/pr-reviewer/agents/',
    },
    {
      id: 'post', sys: 'plugin', name: 'PR plugin', action: 'Posts to GitHub', req: true, free: true,
      lines: [
        'A script posts the summary and one inline comment per finding.',
        'Re-reviews mark old findings fixed instead of repeating them.',
      ],
      data: { script: 'gh-post-review.sh', pr: 'acme/payments-api#42', summary: 1, inlineComments: 4 },
      src: 'plugins-official/plugins/pr-reviewer/scripts/gh-post-review.sh',
    },
    {
      id: 'report', sys: 'handler', name: 'Agent', action: 'Collects cost', req: true, free: true,
      lines: [
        'Reads the executor\'s JSON result: cost, tokens, models.',
        'Logs it under the request ID, sends metrics, removes the container.',
      ],
      data: { status: 'completed', cost_usd: 0.84, tokens: { input: 41200, output: 6100 }, models: ['claude-haiku-4-5', 'claude-sonnet-4-5'], took: '≈ 3.5 min' },
      src: 'the-agent/TheAgent/Workflows/ProcessingWorkflow.cs',
    },
    {
      id: 'studio', sys: 'studio', name: 'Agent Studio', action: 'Shows logs & cost', req: true, free: true,
      lines: [
        '<b>Logs</b> on the delivery shows the whole run, including cost and tokens.',
        '<b>Redeliver</b> runs it again (and spends again).',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { logsLink: `/settings/logs?requestId=${ID.requestId}`, summary: '| Cost | $0.8400 | · | Tokens | in=41200, out=6100 |' },
    },
  ]

  const workflows = [
    { id: 'github', name: 'GitHub trigger', blurb: 'A labelled PR gets an AI review.', reqId: ID.requestId, steps },
    { id: 'prreview', name: 'PR review', blurb: 'Trigger → harness → LLM → back. Each step shows whether it costs tokens.', reqId: ID.requestId, steps: prReviewSteps },
    { id: 'redeliver', name: 'Redeliver', blurb: 'Re-send a saved call from Agent Studio. It runs again under a new request ID.', reqId: ID.newRequestId, steps: redeliverSteps },
  ]

  window.FLOW = { ID, workflows }
})()
