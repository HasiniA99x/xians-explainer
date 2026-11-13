/*
 * The Xians webhook flows: a GitHub trigger, a PR review (trigger, harness, LLM cost, results back) and a redelivery. Traced from XiansAi.Server, XiansAi.Lib, the-agent, agent-studio and plugins-official
 * (main plus open PRs: Lib #146, Server #661/#666, Studio #174/#175, agent #106, including the #666/#175
 * review fixes: body-hashed claim, per-server and per-user caps) and #659: each call runs in its own
 * Integrator Workflow keyed by its request ID; the request-ID log tag was reverted. Values are made up;
 * their shapes match the code.
 */
(function () {
  const ID = {
    githubDelivery: '8c3f2e10-7b1d-11f1-9a4c-2f6d0e1b5a77',
    requestId: '3f9a6c2e-41d8-4b7e-9c55-0a1e7d2b8f64',
    deliveryId: '019a6b2e-5c41-7a10-9d3e-6f2b1c8e4a90',
    newRequestId: 'b71e0d4c-9a2f-4c61-8e3b-5d7a1f0c2e98',
    newDeliveryId: '019a6b4f-0e12-7c33-8a51-2b9d4e7f1c06',
  }
  // Each call has its own Integrator Workflow; it and the run it starts both end with the request ID.
  ID.integrator = `acme:Xianix AI-DLC Agent:Integrator Workflow:hooks:${ID.requestId}`
  ID.processing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.requestId}`
  ID.newIntegrator = `acme:Xianix AI-DLC Agent:Integrator Workflow:hooks:${ID.newRequestId}`
  ID.newProcessing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.newRequestId}`
  const logsLink = wf => `/settings/logs?workflowId=${encodeURIComponent(wf)}`

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
        'Creates a new <b>request ID</b>. It ends the ID of every workflow this call runs.',
      ],
      stop: 'Agent, workflow or activation name contains “:” → 400.',
      ids: { 'Request ID': ID.requestId },
      data: { path: '/api/user/webhooks/builtin', auth: 'apikeyId → ok', requestId: ID.requestId, workflowId: ID.integrator },
    },
    {
      id: 'mongo', sys: 'mongo', name: 'MongoDB', action: 'Saves the call', req: true,
      lines: [
        'Stores the headers and body as one delivery.',
        'This is what you see — and can redeliver — in Agent Studio.',
        'A faked <code>X-Xians-Redelivery</code> header is ignored: saved as a normal call.',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { collection: 'webhook_incomings', _id: ID.deliveryId, request_id: ID.requestId, workflow_id: ID.integrator, redelivery_of: null, keeps: 'newest 100 per webhook' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'Own workflow', req: true,
      lines: [
        'A workflow <b>just for this call</b>; its ID ends with the request ID.',
        'It hands the call to the agent, then closes after 5 min with nothing new.',
      ],
      ids: { 'Workflow': ID.integrator },
      data: { temporal: 'signal-with-start', workflowId: ID.integrator, signal: 'HandleInboundChatOrData', activationCheckedOn: 'acme:Xianix AI-DLC Agent:Integrator Workflow:hooks', closesAfterIdle: '300 s (INTEGRATOR-INACTIVITY-TIMEOUT-SECONDS)' },
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
        'One run per matched rule. It keeps going after the Integrator Workflow closes.',
        'Its ID ends with the <b>same request ID</b>, so Studio can find it.',
      ],
      ids: { 'Run': ID.processing },
      data: { workflowId: ID.processing, idConflictPolicy: 'UseExisting', secondMatch: `…:${ID.requestId}-2` },
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
        '<b>Logs</b> opens this call\'s own Integrator Workflow <b>plus</b> the Processing run it started.',
        '<b>Redeliver</b> sends the saved call again (see the Redeliver tab). Greyed out if the call was saved cut short.',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { logsLink: logsLink(ID.integrator), logsApiAsks: { workflowIds: [ID.integrator, ID.processing] } },
    },
  ]

  /** Redeliver: a developer re-sends a saved call from Agent Studio. */
  const redeliverSteps = [
    {
      id: 'click', sys: 'studio', name: 'Agent Studio', action: 'Click Redeliver',
      lines: [
        'Open a delivery and click <b>Redeliver now</b>.',
        'Needs the <code>webhooks:redeliver</code> permission (Developer or Tenant Admin).',
        'Up to <b>3 at once</b> per user. The button is greyed out if the body or headers were saved cut short.',
      ],
      stop: 'Already 3 running for you → 429, nothing is sent.',
      ids: { 'Original delivery': ID.deliveryId },
      data: { button: 'Redeliver now', delivery: ID.deliveryId, user: 'dev-jane@acme.io', limits: { perUser: 3, truncated: 'button disabled' } },
    },
    {
      id: 'admin', sys: 'server', name: 'Admin API', action: 'Signs a claim',
      lines: [
        'Loads the saved call.',
        'Signs a claim: valid 5 minutes, <b>one use</b>, tied to a <b>hash of the body</b>.',
        'Up to <b>10 redeliveries at once</b> per server.',
      ],
      stop: 'Already being redelivered, saved cut short or no URL → 409. Server busy → 429. Nothing is sent.',
      ids: { 'Original delivery': ID.deliveryId },
      data: { endpoint: `POST …/incomings/${ID.deliveryId}/redeliver`, claim: { signed: 'HMAC', expires: '5 min', uses: 1, bodySha256: 'Yk3v…Q9w' }, maxAtOnce: 10 },
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
        'Checks the body matches the hash in the claim.',
        'A new delivery row, linked to the original. The original stays unchanged.',
      ],
      stop: 'Body doesn’t match, or claim already used → saved as a normal call, not linked.',
      ids: { 'New delivery': ID.newDeliveryId, 'Redelivery of': ID.deliveryId },
      data: { _id: ID.newDeliveryId, request_id: ID.newRequestId, redelivery_of: ID.deliveryId, triggered_by: 'dev-jane@acme.io', bodyHash: 'matches' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'New own workflow', req: true,
      lines: ['A new workflow just for this call, named after the <b>new</b> request ID.'],
      ids: { 'Workflow': ID.newIntegrator },
      data: { workflowId: ID.newIntegrator, requestId: ID.newRequestId },
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
        'Close the panel early → Studio stops waiting; the server still finishes.',
      ],
      stop: 'No answer in time → “Could not confirm the redelivery”, and the list refreshes.',
      ids: { 'New delivery': ID.newDeliveryId, 'New request ID': ID.newRequestId },
      data: { toast: 'Redelivered · answered 200 in 1.4 s', newRow: { badge: 'Redelivery', redeliveryOf: ID.deliveryId }, logsLink: logsLink(ID.newIntegrator) },
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
        'Hands it to the agent in a workflow of its own.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { requestId: ID.requestId, saved: 'webhook_incomings', to: ID.integrator },
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
        'Logs it in the run (ID ends with the request ID), sends metrics, removes the container.',
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
      data: { logsLink: logsLink(ID.integrator), summary: '| Cost | $0.8400 | · | Tokens | in=41200, out=6100 |' },
    },
  ]

  const workflows = [
    { id: 'github', name: 'GitHub trigger', blurb: 'A labelled PR gets an AI review.', reqId: ID.requestId, steps },
    { id: 'prreview', name: 'PR review', blurb: 'Trigger → harness → LLM → back. Each step shows whether it costs tokens.', reqId: ID.requestId, steps: prReviewSteps },
    { id: 'redeliver', name: 'Redeliver', blurb: 'Re-send a saved call from Agent Studio. It runs again under a new request ID.', reqId: ID.newRequestId, steps: redeliverSteps },
  ]

  window.FLOW = { ID, workflows }
})()
