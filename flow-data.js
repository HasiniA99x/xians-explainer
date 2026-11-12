/*
 * The Xians webhook flows: a GitHub label trigger, a PR comment trigger, where the LLM and harness sit in a run,
 * and a redelivery. Traced from XiansAi.Server, XiansAi.Lib, the-agent, agent-studio and plugins-official
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
    commentId: '2139485721',
    commentRequestId: 'd42c8e17-6b3a-4f09-a1d5-7e2f9c0b8a33',
  }
  ID.processing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.requestId}`
  ID.newProcessing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.newRequestId}`
  ID.commentProcessing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.commentRequestId}`

  /**
   * `sys` picks the colour. `req` = the request ID has reached this step.
   * `llm` = a model is called here (`'optional'` = only when switched on). `src` = where the code lives.
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

  /** PR comment: someone mentions @xianix on a PR and the agent replies. */
  const commentSteps = [
    {
      id: 'comment', sys: 'github', name: 'GitHub', action: '@xianix comment',
      lines: [
        'Someone comments <code>@xianix …</code> on a PR.',
        'GitHub sends an <code>issue_comment</code> event to the same webhook URL.',
      ],
      ids: { 'Comment ID': ID.commentId },
      data: { event: 'issue_comment', action: 'created', issue: { number: 42, pull_request: { url: '…/pulls/42' } }, comment: { id: ID.commentId, body: '@xianix why is the retry count 5 here?', user: 'dev-jane' } },
    },
    {
      id: 'xians', sys: 'server', name: 'Xians Server', action: 'Saves & queues', req: true,
      lines: [
        'Same as the GitHub trigger tab: new request ID, saved to MongoDB.',
        'The Integrator Workflow hands it to the agent.',
      ],
      ids: { 'Request ID': ID.commentRequestId },
      data: { requestId: ID.commentRequestId, collection: 'webhook_incomings', signal: 'HandleInboundChatOrData' },
    },
    {
      id: 'match', sys: 'handler', name: 'Agent', action: 'Matches the comment rule', req: true,
      lines: [
        'Rule <code>github-pr-agent-comment-instruction</code>: new comment, contains <code>@xianix</code>, and is on a PR.',
        'Pulls out PR number, comment text, author and comment ID.',
      ],
      stop: 'Same comment within 30 s → dropped as a duplicate.',
      ids: { 'Request ID': ID.commentRequestId },
      data: { rule: "action==created&&comment.body*='@xianix'&&issue.pull_request?", inputs: { 'pr-number': 42, 'user-instruction': '@xianix why is the retry count 5 here?', 'comment-author': 'dev-jane', 'comment-id': ID.commentId }, alsoFor: 'azuredevops-pr-agent-comment-instruction (Azure DevOps)' },
      src: 'the-agent/TheAgent/Knowledge/rules.json',
    },
    {
      id: 'prompt', sys: 'processing', name: 'Processing Workflow', action: 'Fills the prompt', req: true,
      lines: [
        'Puts the inputs into the rule\'s prompt template.',
        'No slash command is forced. The <code>pr-reviewer</code> plugin is only made available.',
      ],
      ids: { 'Run': ID.commentProcessing },
      data: { model: 'claude-sonnet-4-5', maxBudgetUsd: 5, plugins: ['pr-reviewer (/pr-review)'], prompt: 'You are @xianix. dev-jane mentioned @xianix in a comment on pull request #42. The comment: "…"' },
    },
    {
      id: 'harness', sys: 'executor', name: 'Executor', action: 'Adds host context', req: true,
      lines: [
        'Puts a <b>host context</b> block at the top of the prompt.',
        'It says: this is GitHub, so use <code>gh</code>, and <code>/pr-review</code> is available.',
      ],
      ids: { 'Request ID': ID.commentRequestId },
      data: { marker: '[Xianix host context]', platform: 'github — use the `gh` CLI', commands: ['/pr-review'] },
      src: 'the-agent/Executor/host_context.py',
    },
    {
      id: 'decide', sys: 'llm', name: 'Claude', action: 'Is it for me?', req: true, llm: true,
      lines: [
        'Claude reads the comment and decides if it is really addressed to @xianix.',
        'Just a mention in passing → it does nothing.',
      ],
      stop: 'Not addressed to @xianix → no reply is posted.',
      data: { addressed: true, kind: 'question' },
    },
    {
      id: 'act', sys: 'llm', name: 'Claude', action: 'Answers or acts', req: true, llm: true,
      lines: [
        'A greeting or question → a short answer.',
        'An instruction → does it (it can run <code>/pr-review</code>), limited to this PR.',
      ],
      data: { tools: ['Read', 'Grep', 'Bash (gh)'], scope: 'this PR\'s files and branch only' },
    },
    {
      id: 'reply', sys: 'github', name: 'GitHub', action: 'Reply posted',
      lines: [
        'Claude posts <b>one</b> reply itself with <code>gh pr comment</code>.',
        'Its text output alone never reaches the PR.',
      ],
      data: { command: 'gh pr comment 42 --body "…"', replies: 1 },
    },
  ]

  /** LLM & harness: inside one PR review run, which parts call a model and which are plain code. */
  const llmSteps = [
    {
      id: 'rules', sys: 'handler', name: 'Agent (C#)', action: 'Rules, no LLM', req: true,
      lines: [
        'Signature check, <code>rules.json</code> matching and dedup are plain code.',
        'The only LLM inside the agent is the Agent Studio chat (Haiku). Webhooks don\'t use it.',
      ],
      data: { llm: false, chatSupervisor: { model: 'claude-haiku-4-5', setting: 'ANTHROPIC-DEPLOYMENT-NAME' } },
      src: 'the-agent/TheAgent/Agent/XianixAgent.cs',
    },
    {
      id: 'env', sys: 'processing', name: 'Processing Workflow', action: 'Builds the container', req: true,
      lines: [
        'Turns the rule into env vars: prompt, model, budget, plugins.',
        'Tokens like <code>GITHUB-TOKEN</code> come from the tenant\'s Secret Vault.',
      ],
      data: { PROMPT: 'Run /pr-review 42 …', 'XIANIX-MODEL': 'claude-sonnet-4-5', 'XIANIX-MAX-BUDGET-USD': 3, 'CLAUDE-CODE-PLUGINS': '[pr-reviewer]', 'GITHUB-TOKEN': 'secrets.GITHUB-TOKEN' },
      src: 'the-agent/TheAgent/Activities/ContainerActivities.cs',
    },
    {
      id: 'prepare', sys: 'executor', name: 'Harness', action: 'Repo & plugins', req: true,
      lines: [
        'Fetches the repo into the tenant volume and makes a fresh worktree.',
        'Installs the plugin (its commands, sub-agents and hooks) and any runtimes the repo needs.',
      ],
      data: { repo: '/workspace/repo (bare clone)', worktree: '/workspace/exec-<id>', plugin: 'claude plugin install pr-reviewer@xianix-plugins-official --scope project', hooks: ['PreToolUse: validate-prerequisites.sh', 'PostToolUse: notify-push.sh'], runtimes: 'mise ← global.json, .nvmrc …' },
      src: 'the-agent/Executor/run_prompt.sh',
    },
    {
      id: 'context', sys: 'executor', name: 'Harness', action: 'Repo map', req: true, llm: 'optional',
      lines: [
        'Writes a <code>CLAUDE.md</code> and symbol map so Claude doesn\'t explore cold.',
        'Plain code by default. An optional Haiku pass adds notes (<code>XIANIX-CONTEXT-LLM=1</code>).',
      ],
      data: { files: ['CLAUDE.md', '.xianix/repomap.txt'], cachedBy: 'HEAD commit', optionalLlm: { model: 'claude-haiku-4-5', maxTurns: 15 } },
      src: 'the-agent/Executor/generate_context.sh',
    },
    {
      id: 'options', sys: 'executor', name: 'Harness', action: 'Sets the limits', req: true,
      lines: [
        'Adds host context to the prompt, then sets up the Claude Agent SDK.',
        'Model and budget come from the rule. No budget set → $10 cap.',
        'Other image: the <b>OpenCode</b> executor runs the prompt with <code>opencode run</code> instead (any provider model).',
      ],
      data: {
        claudeExecutor: { image: '99xio/xianix-executor', cwd: '/workspace/exec-<id>', model: 'claude-sonnet-4-5', max_budget_usd: 3, permission_mode: 'bypassPermissions', resume: 'only if XIANIX-RESUME-SESSIONS=1' },
        openCodeExecutor: { image: 'xianix-executor-opencode', runs: 'opencode run', model: 'provider/model, e.g. openai/…', plugins: 'Claude plugin .md converted into .opencode/' },
        pickedBy: 'EXECUTOR-IMAGE on the agent host',
      },
      src: 'the-agent/Executor/execute_plugin.py · Executor.OpenCode/execute_opencode.py',
    },
    {
      id: 'lead', sys: 'llm', name: 'Claude (lead)', action: 'Runs /pr-review', req: true, llm: true,
      lines: [
        'The main model call: Claude Code runs the plugin\'s <code>/pr-review</code> steps (see the Plugin tab).',
        'Small background tasks go to Haiku to save cost.',
      ],
      stop: 'Budget used up → the run stops, but cost and tokens are still reported.',
      data: { model: 'claude-sonnet-4-5', sideQueries: 'claude-haiku-4-5', sdk: 'claude_agent_sdk.query()' },
    },
    {
      id: 'subagents', sys: 'llm', name: 'Sub-agents', action: 'Find issues', req: true, llm: true,
      lines: [
        'Normal PR → two cheap Haiku finders.',
        'Risky code (auth, payments, migrations…) → specialist reviewers; security and performance use the lead model.',
      ],
      data: { default: ['finder: bugs (haiku)', 'finder: security (haiku)'], escalated: { 'code-reviewer': 'haiku', 'test-reviewer': 'haiku', 'security-reviewer': 'lead model', 'performance-reviewer': 'lead model' } },
      src: 'plugins-official/plugins/pr-reviewer/commands/pr-review.md',
    },
    {
      id: 'post', sys: 'github', name: 'Plugin scripts', action: 'Post the review', req: true,
      lines: [
        'Claude writes the findings; plugin scripts post them with <code>gh</code>.',
        'Hidden markers let the next run update old findings, not repeat them.',
      ],
      data: { script: 'scripts/gh-post-review.sh', posts: ['summary', 'one inline comment per finding'], marker: '<!-- pr-reviewer:v1.2 kind=finding fid=… -->' },
    },
    {
      id: 'report', sys: 'processing', name: 'Processing Workflow', action: 'Reports & cleans up', req: true,
      lines: [
        'Reads the JSON result: cost, tokens, models used.',
        'Sends metrics, then removes the container after 2 min.',
      ],
      data: { status: 'completed', cost_usd: 0.84, usage: { input_tokens: 41200, output_tokens: 6100 }, models: ['claude-haiku-4-5', 'claude-sonnet-4-5'], raiseEvents: ['ai-hub-metrics'] },
      src: 'the-agent/TheAgent/Workflows/ProcessingWorkflow.cs',
    },
  ]

  /** Plugin: what the pr-reviewer plugin does inside the executor when Claude runs /pr-review. */
  const PR = 'plugins-official/plugins/pr-reviewer/'
  const pluginSteps = [
    {
      id: 'install', sys: 'executor', name: 'Harness', action: 'Installs the plugin', req: true,
      lines: [
        'Adds the marketplace and installs <code>pr-reviewer</code> into the worktree.',
        'Brings its <code>/pr-review</code> command, 4 reviewer sub-agents, scripts and hooks.',
      ],
      data: { marketplace: 'xianix-team/plugins-official', command: '/pr-review', agents: ['code-reviewer', 'test-reviewer', 'security-reviewer', 'performance-reviewer'] },
      src: 'the-agent/Executor/run_prompt.sh',
    },
    {
      id: 'hooks', sys: 'executor', name: 'Plugin hooks', action: 'Guard every Bash call', req: true,
      lines: [
        'Before each Bash call: checks <code>gh</code> and tokens are there, or blocks it.',
        'After a <code>git push</code>: prints the pushed branch.',
      ],
      data: { PreToolUse: 'hooks/validate-prerequisites.sh', PostToolUse: 'hooks/notify-push.sh', blockExample: { decision: 'block', reason: 'GitHub CLI (gh) is not installed…' } },
      src: PR + 'hooks/hooks.json',
    },
    {
      id: 'platform', sys: 'github', name: 'Script', action: 'Platform & access', req: true,
      lines: [
        'Detects GitHub / Azure DevOps from <code>git remote</code>.',
        'Checks the token can comment on the PR.',
      ],
      stop: 'No access → stops with one error line.',
      data: { remote: 'github.com → github', script: 'scripts/check-permissions.sh' },
      src: PR + 'scripts/check-permissions.sh',
    },
    {
      id: 'start', sys: 'github', name: 'Script', action: '“Review in progress”', req: true,
      lines: ['Posts a starting comment on the PR within the first 3 tool calls.'],
      data: { script: 'scripts/gh-start-comment.sh', onFailure: 'warn and continue' },
      src: PR + 'scripts/gh-start-comment.sh',
    },
    {
      id: 'prior', sys: 'github', name: 'Script', action: 'First or re-review?', req: true,
      lines: [
        'Loads the PR diff and looks for its own hidden markers in old comments.',
        'Found → <b>re-review</b>: only the commits since last time.',
      ],
      data: { scripts: ['scripts/pr-setup.sh', 'scripts/gh-detect-prior.sh'], mode: 'initial | re-review', marker: '<!-- pr-reviewer:v1.2 … -->' },
      src: PR + 'scripts/gh-detect-prior.sh',
    },
    {
      id: 'tier', sys: 'github', name: 'Script', action: 'Picks the tier', req: true,
      lines: [
        'Normal diff → cheap path.',
        'Touches auth, payments, crypto, migrations or public APIs → specialists.',
      ],
      data: { script: 'scripts/review-tier.sh', REVIEW_TIER: 'haiku | specialists', models: 'scripts/resolve-models.sh' },
      src: PR + 'scripts/review-tier.sh',
    },
    {
      id: 'review', sys: 'llm', name: 'Sub-agents', action: 'Review the diff', req: true, llm: true,
      lines: [
        'Cheap path: 2 Haiku finders, then the lead keeps the best (max 8).',
        'Specialists: code + test on Haiku, security + performance on the lead model.',
      ],
      data: { haiku: ['bugs & regressions', 'security & edge cases'], specialists: { 'code-reviewer': 'haiku', 'test-reviewer': 'haiku', 'security-reviewer': 'lead', 'performance-reviewer': 'lead' } },
      src: PR + 'agents/',
    },
    {
      id: 'reconcile', sys: 'github', name: 'Script', action: 'Matches old findings', req: true,
      lines: [
        'Gives each finding a stable ID from its file and code line.',
        'Old finding gone from the code → marked fixed. Back again → reopened.',
      ],
      data: { scripts: ['scripts/assign-fids.sh', 'scripts/reconcile-prior-findings.sh'], fid: 'sha1(path | snippet | occurrence)[0:12]' },
      src: PR + 'scripts/reconcile-prior-findings.sh',
    },
    {
      id: 'post', sys: 'github', name: 'Script', action: 'Posts the review', req: true,
      lines: [
        'A summary with the verdict, plus one inline comment per finding.',
        'Replies on other people\'s threads that now look fixed (never resolves them).',
      ],
      data: { script: 'scripts/gh-post-review.sh', posts: ['summary', 'inline findings', 'suggestion blocks'] },
      src: PR + 'scripts/gh-post-review.sh',
    },
  ]

  const workflows = [
    { id: 'github', name: 'GitHub trigger', blurb: 'A labelled PR gets an AI review.', reqId: ID.requestId, steps },
    { id: 'comment', name: 'PR comment', blurb: 'Mention @xianix in a PR comment and the agent replies.', reqId: ID.commentRequestId, steps: commentSteps },
    { id: 'llm', name: 'LLM & harness', blurb: 'Inside one PR review: which parts call a model, and which are plain code.', reqId: ID.requestId, steps: llmSteps },
    { id: 'plugin', name: 'Plugin', blurb: 'What pr-reviewer does when Claude runs /pr-review. Claude drives every step; most steps are plugin scripts it calls.', reqId: ID.requestId, steps: pluginSteps },
    { id: 'redeliver', name: 'Redeliver', blurb: 'Re-send a saved call from Agent Studio. It runs again under a new request ID.', reqId: ID.newRequestId, steps: redeliverSteps },
  ]

  window.FLOW = { ID, workflows }
})()
